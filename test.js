
const RATE = 1; // in requests per second
const DURATION = 3; // number of seconds it will send data for
const ACCEPTABLE_LATENCY = 100; // ms it accepts for latency between transmissions
const KEY_COUNT = 100; // random keys to add to the transmission for benchmarking

const WebSocket = require('ws');
const utilities = require('./test_utilities.js');

const validate = require('./validate.js');

let sentTransmissions = {};
let receivedTransmissions = {};

initializeWriter();
initializeReader();

function initializeWriter() {
    const timestamp = new Date().valueOf();
    const signature = validate.sign(timestamp);
    const writerSocket = new WebSocket('ws://localhost:5240/' + timestamp + '/' + signature);

    let sendTimeout;

    writerSocket.on('error', function (error) {
        console.log('Writer error', error);
    });

    writerSocket.on('close', function () {
        console.log('Writer closed');
        if (sendTimeout){
            clearTimeout(sendTimeout);
        }
        setTimeout(initializeWriter, 500);
    });

    writerSocket.on('open', function open() {
        const start = new Date().valueOf();
        sendTimeout = setTimeout(send, ACCEPTABLE_LATENCY);

        function send() {
            if (writerSocket.readyState !== WebSocket.OPEN) {
                return;
            }

            let transmission = utilities.randomTransmission(28, KEY_COUNT);
            console.log('nasanov-client send');

            sentTransmissions[hash(transmission)] = new Date().valueOf();

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
}

function initializeReader() {
    const readerSocket = new WebSocket('ws://localhost:5250');

    readerSocket.on('error', function () {
        setTimeout(initializeReader, 500);
    });

    readerSocket.on('open', function open() {
        readerSocket.on('message', function (transmission) {
            transmission = JSON.parse(transmission);
            receivedTransmissions[hash(transmission)] = new Date().valueOf();

            console.log('nasanov-client receive');
        });
    });
}

/*
 * Hashes an object to a string
 */
function hash(obj) {
    const precision = 2;
    const multiplier = Math.pow(10, precision);

    const keys = Object.keys(obj).sort();

    let values = [];
    keys.map(function (key) {
        let value = obj[key];

        if (typeof value == "number") {
            values.push(Math.round(value * multiplier) / multiplier);
        } else {
            values.push(value);
        }
    });

    return keys.join(',') + ':' + values.join(',');
}

