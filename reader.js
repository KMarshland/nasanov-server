const InfluxSubscriber = require('influx-subscriber');
const influx = require('./influx.js');

const SUBSCRIPTION_NAME = 'influx_subscriber';
const PORT = 9090;

function init(wss) {
    console.log('Initializing nasanov-reader');

    let clients = [];

    // listen for client connections
    wss.on('connection', function (ws) {
        clients.push(ws);
    });

    // listen for new data
    configureInflux().then(function () {
        const subscriber = new InfluxSubscriber({
            server: {
                port: PORT
            }
        });

        subscriber.on('point', function (point) {
            console.log('Point!');
            console.log(JSON.stringify(point));

            clients.map(function (client) {
                client.send(JSON.stringify(point));
            })
        });
    }).catch(function (err) {
        console.error(err);
        process.exit();
    });
}

/*
 * Creates the influx subscription if needed
 */
function configureInflux() {

    return new Promise(function (fulfill, reject){

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
                `CREATE SUBSCRIPTION ` + SUBSCRIPTION_NAME + ` ON "` + influx.DATABASE_NAME +
                `"."autogen" DESTINATIONS ALL 'udp://localhost:` + PORT + `'`
            ).then(fulfill).catch(reject);
        }).catch(reject);
    });

    // Useful snippets:
    //
    // SHOW SUBSCRIPTIONS
    // DROP SUBSCRIPTION influx_subscriber ON "nasanov_transmissions"."autogen"
    // CREATE SUBSCRIPTION influx_subscriber ON "nasanov_transmissions"."autogen" DESTINATIONS ALL 'udp://localhost:9090'
}

module.exports = {
    init: init
};
