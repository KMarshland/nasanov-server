
const RATE = 500; // in requests per second
const DURATION = 3; // number of seconds it will send data for
const ACCEPTABLE_LATENCY = 100; // ms it accepts for latency between transmissions
const KEY_COUNT = 100; // random keys to add to the transmission for benchmarking

const WebSocket = require('ws');
const uuid = require('node-uuid');

const validate = require('./validate.js');

let sentTransmissions = {};
let receivedTransmissions = {};

initilizeWriter();
initializeReader();

function initilizeWriter() {
    const timestamp = new Date().valueOf();
    const signature = validate.sign(timestamp);
    const writerSocket = new WebSocket('ws://localhost:5240/' + timestamp + '/' + signature);

    writerSocket.on('error', function () {
        setTimeout(initilizeWriter, 500);
    });

    writerSocket.on('open', function open() {
        const start = new Date().valueOf();
        send();

        function send() {

            let transmission = randomTransmission();
            console.log('nasanov-client send');

            sentTransmissions[hash(transmission)] = new Date().valueOf();

            writerSocket.send(JSON.stringify(transmission));

            const elapsedMS = new Date().valueOf() - start;
            if (elapsedMS / 1000 > DURATION) {
                setTimeout(endTest, ACCEPTABLE_LATENCY);
                return;
            }

            setTimeout(send, 1000 / RATE);
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
 * Analyzes results then terminates test
 */
function endTest(){
    let sent = Object.keys(sentTransmissions).length;
    let receivedCorrectly = 0;
    let received = Object.keys(receivedTransmissions).length;
    let fastResponses = 0;
    let latencies = [];

    for (let key in sentTransmissions) {
        if (!sentTransmissions.hasOwnProperty(key)) {
            continue;
        }

        if (!receivedTransmissions[key]){
            continue;
        }

        receivedCorrectly++;
        let latency = receivedTransmissions[key] - sentTransmissions[key];

        latencies.push(latency);
        if (latency < ACCEPTABLE_LATENCY) {
            fastResponses ++;
        }
    }

    console.log('');
    console.log('');
    console.log('');
    console.log(
        sent + ' transmissions sent (expected to send ' + RATE*DURATION + '); ' +
        received + ' received (' + roundToPercent(received/sent) + '%)'
    );
    console.log(
        roundToPercent(receivedCorrectly/sent) + "% received correctly " +
        "(" + roundToPercent(fastResponses/receivedCorrectly) + "% fast, " +
        "50/95/99 latencies: " + getPercentile(50, latencies) + "/" + getPercentile(95, latencies) + "/" + getPercentile(99, latencies) + " ms)"
    );
    console.log('');
    console.log('');
    console.log('');

    process.exit();

    function roundToPercent(decimal) {
        if (isNaN(decimal)) {
            return 0;
        }

        return Math.round(decimal * 1000) / 10;
    }
}

/*
 * Creates a random transmission
 */
function randomTransmission() {
    let data = {
        timestamp: new Date().valueOf(),

        // altitude: randomInRange(0, 25000),
        // latitude: randomInRange(90, 90),
        // longitude: randomInRange(-180, 180),

        mission: '51',
        id: uuid.v4()
    };

    for (let i = 0; i < KEY_COUNT; i++){
        data['key' + i] = Math.random();
    }

    return data;
}

/*
 * Returns a random number within a range
 */
function randomInRange(min, max) {
    return Math.random() * (max - min) + min;
}

function getPercentile(percentile, array) {
    array.sort();

    let index = (percentile/100) * array.length;

    return array[Math.floor(index)];
}

/*
 * Hashes an object to a string
 */
function hash(obj) {
    const precision = 4;
    const multiplier = Math.pow(10, precision);

    const keys = Object.keys(obj).sort();

    let values = [];
    keys.map(function (key) {
        let value = obj[key];

        if (typeof value == "number") {
            values.push(Math.round(value * precision) / precision);
        } else {
            values.push(value);
        }
    });

    return keys.join(',') + ':' + values.join(',');
}

