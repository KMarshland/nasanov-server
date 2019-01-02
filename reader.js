const WebSocket = require('ws');
const influxConnection = require('./influx.js');


const validate = require('./validate.js');

const MAX_RECENCY = 10; // ignore points that are more than this many seconds old
const CLOSE_TIMEOUT = 10000;

let WSS;

function init(server) {
    console.log('Initializing nasonov-reader');
    const wss = new WebSocket.Server({server});

    WSS = wss;
    wss.on('connection', function connected(ws, req) {});

    server.on('request', (request, response) => {connectToInflux(request, response)});

    connectToWriter();
}

function connectToInflux(request, response) {

    if(request.method === 'GET') {

        let requestQuery = new URL(request.url, 'https://habmc.stanfordssi.org/');

        if(requestQuery.pathname.search('/index') > 0) {

            let mission = requestQuery.pathname.substring(1, requestQuery.pathname.search('/index'));

            if (isNaN(mission)) {
                return;
            }

            influxConnection.then(function (influx) {

                influx.getMeasurements().then(names => {

                    let query = `select * from`;
                    names.forEach(name => {
                        query += ` ${name},`;
                    });
                    query = query.slice(0, -1);
                    query += ` where mission = '${mission}'`;

                    influx.query(query).then(result => {

                        let ids = {};
                        result.forEach(measure => {
                            if (!ids.hasOwnProperty(measure.id)) {
                                ids[measure.id] = measure.time;
                            }
                        });

                        response.setHeader("Access-Control-Allow-Origin", '*');
                        response.end(JSON.stringify(ids));

                    }).catch(function (err) {
                        console.error(`Error querying data from InfluxDB! ${err.stack}`);

                        if (WSS.readyState !== WebSocket.OPEN) {
                            return;
                        }

                        WSS.send(id + ':error:' + e);
                    });
                }).catch(function (err) {
                    console.error(`Error getting measurements! ${err.stack}`);

                    if (WSS.readyState !== WebSocket.OPEN) {
                        return;
                    }

                    WSS.send(id + ':error:' + e);
                });
            }).catch(function (err) {
                console.error(`Error connecting to InfluxDB! ${err.stack}`);

                if (WSS.readyState !== WebSocket.OPEN) {
                    return;
                }

                WSS.send(id + ':error:' + e);
            });

        } else {

            let mission = requestQuery.pathname.substring(1);

            if (isNaN(mission)) {
                return;
            }

            let ids = requestQuery.searchParams.getAll('ids[]');

            influxConnection.then(function (influx) {

                influx.getMeasurements().then(names => {

                    let queries = [];
                    ids.forEach(id => {

                        let query = `select * from`;
                        names.forEach(name => {
                            query += ` ${name},`;
                        });
                        query = query.slice(0, -1);
                        query += ` where (mission = '${mission}') and (id = '${id}')`;
                        queries.push(query);

                    });

                    influx.query(queries).then(result => {

                        let transmissions = [];
                        result.forEach(point => {
                            let transmission = {};
                            let names = point.groupRows.map((groupRow) => groupRow.name);
                            point.forEach(measurement => {
                                transmission[names.shift()] = measurement.value;
                            });
                            transmissions.push(transmission);
                        });

                        response.setHeader("Access-Control-Allow-Origin", '*');
                        response.end(JSON.stringify(transmissions));

                    }).catch(function (err) {
                        console.error(`Error querying data from InfluxDB! ${err.stack}`);

                        if (WSS.readyState !== WebSocket.OPEN) {
                            return;
                        }

                        WSS.send(id + ':error:' + e);
                    });
                }).catch(function (err) {
                    console.error(`Error getting measurements! ${err.stack}`);

                    if (WSS.readyState !== WebSocket.OPEN) {
                        return;
                    }

                    WSS.send(id + ':error:' + e);
                });
            }).catch(function (err) {
                console.error(`Error connecting to InfluxDB! ${err.stack}`);

                if (WSS.readyState !== WebSocket.OPEN) {
                    return;
                }

                WSS.send(id + ':error:' + e);
            });
        }
    }
}

function connectToWriter() {
    const timestamp = new Date().valueOf();
    const signature = validate.sign(timestamp);

    const ws = new WebSocket(process.env.WRITER_URL + '/' + timestamp + '/' + signature + '/listen');

    let closeTimeout = null;

    ws.on('error', function (err) {
        // close event will trigger a reconnect
        ws.close();
        console.log('Writer error: ' + err);
    });

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
