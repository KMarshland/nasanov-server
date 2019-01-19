const WebSocket = require('ws');
const influxConnection = require('./influx.js');


const validate = require('./validate.js');

const MAX_RECENCY = 10; // ignore points that are more than this many seconds old
const CLOSE_TIMEOUT = 10000;

let WSS;
let keys = [];

function init(server) {
    console.log('Initializing nasonov-reader');
    const wss = new WebSocket.Server({ server });

    WSS = wss;
    wss.on('connection', function connected(ws, req) {});

    influxConnection.then(influx =>
        influx.getMeasurements()
    ).then(names => {
        keys = names;
    });

    server.on('request', respondToHTTPReq);

    connectToWriter();
}

function respondToHTTPReq(request, response) {

    if (request.method !== 'GET') {
        response.writeHead(400);
        response.end(JSON.stringify({error: 'Cannot post to reader'}));
        return;
    }

    response.setHeader("Access-Control-Allow-Origin", '*');
    let requestQuery = new URL(request.url, 'https://habmc.stanfordssi.org/');
    console.log(requestQuery.search);
    if(requestQuery.pathname.search('/index') > 0) {

        let mission = requestQuery.pathname.substring(1, requestQuery.pathname.search('/index'));

        if (!/^\d+$/.test(mission)) {
            response.writeHead(400);
            response.end('Wrong mission provided' );
            return;
        }

        respondToIDsQuery(mission, response);

    } else if (requestQuery.pathname.search('/data') > 0) {

        let mission = requestQuery.pathname.substring(1, requestQuery.pathname.search('/data'));

        if (!/^\d+$/.test(mission)) {
            response.writeHead(400);
            response.end('Wrong mission provided');
            return;
        }

        let timestamps = requestQuery.searchParams.getAll('timestamps[]');
        respondToTransmissionsQuery(mission, timestamps, response);

    } else {
        response.writeHead(400);
        response.end(JSON.stringify({error: 'Cannot do whatever youre doing to reader'}));
        return;
    }
}

function respondToIDsQuery(mission, response) {

    influxConnection.then(influx => {

        if (keys.length === 0) {
            response.end(JSON.stringify({}));
            return null;
        }

        let query = `select * from `;
        let namesString = keys.join(',');
        query += namesString;
        query += ` where mission = '${mission}'`;
        console.log(query);
        return influx.query(query);

    }).then(result => {

        let ids = {};

        if (result !== null) {
            result.forEach(measure => {
                if (!ids.hasOwnProperty(measure.id)) {
                    ids[measure.id] = measure.time._nanoISO;
                }
            });
        }
        response.end(JSON.stringify(ids));

    }).catch(function (err) {
        console.error(`Error querying data from InfluxDB! ${err.stack}`);
        console.error(err);

        response.writeHead(500);
        response.end(JSON.stringify({error: err.message}));
    });
}

function respondToTransmissionsQuery(mission, timestamps, response) {  // by time instead of id

    influxConnection.then(influx => {

        if (keys.length === 0) {
            response.end(JSON.stringify({}));
            return null;
        }

        let queries = [];
        timestamps.forEach(timestamp => {

            if (!/^(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z))^/.test(timestamp)) {
                response.writeHead(400);
                response.end('Wrong timestamps provided');
                return;
            }

            let query = `select * from `;
            let namesString = keys.join(',');
            query += namesString;
            query += ` where mission = '${mission}' and time >= '${timestamp.substring(0,timestamp.search(','))}' and time <= '${timestamp.substring(timestamp.search(',')+1)}'`;
            console.log(query);

            queries.push(query);
        });

        return influx.query(queries);

    }).then(result => {
        let transmissions = {};

        if (Array.isArray(result[0])) {
            result.forEach(timeGroup => {
                timeGroup.groupRows.forEach((group) => {
                    const name = group.name;

                    group.rows.forEach((point) => {
                        if (!transmissions[point.id]) {
                            transmissions[point.id] = {
                                'Human Time': point.time._nanoISO,
                                mission : Number(mission),
                                'timestamp' : new Date(point.time._nanoISO).valueOf()
                            };
                        }

                        transmissions[point.id][name] = point.value;
                    })
                });
            });
        } else {
            result.groupRows.forEach((group) => {
                const name = group.name;

                group.rows.forEach((point) => {
                    if (!transmissions[point.id]) {
                        transmissions[point.id] = {
                            'Human Time':point.time._nanoISO,
                            mission : Number(mission),
                            'timestamp' : new Date(point.time._nanoISO).valueOf()
                        };
                    }

                    transmissions[point.id][name] = point.value;
                })
            });
        }


        response.end(JSON.stringify(Object.values(transmissions)));

    }).catch(function (err) {
        console.error(`Error querying data from InfluxDB! ${err.stack}`);

        response.writeHead(500);
        response.end(JSON.stringify({error: err.message}));
    });
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

module.exports = {
    init: init
};
