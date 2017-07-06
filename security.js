var mori = require('mori');
var exports = module.exports = {};
var messages = mori.hashMap();

exports.viableMessage = function(user, channel, message) {
    return lastMessageRule(user, channel, message) && messageLengthRule(message);
}

function lastMessageRule(user, channel, message) {
    const id = user._id;
    const last = mori.get(messages, id, false);

    messages = mori.assoc(messages, id, message);

    return last !== message;
}

function messageLengthRule(message) {
    const str = message.trim();
    return str.length < 255;
}