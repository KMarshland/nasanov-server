const WebSocket = require('ws');

const validate = require('./validate.js');

initializeWriter();
initializeReader();

function initializeWriter() {
    const timestamp = new Date().valueOf();
    const signature = validate.sign(timestamp);
    const writerSocket = new WebSocket('ws://nasanov.stanfordssi.org:5240/' + timestamp + '/' + signature);
    
    logSocket('writer', writerSocket, initializeWriter);
}

function initializeReader() {
    const readerSocket = new WebSocket('ws://nasanov.stanfordssi.org:5250/');

    logSocket('reader', readerSocket, initializeReader);
}

function logSocket(name, socket, retry) {
    console.log('Trying to connect to ' + name);

    socket.on('error', function (err) {
        console.log(name + ': Errored', err);
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
