const readline = require('readline');
const crypto = require("crypto");
const fs = require("fs");

function round(num, dec = 2) {
    let m = Math.pow(10, dec);
    return Math.round(num*m) / m;
}

function printProgress(progress){
    readline.clearLine(process.stdout, 0)
    readline.cursorTo(process.stdout, 0, null)
    process.stdout.write(`${progress}`);
}

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

module.exports = {
    round,
    printProgress,
    calculateChecksum,
    getFileSize
}