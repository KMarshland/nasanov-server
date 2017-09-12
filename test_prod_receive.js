// for testing

const RATE = 1; // in requests per second
const DURATION = 10; // number of seconds it will send data for
const KEY_COUNT = 100; // random keys to add to the transmission for benchmarking
const ACCEPTABLE_LATENCY = 100; // ms it accepts for latency between transmissions

const WebSocket = require('ws');

const validate = require('./validate.js');
const utilities = require('./test_utilities.js');

initializeWriter();

let sentTransmissions = {};
let receivedTransmissions = {};

function initializeWriter() {
    const timestamp = new Date().valueOf();
    const signature = validate.sign(timestamp);
    const writerSocket = new WebSocket('wss://nasonov-writer.herokuapp.com/' + timestamp + '/' + signature);

    let sendTimeout;

    writerSocket.on('close', function () {
        console.log('Writer closed');
        if (sendTimeout){
            clearTimeout(sendTimeout);
        }
        setTimeout(initializeWriter, 500);
    });

    writerSocket.on('error', function (error) {
       console.log('Writer error', error);
    });

    writerSocket.on('open', function open() {
        const start = new Date().valueOf();
        sendTimeout = setTimeout(send, ACCEPTABLE_LATENCY);

        function send() {

            let transmission = utilities.randomTransmission(28, KEY_COUNT);
            console.log('nasanov-client send');

            sentTransmissions[transmission.id] = new Date().valueOf();

            writerSocket.send(JSON.stringify(transmission));

            const elapsedMS = new Date().valueOf() - start;
            if (elapsedMS / 1000 > DURATION) {
                setTimeout(function () {
                    utilities.endTest(sentTransmissions, receivedTransmissions, {
                        rate: RATE,
                        duration: DURATION,
                        acceptableLatency: ACCEPTABLE_LATENCY
                    })
                }, ACCEPTABLE_LATENCY);
                return;
            }

            sendTimeout = setTimeout(send, 1000 / RATE);
        }
    });

    writerSocket.on('message', function (message) {
        if (/^\d+$/.test(message)) {
            console.log('Heartbeat: ' + message);
            return;
        }

        const parts = message.split(':');
        const id = parts[0];
        const type = parts[1];

        if (type == 'success') {
            receivedTransmissions[id] = new Date().valueOf();
        }

        console.log(message);
    });
    //
    // writerSocket.on('close', function () {
    //     console.log('Socket closed unexpectedly');
    //     process.exit();
    // })
}
