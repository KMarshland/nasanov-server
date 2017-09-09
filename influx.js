const Influx = require('influx');

const DATABASE_NAME = 'nasanov_transmissions';

// note that the schema isn't strictly required, but it's nice for debugging
const SCHEMA = [
    tableFor('altitude')
];

function tableFor(name) {
    return {
        measurement: name,
        fields: {
            value: Influx.FieldType.FLOAT
        },
        tags: [
            'mission',
            'id',
            'arity'
        ]
    };
}

/*
 * Establishes a connection to the database
 */
let influx;
let connected = false;
function connect() {
    return new Promise(function (fullfill, reject) {
        influx = new Influx.InfluxDB({
            host: 'localhost',
            database: DATABASE_NAME,
            schema: SCHEMA
        });

        // create database if it doesn't already exist
        influx.getDatabaseNames()
            .then(names => {
                if (names.includes(DATABASE_NAME)) {
                    connected = true;
                    fullfill(influx);
                }

                influx.createDatabase(DATABASE_NAME).then(function () {
                    connected = true;
                    fullfill(influx);
                }).catch(reject)
            }).catch(reject);
    });
}

module.exports = new Promise(function (fullfill, reject) {

    // don't reinstantiate multiple times
    if (connected) {
        fullfill(influx);
        return;
    }

    let retries = 3;
    tryConnect();

    function tryConnect() {
        connect().then(fullfill).catch(function (err) {
            if (retries <= 0) {
                reject(err);
                return;
            }

            retries --;
            setTimeout(tryConnect, 1000);
        })
    }
});
module.exports.DATABASE_NAME = DATABASE_NAME;

