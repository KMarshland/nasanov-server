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
            'mission'
        ]
    };
}

// establish a connection to the database
const influx = new Influx.InfluxDB({
    host: 'localhost',
    database: DATABASE_NAME,
    schema: SCHEMA
});

// create database if it doesn't already exist
influx.getDatabaseNames()
    .then(names => {
        if (!names.includes(DATABASE_NAME)) {
            return influx.createDatabase(DATABASE_NAME);
        }
    });

influx.DATABASE_NAME = DATABASE_NAME;

module.exports = influx;
