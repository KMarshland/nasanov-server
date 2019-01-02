const fetch = require('node-fetch');
const RATE = 1; // in requests per second
const DURATION = 3<<20; // number of seconds it will send data for
const ACCEPTABLE_LATENCY = 1000; // ms it accepts for latency between transmissions
const KEY_COUNT = 20; // random keys to add to the transmission for benchmarking
const MISSION = 1;

const WRITER_URL = process.env.USE_PROD == 'TRUE' ? 'wss://nasonov-writer.herokuapp.com' : 'ws://localhost:5240';
const READER_URL = process.env.USE_PROD == 'TRUE' ? 'wss://nasonov-reader.herokuapp.com' : 'ws://localhost:5250';
const READER_URL_HTTP = process.env.USE_PROD == 'TRUE' ? 'http://nasonov-reader.herokuapp.com' : 'http://localhost:5250';


const WebSocket = require('ws');
const utilities = require('./test_utilities.js');

const validate = require('./validate.js');

let sentTransmissions = {};
let receivedTransmissions = {};

initializeWriter();
setTimeout(initializeReader, 2000);

function initializeWriter() {
    const timestamp = new Date().valueOf();
    const signature = validate.sign(timestamp);
    const writerSocket = new WebSocket(WRITER_URL + '/' + timestamp + '/' + signature);

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

            let transmission = utilities.randomTransmission(MISSION, KEY_COUNT);
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

    (fetch(READER_URL_HTTP + '/' + MISSION + '/index').then(response1 => response1.json())).then(ids => {
        let url = new URL(READER_URL_HTTP + '/' + MISSION);
        for (let i = 0; i < 10; i++) {
            url.searchParams.append('ids[]', Object.keys(ids)[i]);
        }
        fetch(url).then(response2 => response2.json()).then(body => console.log(body));
    });

    const readerSocket = new WebSocket(READER_URL);

    readerSocket.on('error', function (error) {
        console.log('Writer error', error);
    });

    readerSocket.on('close', function () {
        console.log('Reader socket closed');
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

