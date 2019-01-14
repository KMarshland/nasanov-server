const uuid = require('node-uuid');

/*
 * Analyzes results then terminates test
 * constants must have duration, rate, and acceptableLatency
 */
function endTest(sentTransmissions, receivedTransmissions, constants){
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
        if (latency < constants.acceptableLatency) {
            fastResponses ++;
        }
    }

    console.log('');
    console.log('');
    console.log('');
    console.log(
        sent + ' transmissions sent (expected to send ' + constants.rate*constants.duration + '); ' +
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
function randomTransmission(mission, keyCount) {
    let data = {
        timestamp: new Date().valueOf(),

        altitude_barometer: randomInRange(0, 25000),
        latitude: randomInRange(-90, 90),
        longitude: randomInRange(-180, 180),

        mission: mission,
        id: uuid.v4()
    };

    for (let i = 0; i < keyCount; i++){
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

module.exports = {
    randomTransmission: randomTransmission,
    endTest: endTest
};
