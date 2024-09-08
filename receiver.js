require('dotenv').config();
const minimist = require('minimist')
const path = require("path");
const common = require("./common.js");
let wrtc = require("wrtc");
let fs = require("fs");
let crypto = require("crypto");
let argv = minimist(process.argv.slice(2));

if(argv._.length < 2) {
	console.info('Usage: wrtcft receive transferId [file] [server] [options]')
	console.info('Example: wrtcft receive <transferId> <server> <file> [options]')
	process.exit()
}

let transferId = argv._[1]
let file = argv._[2]
let server = argv._[3] || process.env.SERVER || argv.server

let socket = require("socket.io-client")(server);


let writer;
let localConnection;

let fileInfo;

socket.on("terminate",()=>{
	process.exit(0);
});
socket.on("transferError",(err)=>{
	console.log(err);
});
socket.on("initializeWriter",(data)=>{
	fileInfo = data;
	if(!file) {
		file = path.basename(fileInfo.file);
	}
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

		let low = 0;
		let iterations = 0;
		let startTime = Date.now();

		writerDataChannel.onbufferedamountlow = function(event){
			console.log("BUFFERED AMOUNT LOW !!\n",event);
			low ++;
		};

		writerDataChannel.onmessage = function(event) {
			iterations++;
			receivedSize+=event.data.byteLength;
			let perc = common.round(100*receivedSize/fileInfo.size);
			let elapsed = common.round((Date.now() - startTime)/1000);
			let speed = common.round(receivedSize / elapsed / 1024 / 1024, 2);
			common.printProgress(`Sending ${receivedSize} / ${fileInfo.size} ${perc}%  elapsed=${elapsed} speed=${speed} MB/s iterations=${iterations} low=${low}`);
			writer.write(Buffer.from(event.data));
		};


		writerDataChannel.onopen = function(event){
			// console.log("Receive data channel is opened");
		};

		writerDataChannel.onclose = function(event){
			// console.log(`Write data channel closed : ${localConnection.connectionState}`);
			common.calculateChecksum(file, checksum=>{
				// console.log("Received checksum", checksum);
				common.getFileSize(file, size => {
					// console.log("Received size", size);
					if(checksum === fileInfo.checksum && size === fileInfo.size) {
						console.log("\nTransfer finished");
						let elapsed = Date.now() - startTime;
						let totalTime = elapsed / 1000;
						let avgSpeed = common.round(receivedSize / totalTime / 1024 / 1024, 2);
						console.log(`Total time ${common.round(totalTime, 2)} sec average speed=${avgSpeed} MB/s`);
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
