const WebSocket = require('ws');
const influxConnection = require('./influx.js');
const { handleHTTPRequest } = require('./reader-api.js');

const validate = require('./validate.js');

const MAX_RECENCY = 10; // ignore points that are more than this many seconds old
const CLOSE_TIMEOUT = 10000;

let WSS;
let keys = [];

/**
 * Initializes the reader server
 *
 * @param server - HTTP server to build the rest of the infrastructure around
 */
function init(server) {
    console.log('Initializing nasonov-reader');
    const wss = new WebSocket.Server({ server });

    WSS = wss;
    wss.on('connection', (ws) => {
        ws.on('error', console.error);
    });

    influxConnection.then(influx =>
        influx.getMeasurements()
    ).then(names => {
        keys = names;
    });

    // set it up to handle HTTP requests
    server.on('request', handleHTTPRequest);

    // handle the primary websocket duties
    connectToWriter();
}

/**
 * Creates the connection to the writer server, and forwards the transmissions onward
 */
function connectToWriter() {
    const timestamp = new Date().valueOf();
    const signature = validate.sign(timestamp);

    const writerWS = new WebSocket(process.env.WRITER_URL + '/' + timestamp + '/' + signature + '/listen');

    let closeTimeout = null;

    writerWS.on('error', function (err) {
        // close event will trigger a reconnect
        writerWS.close();
        console.log('Writer error: ' + err);
    });

    // reconnect on close
    writerWS.on('close', function () {
        console.log('Writer closed');

        if (closeTimeout) {
            clearTimeout(closeTimeout);
        }

        setTimeout(connectToWriter, 500);
    });

    writerWS.on('message', function (message) {

        // heartbeat
        if (/^\d+$/.test(message)) {
            console.log('Heartbeat');

            if (closeTimeout) {
                clearTimeout(closeTimeout);
            }

            closeTimeout = setTimeout(function () {
                console.log('No heartbeat, closing');
                writerWS.close();
            }, CLOSE_TIMEOUT);

            return;
        }

        handlePoint(JSON.parse(message));
    });
}

/**
 * Takes a partial point from the HTTP connection, parses it, and stores it until it's ready to be sent on
 *
 * @param {Object} point - the data point that it's parsing
 */
function handlePoint(point) {
    // if the timestamp is old, ignore the point
    if (point.timestamp < new Date().valueOf() - MAX_RECENCY*1000) {
        return;
    }

    for (let key in point) {
        if (!point.hasOwnProperty(key) || keys.includes(key)) {
            continue;
        }
        if (key == 'id' || key == 'timestamp' || key == 'mission') {
            continue;
        }
        keys.push(key);
    }

    console.log('nasanov-reader full point');

    WSS.clients.forEach(function each(client) {
        if (client.readyState !== WebSocket.OPEN) {
            return;
        }

        client.send(JSON.stringify(point));
    });
}

/**
 * Gets the list of measurements
 *
 * @return {Array}
 */
function getKeys() {
    return keys;
}

module.exports = {
    init,
    getKeys: getKeys
};
