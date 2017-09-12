
/*
 * Figure out which kind of server you're initializing
 */
let source;

if (process.env.MODE == 'writer') {
    source = './writer.js';
} else {
    source = './reader.js';
}

const websocketServer = require(source);

/*
 * Initialize the websocket server
 */

websocketServer.init();
