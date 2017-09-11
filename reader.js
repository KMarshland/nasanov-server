const WebSocket = require('ws');

const influxConnection = require('./influx.js');
const dgram = require('dgram');
const { StringDecoder } = require('string_decoder');

const SUBSCRIPTION_NAME = 'influx_subscriber';
const HOST = '127.0.0.1';
const PORT = 9090;

const MAX_RECENCY = 10; // ignore points that are more than this many seconds old

let WSS;

let pointBuffer = {};

function init(wss) {
    WSS = wss;
    console.log('Initializing nasanov-reader');

    // listen for new data
    configureInflux().then(function () {
        const server = dgram.createSocket('udp4');

        server.on('message', handlePoint);

        server.bind(PORT, HOST);
    }).catch(function (err) {
        console.error(err);
        process.exit();
    });
}

/*
 * Takes a partial point from the UDP connection, parses it, and stores it until it's ready to be sent on
 */
function handlePoint(dataBuffer) {

    // parse the point

    const decoder = new StringDecoder('utf8');
    const point = decoder.write(dataBuffer);

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

    WSS.clients.forEach(function each(client) {
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

    return new Promise(function (fulfill, reject){
        influxConnection.then(function (influx) {
            // check if the subscription already exists
            influx.query(`SHOW SUBSCRIPTIONS`).then(function (rows) {
                let created = false;

                for (let i = 0; i < rows.length; i++){
                    if (rows[i].name == SUBSCRIPTION_NAME) {
                        created = true;
                        break;
                    }
                }

                if (created) {
                    fulfill();
                    return;
                }

                console.log('Creating subscription');
                influx.query(
                    `CREATE SUBSCRIPTION ` + SUBSCRIPTION_NAME + ` ON "` + influxConnection.DATABASE_NAME +
                    `"."autogen" DESTINATIONS ALL 'udp://127.0.0.1:` + PORT + `'`
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
