const WebSocket = require('ws');

const validate = require('./validate.js');

const MAX_RECENCY = 10; // ignore points that are more than this many seconds old
const CLOSE_TIMEOUT = 10000;

let WSS;

function init(wss) {
    console.log('Initializing nasonov-reader');
    
    WSS = wss;
    wss.on('connection', function connected(ws, req) {});

    connectToWriter();
}

function connectToWriter() {
    const timestamp = new Date().valueOf();
    const signature = validate.sign(timestamp);

    const ws = new WebSocket(process.env.WRITER_URL + '/' + timestamp + '/' + signature + '/listen');

    let closeTimeout = null;

    // reconnect on close
    ws.on('close', function () {
        console.log('Writer closed');

        if (closeTimeout) {
            clearTimeout(closeTimeout);
        }

        setTimeout(connectToWriter, 500);
    });

    ws.on('message', function (message) {

        // heartbeat
        if (/^\d+$/.test(message)) {
            console.log('Heartbeat');

            if (closeTimeout) {
                clearTimeout(closeTimeout);
            }

            closeTimeout = setTimeout(function () {
                console.log('No heartbeat, closing');
                ws.close();
            }, CLOSE_TIMEOUT);

            return;
        }

        handlePoint(JSON.parse(message));
    });
}

/*
 * Takes a partial point from the HTTP connection, parses it, and stores it until it's ready to be sent on
 */
function handlePoint(point) {
    // if the timestamp is old, ignore the point
    if (point.timestamp < new Date().valueOf() - MAX_RECENCY*1000) {
        return;
    }

    console.log('nasanov-reader full point');

    WSS.clients.forEach(function each(client) {
        if (client.readyState !== WebSocket.OPEN) {
            return;
        }

        client.send(JSON.stringify(point));
    });
}

module.exports = {
    init: init
};
