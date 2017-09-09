const validate = require('./validate.js');
const influx = require('./influx.js');

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
    });
}

function handleMessage(message, ws) {
    console.log('nasanov-writer receive');

    const data = JSON.parse(message);
    const timestamp = new Date(data.timestamp);
    const mission = data.mission;

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
                mission: mission
            },
            fields: {
                value: data[key]
            },
            timestamp: timestamp
        });
    }

    influx.writePoints(points).catch(err => {
        console.error(`Error saving data to InfluxDB! ${err.stack}`)
    }).then(function () {
        // send a confirmation that we stored the message with that id
        ws.send(data.id)
    });

}

module.exports = {
    init: init
};
