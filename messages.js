var exports = module.exports = {};
var mori = require('mori');
var mongoose = require('mongoose');
var schemas = require('./schemas');
var featured = mori.queue();

exports.list = function (channel, ...messages) {
    return {list: messages, channel};
};

exports.userMessage = function (user, message) {
    return {
        type: 'MESSAGE',
        data: {
            _id: mongoose.Types.ObjectId(),
            user_id: user._id,
            username: user.username,
            image: user.image,
            role: user.role || 'user',
            content: message.trim(),
            timestamp: (new Date()).getTime()
        }
    };
};

var history = {};

exports.lastMessages = function (channel) {
    const ready = history[channel] || false;
    const messages = history[channel] || [];

    if (ready === false) {
        history[channel] = [];
    }

    return messages;
};

exports.pushHistory = function (channel, message) {
    const messages = history[channel] || [];

    history[channel] = messages.concat([message]).slice(-100);
};

exports.saveMessage = function(channel, message) {
    const msg = Object.assign({}, message.data, {channel: channel});

    schemas.Message.create(msg, function (err, m) {
        if (err) {
            console.log(err);
        }
    });
};

exports.highlight = function(id, callback) {
    schemas.Message.findById(id, (err, msg) => {
        if (err) {
            return console.log(err);
        }
        const m = msg.toObject();

        featured = mori.conj(featured, m);
        callback(mori.toJs(featured));
    });
};

exports.popHighlight = function() {
    featured = mori.pop(featured);
    return mori.toJs(featured);
};

exports.highlighted = function() {
    return mori.toJs(featured);
};