const WebSocket = require('ws');
const influxConnection = require('./influx.js');


const validate = require('./validate.js');

const MAX_RECENCY = 10; // ignore points that are more than this many seconds old
const CLOSE_TIMEOUT = 10000;

let WSS;

function init(server) {
    console.log('Initializing nasonov-reader');
    const wss = new WebSocket.Server({ server });

    WSS = wss;
    wss.on('connection', function connected(ws, req) {});

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

    if(requestQuery.pathname.search('/index') > 0) {

        let mission = requestQuery.pathname.substring(1, requestQuery.pathname.search('/index'));

        if (!/^\d+$/.test(mission)) {
            response.writeHead(400);
            response.end('Wrong mission provided' );
            return;
        }

        respondToIDsQuery(mission, response);

    } else {

        let mission = requestQuery.pathname.substring(1);

        if (!/^\d+$/.test(mission)) {
            response.writeHead(400);
            response.end('Wrong mission provided');
            return;
        }

        let ids = requestQuery.searchParams.getAll('ids[]');
        respondToTransmissionsQuery(mission, ids, response);
    }
}

function respondToIDsQuery(mission, response) {
    let influx;

    influxConnection.then(influxd => {
        influx = influxd;
        return influx.getMeasurements();

    }).then((names) => {

        let query = `select * from`;
        names.forEach(name => {
            query += ` ${name},`;
        });
        query = query.slice(0, -1);
        query += ` where mission = '${mission}'`;

        return influx.query(query);

    }).then(result => {

        let ids = {};
        result.forEach(measure => {
            if (!ids.hasOwnProperty(measure.id)) {
                ids[measure.id] = measure.time;
            }
        });

        response.end(JSON.stringify(ids));

    }).catch(function (err) {
        console.error(`Error querying data from InfluxDB! ${err.stack}`);

        response.writeHead(500);
        response.end(JSON.stringify({error: err.message}));;
    });
}

function respondToTransmissionsQuery(mission, ids, response) {
    let influx;

    influxConnection.then(influxd => {
        influx = influxd;
        return influx.getMeasurements();

    }).then(names => {
        let queries = [];
        ids.forEach(id => {

            if (!/^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i.test(id)) {
                response.writeHead(400);
                response.end('Wrong ids provided');
                return;
            }

            let query = `select * from`;
            names.forEach(name => {
                query += ` ${name},`;
            });
            query = query.slice(0, -1);
            query += ` where (mission = '${mission}') and (id = '${id}')`;
            queries.push(query);

        });

        return influx.query(queries);

    }).then(result => {

        let transmissions = [];
        result.forEach(point => {
            let transmission = {};
            let names = point.groupRows.map((groupRow) => groupRow.name);
            point.forEach(measurement => {
                transmission[names.shift()] = measurement.value;
            });
            transmissions.push(transmission);
        });

        response.end(JSON.stringify(transmissions));

    }).catch(function (err) {
        console.error(`Error querying data from InfluxDB! ${err.stack}`);

        response.writeHead(500);
        response.end(JSON.stringify({error: err.message}));;
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
