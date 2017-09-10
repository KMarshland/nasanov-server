const WebSocket = require('ws');

const validate = require('./validate.js');

initializeWriter();
initializeReader();

function initializeWriter() {
    const timestamp = new Date().valueOf();
    const signature = validate.sign(timestamp);
    const writerSocket = new WebSocket('wss://nasanov-writer.azurewebsites.net/' + timestamp + '/' + signature);
    
    logSocket('writer', writerSocket, initializeWriter);
}

function initializeReader() {
    const readerSocket = new WebSocket('wss://nasanov-reader.azurewebsites.net/');

    logSocket('reader', readerSocket, initializeReader);
}

function logSocket(name, socket, retry) {
    socket.on('error', function () {
        console.log(name + ': Errored');
        setTimeout(retry, 500);
    });

    socket.on('open', function open() {
        console.log(name + ': Opened');
    });

    socket.on('close', function() {
        console.log(name + ': Closed');
    });

    socket.on('message', function(message) {
        console.log(name + ': ' + message);
    });
}
