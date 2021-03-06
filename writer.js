const WebSocket = require('ws');

const validate = require('./validate.js');
const influxConnection = require('./influx.js');

const HEARTBEAT_INTERVAL = 5000;

let WSS;

function init() {
    console.log('Initializing nasonov-writer');
    const wss = new WebSocket.Server({ port: process.env.PORT || 5000 });

    function autoclose(ws) {
        ws.close();
    }
    wss.on('connection', autoclose);

    WSS = wss;

    influxConnection.then(function () {
        console.log('nasonov-writer connected');

        wss.removeListener('connection', autoclose);

        wss.on('connection', function connected(ws, req) {
            const urlParts = req.url.split('/');
            let time = urlParts[1];
            let signature = urlParts[2];

            // forbid unauthorized access
            if (!validate.validate(time, signature)) {
                console.log('Invalid access');
                ws.send('Invalid access');
                ws.close();
                return;
            }

            const interval = setInterval(function () {
                if (ws.readyState !== WebSocket.OPEN) {
                    return;
                }

                ws.send(new Date().valueOf());
            }, HEARTBEAT_INTERVAL);

            ws.on('close', function () {
                clearInterval(interval);
            });

            let type = urlParts[3];
            if (type == 'listen') {
                ws.subscribed = true;
                return;
            }

            ws.on('message', function (message) {
                handleMessage(message, ws);
            });
        });
    });
}

function handleMessage(message, ws) {

    const data = JSON.parse(message);

    const timestamp = new Date(data.timestamp);
    const mission = data.mission;
    const id = data.id;

    let points = [{
        measurement: 'latency',
        tags: {
            mission: mission,
            id: id
        },
        fields: {
            value: new Date().valueOf() - timestamp.valueOf()
        },
        timestamp: timestamp
    }];

    for (let key in data) {
        if (!data.hasOwnProperty(key)) {
            continue;
        }

        if (key == 'id' || key == 'timestamp' || key == 'mission') {
            continue;
        }

        const value = data[key.toLowerCase().replace(/\s+/g, '_')];

        if (typeof value !== 'number') {
            continue;
        }

        points.push({
            measurement: key,
            tags: {
                mission: mission,
                id: id
            },
            fields: {
                value
            },
            timestamp: timestamp
        });
    }

    // log
    (function () {
        console.log('nasanov-writer receive');

        if (ws.readyState !== WebSocket.OPEN) {
            return;
        }

        ws.send(id + ':receive');
    })();

    influxConnection.then(function (influx) {
        influx.writePoints(points).then(function () {
            if (ws.readyState !== WebSocket.OPEN) {
                return;
            }

            // send a confirmation that we stored the message with that id
            ws.send(id + ':success');
        }).catch(function (err) {
            console.error(`Error saving data to InfluxDB! ${err.stack}`);

            if (ws.readyState !== WebSocket.OPEN) {
                return;
            }

            ws.send(id + ':error:' + e);
        });
    }).catch(function (err) {
        console.error(`Error saving data to InfluxDB! ${err.stack}`);

        if (ws.readyState !== WebSocket.OPEN) {
            return;
        }

        ws.send(id + ':error:' + e);
    });

    WSS.clients.forEach(function each(client) {
        if (client.readyState !== WebSocket.OPEN) {
            return;
        }

        if (!client.subscribed) {
            return;
        }

        client.send(JSON.stringify(data));
    });

}

module.exports = {
    init: init
};
