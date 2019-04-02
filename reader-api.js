const influxConnection = require('./influx.js');

// circular dependency, so we have to wait a hot sec to get a reference to getKeys
let getKeys = () => [];
setTimeout(() => {
    getKeys = require('./reader.js').getKeys;
});

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
        handleClientError(response, 'Can only accept GET and OPTIONS requests');
        return;
    }

    let requestQuery = new URL(request.url, 'https://habmc.stanfordssi.org/');
    console.log(requestQuery.search);

    if (/^\/missions\/[^/]+\/index(.json)?$/.test(requestQuery.pathname)) {
        return handleIndexQuery(requestQuery, response);
    }

    if (/^\/missions\/[^/]+\/data(.json)?$/.test(requestQuery.pathname)) {
        return handleDataFetchQuery(requestQuery, response);
    }

    console.log(requestQuery.pathname);
    handleClientError(response, 'Method not found', 404)
}


/*
 *********************************
 *
 * Helper functions for responses
 *
 *********************************
 */

/**
 * Responds with status code 400
 *
 * @param response
 * @param {String} reason
 * @param {Number} code
 */
function handleClientError(response, reason, code=400) {
    response.writeHead(code);
    response.end(JSON.stringify({
        error: reason
    }));
}

/**
 * Responds to a server error with status code 500
 *
 * @param response
 * @param {Error} error
 */
function handleInternalError(response, error) {
    console.error(error);
    console.error(error.message);
    console.error(error.stack);

    response.writeHead(500);
    response.end(JSON.stringify({
        error: 'Internal server error'
    }));
}

/**
 * Helper to return a JSON response neatly
 *
 * @param response
 * @param {Object} jsonObject
 */
function respondWithJSON(response, jsonObject) {
    response.setHeader('Content-Type', 'application/json');
    response.writeHead(200);
    response.end(JSON.stringify(jsonObject));
}

/*
 *******************
 *
 * Specific actions
 *
 *******************
 */

/**
 * Handles GET requests of format /missions/MISSION_ID/index
 *
 * @param requestQuery
 * @param response
 */
function handleIndexQuery(requestQuery, response) {
    const parameters = extractParameters(requestQuery);

    if (!/^\d+$/.test(parameters.mission)) {
        handleClientError(response, 'Invalid mission id');
        return;
    }

    findIndex(parameters).then((index) => {
        respondWithJSON(response, {
            mission: parameters.mission,
            index
        });
    }).catch((error) => {
        handleInternalError(response, error);
    });
}

/**
 * Handles GET requests of format /missions/MISSION_ID/data
 *
 * @param requestQuery
 * @param response
 */
function handleDataFetchQuery(requestQuery, response) {
    const params = extractParameters(requestQuery);

    if (!/^\d+$/.test(params.mission)) {
        handleClientError(response, 'Invalid mission id');
        return;
    }

    params.minTime = new Date(requestQuery.searchParams.get('minTime') || new Date(0));
    params.maxTime = new Date(requestQuery.searchParams.get('maxTime') || new Date());

    findData(params).then((data) => {
        respondWithJSON(response, {
            params: params,
            data
        });
    }).catch((error) => {
        handleInternalError(response, error);
    });
}

/*
 *****************************
 *
 * Helper methods for actions
 *
 *****************************
 */

/**
 * Returns the mission id and other common properties from the request query
 *
 * @param requestQuery
 * @return {{mission: string, limit: number, offset: number}}
 */
function extractParameters(requestQuery) {
    const mission = requestQuery.pathname.match(/missions\/([^/]+)\//)[1];
    const limit = requestQuery.searchParams.get('limit') || 0;
    const offset = requestQuery.searchParams.get('offset') || 0;

    return {
        mission,
        limit,
        offset
    };
}

/**
 * Finds the index of transmissions for the given mission
 *
 * @param {String} mission
 * @param {Number} [limit]
 * @param {Number} [offset]
 * @return {Promise<Array>}
 */
async function findIndex({ mission, limit, offset}) {

    const influx = await influxConnection;

    if (getKeys().length === 0) {
        return [];
    }

    let query = `SELECT "value","id" FROM ${getKeys().join(',')} WHERE mission = '${mission}' ORDER BY DESC`;

    if (limit) {
        query += ` LIMIT ${limit}`;
    }

    if (offset) {
        query += ` OFFSET ${offset}`;
    }

    console.log(query);

    const result = await influx.query(query);

    if (result === null) {
        return [];
    }

    let index = [];
    let registeredIds = new Set();

    for (let measurement of result) {
        if (registeredIds.has(measurement.id)) {
            continue;
        }

        index.push([measurement.id, measurement.time._nanoISO]);
        registeredIds.add(measurement.id);
    }

    if (limit) {
        index = index.slice(0, limit);
    }

    return index.reverse();
}

/**
 * Fetches the transmission data for the given parameters
 *
 * @param {String} mission
 * @param {Date} minTime
 * @param {Date} maxTime
 * @param {Number} [limit]
 * @param {Number} [offset]
 * @return {Promise<Array>}
 */
async function findData({ mission, minTime, maxTime, limit, offset}) {

    const influx = await influxConnection;

    if (getKeys().length === 0) {
        return [];
    }

    let query = `SELECT * FROM ${getKeys().join(',')} WHERE mission='${mission}' AND time >= '${minTime.toISOString()}' AND time <= '${maxTime.toISOString()}' ORDER BY DESC`;

    if (limit) {
        query += ` LIMIT ${limit}`;
    }

    if (offset) {
        query += ` OFFSET ${offset}`;
    }

    console.log(query);

    const result = await influx.query(query);

    let transmissions = {};

    result.groupRows.forEach((group) => {
        const name = group.name;

        group.rows.forEach((point) => {
            if (!transmissions[point.id]) {
                transmissions[point.id] = {
                    'Human Time': point.time._nanoISO,
                    mission: Number(mission),
                    timestamp: new Date(point.time._nanoISO).valueOf(),
                    id: point.id
                };
            }

            transmissions[point.id][name] = point.value;
        })
    });

    let data = Object.values(transmissions);
    if (limit) {
        data = data.slice(0, limit);
    }

    return data.reverse();
}

module.exports = {
    handleHTTPRequest: handleHTTPRequest
};
