require('dotenv').config();
let wrtc = require("wrtc");
let fs = require("fs");
const crypto = require("crypto");
const common = require("./common.js");
const minimist = require('minimist');

let argv = minimist(process.argv.slice(2));
if(argv._.length < 2) {
	console.info('Usage: wrtcft send file [server] [options]')
	console.info('Example: wrtcft send /path/to/file http://127.0.0.1:5000 [options]')
	process.exit()
}

let file = argv._[1]
let server = argv._[2] || process.env.SERVER || argv.server;

console.log("Connecting to server: ", server);

let socket = require("socket.io-client")(server);

let reader;
let localConnection;
let readerDataChannel;

let transferId = argv.transferId;
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

	readerDataChannel.bufferedAmountLowThreshold = process.env.BUFFER_SIZE || 65536; // 64kb

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

		let startTime = Date.now();

		let iterations = 0;
		let low= 0;
		let high = 0;

		setTimeout(function(){
			reader.on("data",function(chunk){
				iterations ++;
				if(readerDataChannel.bufferedAmount < readerDataChannel.bufferedAmountLowThreshold){
					// console.log("Low ",readerDataChannel.bufferedAmount);
					low++;
				}else{
					reader.pause();
					high++;
					// console.log("High ",readerDataChannel.bufferedAmount);
					setTimeout(function(){
						reader.resume();
					},process.env.BUFFER_WAIT || 100);

				}
				sizeSent+=chunk.byteLength;
				let perc = Math.round(100*sizeSent/fileInfo.size);
				let elapsed = Date.now() - startTime;
				let speed = common.round(sizeSent / (elapsed /1000) / 1024 / 1024, 2);
				common.printProgress(`Sending ${sizeSent} / ${fileInfo.size} ${perc}% elapsed=${elapsed} speed=${speed} MB/s iteratiions=${iterations} low=${low} high=${high}`);
				readerDataChannel.send(chunk);
			});

			reader.on("close",function(){
				console.log("\nTransfer completed");
				let elapsed = Date.now() - startTime;
				let totalTime = elapsed / 1000;
				let avgSpeed = common.round(sizeSent / totalTime / 1024 / 1024, 2);
				console.log(`Total time ${common.round(totalTime, 2)} sec average speed=${avgSpeed} MB/s`);
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
			transferId =
			fileInfo = {
				file,
				checksum,
				size,
				transferId
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
