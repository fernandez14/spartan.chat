var mori = require('mori');
var schemas = require('./schemas');
var featured = mori.queue();
var users = mori.hashMap();
var usersChannel = mori.hashMap();
var online = mori.sortedSet();
var banned = mori.hashMap();
var mute = mori.set();
var exports = module.exports = {};


exports.online = function (id) {
    const old = online;
    online = mori.conj(online, id);

    return mori.equals(old, online);
};

exports.offline = function (id) {
    const old = online;
    online = mori.disj(online, id);

    return mori.equals(old, online);
};

exports.channel = function(id, channel = false) {
    if (channel === false) {
        return mori.get(usersChannel, id, 'general');
    }

    usersChannel = mori.assoc(usersChannel, id, channel);
    return true;
}

exports.onlineUsers = function () {
    const map = users;
    const list = mori.map(id => mori.get(map, id), online);

    return mori.intoArray(list);
};

exports.one = function (id, callback) {
    id = String(id);

    if (mori.hasKey(users, id)) {
        return callback(mori.get(users, id));
    }

    schemas.User.findById(id, 'username image roles', (err, user) => {
        const usr = user.toObject({ virtuals: true });
        const signature = {
            _id: String(usr._id),
            image: usr.image,
            role: usr.role,
            username: usr.username
        };

        users = mori.assoc(users, id, signature);
        callback(signature);
    });
};

exports.isBlocked = function (id) {
    return mori.hasKey(mute, String(id)) || mori.hasKey(banned, String(id));
}

exports.isBanned = function (id) {

};

exports.onMuteUser = function (id) {
    mute = mori.conj(mute, id);
    console.log('mute ' + id);

    setTimeout(exports.onRemoveMuteUser.bind(this, id), 60 * 5 * 1000);
};

exports.onRemoveMuteUser = function (id) {
    mute = mori.disj(mute, id);
    console.log('removed mute of ' + id);
}

exports.onBanUser = function (id) {
    banned = mori.conj(banned, id);

    setTimeout(exports.onRemoveMuteUser.bind(this, id), 60 * 5 * 1000);
};

exports.onRemoveBanUser = function (id) {
    banned = mori.disj(banned, id);
    console.log('removed mute of ' + id);
}