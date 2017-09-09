const InfluxSubscriber = require('influx-subscriber');
const server = new InfluxSubscriber();

function init(wss) {
    console.log('Initializing nasanov-reader');

    let clients = [];

    // listen for client connections
    wss.on('connection', function (ws) {
        clients.push(ws);
    });

    // listen for new data
    server.on('point', function (point) {
        console.log(JSON.stringify(point));

        clients.map(function (client) {
            client.send(JSON.stringify(point));
        })
    });
}

module.exports = {
    init: init
};
