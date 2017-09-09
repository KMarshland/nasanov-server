const validate = require('./validate.js');

function init(wss) {
    console.log('Initializing nasanov-writer');

    wss.on('connection', function connected(ws, req) {
        let time = req.url.split('/')[1];
        let signature = req.url.split('/')[2];

        // forbid unauthorized access
        if (!validate.validate(time, signature)){
            return;
        }

        ws.on('message', function incoming(message) {
            console.log('nasanov-writer receive');
        });
    });
}

module.exports = {
    init: init
};
