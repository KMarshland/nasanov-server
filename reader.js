const WebSocket = require('ws');

const influxConnection = require('./influx.js');
const http = require('http');
const os = require('os');
const { StringDecoder } = require('string_decoder');

const SUBSCRIPTION_NAME = 'influx_subscriber';
const PORT = process.env.PORT;

const HOST = ((os.networkInterfaces()['eth1'] || [])[0] || {}).address || '127.0.0.1';
const LISTENER_HOST = process.env.LISTENER_HOST || HOST;

const MAX_RECENCY = 10; // ignore points that are more than this many seconds old

let wss;
let pointBuffer = {};

function init() {
    console.log('Initializing nasonov-reader');

    const requestHandler = function (req, response) {
        if (req.headers['user-agent'] != 'InfluxDBClient') {
            response.send(403);
            response.end('error');
            return;
        }

        let body = [];
        req.on('data', (chunk) => {
            body.push(chunk);
        }).on('end', () => {
            body = Buffer.concat(body).toString();
            handlePoint(body);
        });

        response.end('success');
    };
    const server = http.createServer(requestHandler);

    wss = new WebSocket.Server({ server });


    // listen for new data
    configureInflux().then(function () {
        console.log('nasanov-reader connected');

        server.listen(PORT, (err) => {
            if (err) {
                return console.log('something bad happened', err)
            }

            console.log(`server is listening`)
        });
    }).catch(function (err) {
        console.error(err);
        process.exit();
    });
}

/*
 * Takes a partial point from the HTTP connection, parses it, and stores it until it's ready to be sent on
 */
function handlePoint(point) {

    // parse the point

    const parts = point.split(' ');

    const tagBits = parts[0].split(',');

    const key = tagBits[0];
    let tags = {};

    for (let i = 1; i < tagBits.length; i++){
        let sides = tagBits[i].split('=');
        tags[sides[0]] = sides[1];
    }
    const id = tags.id;
    const mission = tags.mission;
    const arity = parseInt(tags.arity);

    if (!id || !mission || !arity) {
        throw "Corrupted data";
    }

    const value = parseFloat(parts[1].split('=')[1]);

    const timestamp = parseInt(parts[2]) / 1000 / 1000; // convert from ns to ms

    // if the timestamp is old, ignore the point
    if (timestamp < new Date().valueOf() - MAX_RECENCY*1000) {
        return;
    }

    // store the point in the buffer
    let data = pointBuffer[id];
    if (!data) {
        data = {
            id: id,
            mission: parseInt(mission),
            timestamp: timestamp
        };
        pointBuffer[id] = data;
    }

    data[key] = value;

    // stop if there's still data to be received
    if (Object.keys(data).length != arity) {
        return;
    }

    // send it on!
    delete pointBuffer[id];
    delete data['arity']; // no need to send arity -- it's just for internal use

    console.log('nasanov-reader full point');

    wss.clients.forEach(function each(client) {
        if (client.readyState !== WebSocket.OPEN) {
            return;
        }

        client.send(JSON.stringify(data));
    });
}

/*
 * Creates the influx subscription if needed
 */
function configureInflux() {

    const VERSION = 1;

    return new Promise(function (fulfill, reject){
        influxConnection.then(function (influx) {
            // check if the subscription already exists
            influx.query(`SHOW SUBSCRIPTIONS`).then(function (rows) {
                let created = false;
                let toDelete = [];

                let regexp = new RegExp('^' + SUBSCRIPTION_NAME + '(\\d*)');
                for (let i = 0; i < rows.length; i++){
                    let match = rows[i].name.match(regexp);

                    if (!match) {
                        continue;
                    }

                    const version = parseInt(match[1]);

                    if (version != VERSION) {
                        toDelete.push(rows[i].name);
                        continue;
                    }

                    created = true;
                }

                toDelete.map(function (name) {
                    console.log('Deleting old subscription' + name);
                    influx.query("DROP SUBSCRIPTION " + name + " ON \"" + influxConnection.DATABASE_NAME + "\".\"autogen\"");
                });

                if (created) {
                    fulfill();
                    return;
                }

                const name = SUBSCRIPTION_NAME + VERSION;
                console.log('Creating subscription ' + name);
                influx.query(
                    `CREATE SUBSCRIPTION ` + name + ` ON "` + influxConnection.DATABASE_NAME +
                    `"."autogen" DESTINATIONS ALL 'http://` + LISTENER_HOST + (PORT ? `:` + PORT : '') + `'`
                ).then(fulfill).catch(reject);
            }).catch(reject);
        }).catch(reject);
    });

    // Useful snippets:
    //
    // SHOW SUBSCRIPTIONS
    // DROP SUBSCRIPTION influx_subscriber ON "defaultdb"."autogen"
    // CREATE SUBSCRIPTION influx_subscriber ON "defaultdb"."autogen" DESTINATIONS ALL 'udp://localhost:9090'
}

module.exports = {
    init: init
};
