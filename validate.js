
MAX_SECONDS = 5; // The length of time before a signature expires

const crypto = require('crypto');

/*
 * Digests and hmacs a given timestamp
 */
function sign(timestamp) {
    const hmac = crypto.createHmac('sha256', process.env.NASANOV_SECRET);
    hmac.update(timestamp.toString());
    return hmac.digest('hex');
}

/*
 * Checks if a given timestamp and signature (HMAC) is valid
 */
function validate(timestamp, signature) {
    timestamp = parseFloat(timestamp);

    // timestamp must exist
    if (!timestamp) {
        return false;
    }

    // timestamp must be in past
    if (timestamp > new Date().valueOf()) {
        return false;
    }

    // timestamp must not be stale
    if (new Date().valueOf() - timestamp > MAX_SECONDS*1000) {
        return false;
    }

    // signature must be valid
    return sign(timestamp) == signature;
}

module.exports = {
    sign: sign,
    validate: validate
};
