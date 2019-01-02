
/*
 * Figure out which kind of server you're initializing
 */
let source;
const http = require('http');

if (process.env.MODE == 'writer') {
    source = './writer.js';
} else {
    source = './reader.js';
    const http = require('http');
}

const websocketServer = require(source);

/*
 * Initialize the websocket server
 */

const server = http.createServer();
server.listen(process.env.PORT || 5000);


websocketServer.init(server);
