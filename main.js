
/*
 * Figure out which kind of server you're initializing
 */
let source;
let server;

process.on('uncaughtException', function (err) {
    console.error(err.stack);
    console.log("Node NOT Exiting...");
});

if (process.env.MODE == 'writer') {
    source = './writer.js';
    server = require(source);
    server.init();
} else {
    source = './reader.js';
    const http = require('http');
    let httpServer = http.createServer();
    httpServer.listen(process.env.PORT || 5000);

    server = require(source);
    server.init(httpServer);
}


/*
 * Initialize the websocket server
 */

