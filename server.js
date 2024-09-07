const http = require("http").createServer();
const io = require("socket.io")(http);
const port = process.env.PORT || 5000;
const uniqid = require("uniqid");

let transfers = {};

io.on("connection",(socket)=>{
	console.log("connected client ", socket.id);

	socket.on("initializeWriter",(transferId)=>{
		let data = transfers[transferId].sender.fileInfo;
		transfers[transferId].reciever.socket.emit("initializeWriter",data);
	});

	socket.on("error",(data)=>{
		console.log("Error in the server ",data);
	});

	socket.on("candidate",(data)=>{
		let transferId = data.transferId;
		if(data.type === "receiver"){
			console.log("Was the receiver and found the candidates", data.candidate.candidate);
			transfers[transferId].sender.socket.emit("receiveCandidate",data.candidate);
		} else if (data.type === "sender") {
			console.log("Was the sender and found the candidates", data.candidate.candidate);
			transfers[transferId].reciever.socket.emit("receiveCandidate",data.candidate);
		}
	});

	socket.on("sendingOffer",(data)=>{
		console.log("sendingOffer",data);
		let transferId = data.transferId;
		transfers[transferId].reciever.socket.emit("receiveOffer",data.offer);
	});

	socket.on("sendingAnswer",(data)=>{
		let transferId = data.transferId;
		console.log("Sending answer");
		transfers[transferId].sender.socket.emit("receiveAnswer",data.answer);
	});

	socket.on("send",(fileInfo)=>{
		console.log("Received send file", fileInfo.file, fileInfo.size);
		let transferId = uniqid();
		transferId  ="abc";
		transfers[transferId]={};
		transfers[transferId].sender = {};
		transfers[transferId].sender.fileInfo = fileInfo;
		transfers[transferId].sender.transferid = transferId;
		transfers[transferId].sender.socket = socket;
		socket.emit("setTransferId",transferId);
	})

	socket.on("receive",(data, cb)=>{
		let transferId = data.transferId;
		console.log("Received request for transfer", transferId);
		socket.join(transferId);
		let transfer = transfers[transferId];
		if(transfer) {
			transfer.reciever = {};
			transfer.reciever.socket = socket;
			transfer.sender.socket.emit("candidates");
			transfer.reciever.socket.emit("candidates");
			transfer.sender.socket.emit("sendOffer");
		}
	});

	socket.on("disconnect", (event) => {
		console.log("Disconnected", socket.id);
	});

});

http.listen(port, () => console.log(`Server running on port: ${port}`));

