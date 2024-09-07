let socket = require("socket.io-client")("http://localhost:5000");
let wrtc = require("wrtc");
let fs = require("fs");
let crypto = require("crypto");

let writer;
let localConnection;
let readerDataChannel;

let file = `recieved`
let transferId = "abc";
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
socket.on("initializeWriter",(data)=>{
	fileInfo = data;
	writer = fs.createWriteStream(file);
});
socket.on("error", (err) => {
	console.log("Error on the client ",err);
});
socket.on("receiveCandidate",(candidate)=>{
	receiveCandidate(candidate);
});

socket.on("receiveOffer",(offer)=>{
	receiveOffer(offer);
});

socket.on("connect",()=>{
	console.log("Connected to server");
	let data = {
		transferId
	};
	socket.emit("receive",data);
});


function receiveCandidate(candidate) {
	localConnection.addIceCandidate(new wrtc.RTCIceCandidate(candidate)).then(()=> {
		// console.log("Added candidate", candidate.candidate);
	}).catch(err => {
		console.error("Error added candidate", err);
	});
}

function updateProgress(progress) {
	process.stdout.clearLine();  // clear the current line
	process.stdout.cursorTo(0);  // move the cursor to the beginning of the line
	process.stdout.write(progress);
}

//recieving the offer from the remote connection
function receiveOffer(offer) {
	// console.log("Received offer",offer);

	let configuration = {
		"iceServers": [{ "urls": "stun:stun2.1.google.com:19302" }]
	};

	localConnection = new wrtc.RTCPeerConnection(configuration);

	localConnection.setRemoteDescription(new wrtc.RTCSessionDescription(offer));
	
	localConnection.createAnswer().then((answer) => {
		localConnection.setLocalDescription(answer).then(()=>{
			let data = {};
			data.transferId = transferId;
			data.answer = localConnection.localDescription;
			socket.emit("sendingAnswer",data);
		});
	}).catch(function(error){
		console.log("Error in answer : ",error);
	});

	localConnection.onicecandidate = function (event) {
		if (event.candidate) {
			// console.log("ICE Candidate found",event.candidate.candidate);
			socket.emit("candidate",{
				type: 'receiver',
				candidate: event.candidate,
				transferId : transferId
			});
		}
	};

	localConnection.onerror = function(err){
		console.log(`Error occured ${err}`);
		console.log(`Connection state : ${localConnection.connectionState}`);
	};

	localConnection.ondatachannel = function(event) {
		let writerDataChannel = event.channel;

		let receivedSize = 0;

		writerDataChannel.onbufferedamountlow = function(event){
			console.log("BUFFERED AMOUNT LOW !!\n",event);
		};

		writerDataChannel.onmessage = function(event) {
			receivedSize+=event.data.byteLength;
			let perc = Math.round(100*receivedSize/fileInfo.size);
			updateProgress(`Sending ${receivedSize} / ${fileInfo.size} ${perc}%`);
			writer.write(Buffer.from(event.data));
		};


		writerDataChannel.onopen = function(event){
			// console.log("Receive data channel is opened");
		};

		writerDataChannel.onclose = function(event){
			// console.log(`Write data channel closed : ${localConnection.connectionState}`);
			calculateChecksum(file, checksum=>{
				// console.log("Received checksum", checksum);
				getFileSize(file, size => {
					// console.log("Received size", size);
					if(checksum === fileInfo.checksum && size === fileInfo.size) {
						console.log("\nTransfer finished");
					} else {
						console.error("\nError transferring file");
					}
					process.exit(0);
				})
			});

		};
		writerDataChannel.onconnectionstatechange = function(event){
			console.log(`Connection's state changed to : ${localConnection.connectionState}`);
		};

		writerDataChannel.onerror = function(event){
			console.log("Error : ",event);
		};


	};
	
}
