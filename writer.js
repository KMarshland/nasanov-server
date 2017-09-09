const WebSocket = require('ws');

const validate = require('./validate.js');
const influxConnection = require('./influx.js');

const HEARTBEAT_INTERVAL = 5000;

function init(wss) {
    console.log('Initializing nasanov-writer');

    wss.on('connection', function connected(ws, req) {
        let time = req.url.split('/')[1];
        let signature = req.url.split('/')[2];

        // forbid unauthorized access
        if (!validate.validate(time, signature)){
            return;
        }

        ws.on('message', function (message) {
            handleMessage(message, ws);
        });

        const interval = setInterval(function () {
            if (ws.readyState !== WebSocket.OPEN) {
                return;
            }

            ws.send(new Date().valueOf());
        }, HEARTBEAT_INTERVAL);

        ws.on('close', function () {
            clearInterval(interval);
        });
    });
}

function handleMessage(message, ws) {
    console.log('nasanov-writer receive');

    const data = JSON.parse(message);

    const timestamp = new Date(data.timestamp);
    const mission = data.mission;
    const id = data.id;
    const arity = Object.keys(data).length;

    let points = [];

    for (let key in data) {
        if (!data.hasOwnProperty(key)) {
            continue;
        }

        if (key == 'id' || key == 'timestamp' || key == 'mission') {
            continue;
        }

        points.push({
            measurement: key,
            tags: {
                mission: mission,
                id: id,
                arity: arity
            },
            fields: {
                value: data[key]
            },
            timestamp: timestamp
        });
    }

    influxConnection.then(function (influx) {
        influx.writePoints(points).catch(err => {
            console.error(`Error saving data to InfluxDB! ${err.stack}`)
        }).then(function () {
            if (ws.readyState !== WebSocket.OPEN) {
                return;
            }

            // send a confirmation that we stored the message with that id
            ws.send(id)
        });
    });

}

module.exports = {
    init: init
};
