
const RATE = 10; // in requests per second
const DURATION = 3; // number of seconds it will send data for
const ACCEPTABLE_LATENCY = 100; // ms it accepts for latency between transmissions

const WebSocket = require('ws');

const validate = require('./validate.js');
const timestamp = new Date().valueOf();
const signature = validate.sign(timestamp);

const writerSocket = new WebSocket('ws://localhost:5240/' + timestamp + '/' + signature);
const readerSocket = new WebSocket('ws://localhost:5250');

let sentTransmissions = {};
let receivedTransmissions = {};


writerSocket.on('open', function open() {
    const start = new Date().valueOf();
    send();

    function send() {
        console.log('nasanov-client send');

        let transmission = JSON.stringify(randomTransmission());
        sentTransmissions[transmission] = new Date().valueOf();

        writerSocket.send(transmission);

        const elapsedMS = new Date().valueOf() - start;
        if (elapsedMS / 1000 > DURATION) {
            setTimeout(endTest, ACCEPTABLE_LATENCY);
            return;
        }

        setTimeout(send, 1000/RATE);
    }
});

readerSocket.on('open', function open() {
    readerSocket.on('message', function (transmission) {
        receivedTransmissions[transmission] = new Date().valueOf();
    });
});

/*
 * Analyzes results then terminates test
 */
function endTest(){
    let sent = 0;
    let received = 0;
    let fastResponses = 0;
    let totalLatency = 0;

    for (let key in sentTransmissions) {
        if (!sentTransmissions.hasOwnProperty(key)) {
            continue;
        }

        sent ++;

        if (!receivedTransmissions[key]){
            continue;
        }

        received++;
        let latency = receivedTransmissions[key] - sentTransmissions[key];

        totalLatency += latency;
        if (latency < ACCEPTABLE_LATENCY) {
            fastResponses ++;
        }
    }

    console.log(roundToPercent(received/sent) + "% received " +
        "(" + roundToPercent(fastResponses/received) + "% fast, " +
        "average latency " + Math.round(totalLatency/received) + "ms)");

    process.exit();

    function roundToPercent(decimal) {
        if (isNaN(decimal)) {
            return 0;
        }

        return Math.round(decimal * 1000) / 10;
    }
}

function randomTransmission() {
    return {
        altitude: randomInRange(0, 25000)
    }
}

function randomInRange(min, max) {
    return Math.random() * (max - min) + min;
}