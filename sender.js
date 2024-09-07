let socket = require("socket.io-client")("http://localhost:5000");
let wrtc = require("wrtc");
let fs = require("fs");
const crypto = require("crypto");

let reader;
let localConnection;
let readerDataChannel;

let file = '/home/marko/Downloads/Z790-Pro-RS-Wifi_12.01.ROM'
// let file = '/home/marko/Downloads/serbia-latest.osm.pbf'
// let file = 'file.txt'
let transferId;
let fileInfo;

function calculateChecksum(filePath, callback) {
	const hash = crypto.createHash('sha256');
	const fileStream = fs.createReadStream(filePath);

	fileStream.on('data', (chunk) => hash.update(chunk));
	fileStream.on('end', () => callback(hash.digest('hex')));
}

function getFileSize(filePath, callback) {
	fs.stat(filePath, (err, stats) => {
		if (err) throw err;
		callback(stats.size);
	});
}

function updateProgress(progress) {
	process.stdout.clearLine();  // clear the current line
	process.stdout.cursorTo(0);  // move the cursor to the beginning of the line
	process.stdout.write(progress);
}

socket.on("terminate",()=>{
	process.exit(0);
});
socket.on("setTransferId",(id)=>{
	transferId = id;
	console.log(`The key for this transfer session is : ${transferId}`)
});
socket.on("error", (err) => {
	console.log("Error on the client ",err);
});
socket.on("receiveCandidate",(candidate)=>{
	receiveCandidate(candidate);
});
socket.on("candidates",()=> {
	// console.log("Setup WebRtc connection");
	let configuration = {
		"iceServers": [{ "urls": "stun:stun2.1.google.com:19302" }] 
	}; 
   
	localConnection = new wrtc.RTCPeerConnection(configuration); 

	localConnection.onicecandidate = function (event) { 
		if (event.candidate) { 
			// console.log("ICE Candidate found ", event.candidate.candidate);
			socket.emit("candidate",{ 
				type: "sender",
				candidate: event.candidate,
				transferId : transferId
			}); 
		} 
	}; 

	localConnection.onerror = function(err){
		console.log(`Error occured ${err}`);
		console.log(`Connection state : ${localConnection.connectionState}`);
	};

	const dataChannelConfig = {
		ordered: true, // order of data send is important
		binaryType:"arraybuffer",
	};

	readerDataChannel = localConnection.createDataChannel("FileTransferChannel", dataChannelConfig); 

	readerDataChannel.bufferedAmountLowThreshold = 65536; // 64kb

	readerDataChannel.onbufferedamountlow = function(){
		console.log("BUFFER AMOUNT LOW!!");
	};

	readerDataChannel.onopen = function(event){
		// console.log(`Reader data channel is opened ${localConnection.connectionState}`);
		let data = {};
		data.transferId = transferId;
		socket.emit("initializeWriter",transferId);
		try {
			reader = fs.createReadStream(file);
		} catch (error) {
			console.log("Some problem occured, try again");
			process.exit(0);
		}

		let sizeSent = 0;

		setTimeout(function(){
			reader.on("data",function(chunk){
				if(readerDataChannel.bufferedAmount < readerDataChannel.bufferedAmountLowThreshold){
					// console.log("Low ",readerDataChannel.bufferedAmount);
				}else{
					reader.pause();
					// console.log("High ",readerDataChannel.bufferedAmount);
					setTimeout(function(){
						reader.resume();
					},100);

				}
				sizeSent+=chunk.byteLength;
				let perc = Math.round(100*sizeSent/fileInfo.size);
				updateProgress(`Sending ${sizeSent} / ${fileInfo.size} ${perc}%`);
				readerDataChannel.send(chunk);
			});

			reader.on("close",function(){
				console.log("\nTransfer completed");
				readerDataChannel.close();
				setTimeout(()=>{
					process.exit(0);
				},1000);
			});
		},100);  //3 second timeout before starting the transfer
	};

	readerDataChannel.onerror = function (error) { 
		console.log(`Error occured on Data Channel 1: ${error}`); 
	}; 

	readerDataChannel.onmessage = function (event) {
		console.log(`Message on Data Channel 1 : ${event}`);
	};

	readerDataChannel.onclose = function () { 
		// console.log(`Reader data channel is closed ${localConnection.connectionState}`);
	};

	readerDataChannel.onconnectionstatechange = function(){
		console.log(`Reader data channel connection state changed to ${localConnection.connectionState}`);
	};
   
  
});

socket.on("sendOffer",()=>{
	localConnection.createOffer().then((offer)=> {
		localConnection.setLocalDescription(offer).then(()=>{
			let data = {};
			data.offer = localConnection.localDescription;
			data.transferId = transferId;
			socket.emit("sendingOffer",data);
		});
	}).catch(err=>{
		console.log("Error creating offer : ",err);
	});
});

socket.on("receiveAnswer",(answer)=>{
	receiveAnswer(answer);
});

socket.on("connect",()=>{
	console.log("Connected to server");
	calculateChecksum(file, checksum => {
		getFileSize(file, size => {
			fileInfo = {
				file,
				checksum,
				size
			};
			console.log("Sending file ", file, size);
			socket.emit("send",fileInfo);
		})
	})
});


function receiveCandidate(candidate) {
	localConnection.addIceCandidate(new wrtc.RTCIceCandidate(candidate)); 
}

//recieving the answer from the remote connection
function receiveAnswer(answer) {
	// console.log("Received answer", answer);
	localConnection.setRemoteDescription(new wrtc.RTCSessionDescription(answer)); 
}
