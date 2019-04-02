const influxConnection = require('./influx.js');

let keys = [];

/**
 * Base handler of all HTTP requests
 * Figures out what the HTTP request is trying to do, then delegates it to the proper method
 *
 * @param request
 * @param response
 */
function handleHTTPRequest(request, response) {

    response.setHeader("Access-Control-Allow-Origin", '*');

    if (request.method === 'OPTIONS') {
        response.writeHead(200);
        response.end();
        return;
    }

    if (request.method !== 'GET') {
        response.writeHead(400);
        response.end(JSON.stringify({
            error: 'Cannot post to reader'
        }));
        return;
    }


    let requestQuery = new URL(request.url, 'https://habmc.stanfordssi.org/');
    console.log(requestQuery.search);
    if(requestQuery.pathname.search('/index') > 0) {

        let mission = requestQuery.pathname.substring(1, requestQuery.pathname.search('/index'));

        if (!/^\d+$/.test(mission)) {
            response.writeHead(400);
            response.end('Wrong mission provided' );
            return;
        }

        findIndex(mission, response);

    } else if (requestQuery.pathname.search('/data') > 0) {

        let mission = requestQuery.pathname.substring(1, requestQuery.pathname.search('/data'));

        if (!/^\d+$/.test(mission)) {
            response.writeHead(400);
            response.end('Wrong mission provided');
            return;
        }

        let timestamps = requestQuery.searchParams.getAll('timestamps');
        respondToTransmissionsQuery(mission, timestamps, response);

    } else {
        response.writeHead(400);
        response.end(JSON.stringify({error: 'Cannot do whatever youre doing to reader'}));
        return;
    }
}

function findIndex(mission, response) {

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

        let ids = [];
        let idsPushed = new Set();

        if (result !== null) {
            result.forEach(measure => {
                if (!idsPushed.has(measure.id)) {
                    ids.push([measure.id, measure.time._nanoISO]);
                    idsPushed.add(measure).id;
                }
            });
        }
        let resp = {'index': ids};
        response.end(JSON.stringify(resp));

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

        if (!/^(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z))^/.test(timestamps)) {
            response.writeHead(400);
            response.end('Wrong timestamps provided');
            return;
        }
        let timestamp = timestamps[0];

        let query = `select * from `;
        let namesString = keys.join(',');
        query += namesString;
        query += ` where mission = '${mission}' and time >= '${timestamp.substring(0,timestamp.search(','))}' and time <= '${timestamp.substring(timestamp.search(',')+1)}'`;
        console.log(query);

        return influx.query(query);

    }).then(result => {
        let transmissions = {};

        result.groupRows.forEach((group) => {
            const name = group.name;

            group.rows.forEach((point) => {
                if (!transmissions[point.id]) {
                    transmissions[point.id] = {
                        'Human Time':point.time._nanoISO,
                        mission : Number(mission),
                        'timestamp' : new Date(point.time._nanoISO).valueOf(),
                        id : point.id
                    };
                }

                transmissions[point.id][name] = point.value;
            })
        });

        response.setHeader("Content-Type", 'application/json');

        response.end(JSON.stringify(Object.values(transmissions)));

    }).catch(function (err) {
        console.error(`Error querying data from InfluxDB! ${err.stack}`);

        response.writeHead(500);
        response.end(JSON.stringify({error: err.message}));
    });
}

module.exports = {
    handleHTTPRequest: handleHTTPRequest
};
