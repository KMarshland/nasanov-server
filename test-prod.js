const WebSocket = require('ws');

const validate = require('./validate.js');

initializeWriter();

function initializeWriter() {
    const timestamp = new Date().valueOf();
    const signature = validate.sign(timestamp);
    const writerSocket = new WebSocket('ws://nasanov-writer.azurewebsites.net/' + timestamp + '/' + signature);

    writerSocket.on('error', function () {
        console.log('Errored');
        setTimeout(initializeWriter, 500);
    });

    writerSocket.on('open', function open() {
        console.log('Opened');
    });

    writerSocket.on('close', function() {
        console.log('Closed');
    });

    writerSocket.on('message', function(message) {
        console.log(message);
    });
}