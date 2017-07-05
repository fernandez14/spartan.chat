var exports = module.exports = {};

exports.list = function (...messages) {
    return {list: messages};
};

exports.userMessage = function (user, message) {
    return {
        type: 'MESSAGE',
        data: {
            user_id: user._id,
            username: user.username,
            image: user.image,
            role: user.role,
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