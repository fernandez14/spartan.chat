var app = require('express')();
var http = require('http').Server(app);
var jwt = require("socketio-jwt");
var io = require('socket.io')(http);
var program = require('commander');
var mongoose = require('mongoose');
var zmq = require('zmq');
var xs = require('xstream').default;
var m = require('./messages');
var schemas = require('./schemas');
var security = require('./security');
var users = require('./users');
var pull = zmq.socket('pull');

program.version('0.1.5')
    .option('-p, --port <n>', 'Socket.IO port', parseInt, 3100)
    .option('-z, --zmq', 'ZMQ pull server port')
    .option('-db, --mongo <url>', 'MongoDB connection URL.')
    .option('-secret, --jwt_secret <secret>', 'JWT secret.')
    .parse(process.argv);

// Attempt to connect to data source & zmq
mongoose.connect(program.mongo, {useMongoClient: true});
pull.bind('tcp://127.0.0.1:5557');

const config = {
    serverVersion: program.version(),
    channels: {
        'general': {
            name: 'General',
            youtubePlayer: false,
            youtubeVideo: false
        },
        'dia-de-hueva': {
            name: 'Día de hueva',
            youtubePlayer: true,
            youtubeVideo: 'V1ZvNbQpbTY'
        }
    }
};

const roles = {
    'guest': 0,
    'user': 0,
    'category-moderator': 1,
    'super-moderator': 2,
    'administrator': 3,
    'developer': 4
};

const jwtMiddleware = jwt.authorize({
    secret: program.jwt_secret,
    handshake: true,
    fail: function (error, data, accept) {
        console.log('Could not authorize connected client.');

        if (data.request) {
            accept();
        } else {
            accept(null, true);
        }
    }
});

const zmq$ = xs.create({
    eventListener: null,
    start(listener) {
        this.eventListener = pull.on('message', args => {
            return listener.next(JSON.parse(args.toString()));
        });
    },
    stop() {
        this.eventListener = null;
    }
});

io.use(jwtMiddleware);
io.on('connection', function(socket) {
    const global = {
        next(incoming) {
            socket.emit(incoming.event, incoming.message);
        }
    };

    zmq$.addListener(global);
    console.log('connected client ', socket.id)
});

const chat = io.of('/chat').use(jwtMiddleware);

chat.on('connection', function(socket) {
    const token = socket.decoded_token || {};
    const user_id = token.user_id || false;
    const id = socket.id;

    socket.on('chat update-me', function(channel) {
        channel = String(channel);

        if (channel in config.channels) {
            const list = m.list(channel, ...m.lastMessages(channel));

            socket.emit('chat '+channel, list);
            socket.emit('messages', list);
            socket.join('room:' + channel);
            users.channel(id, channel);
        }
    });

    socket.emit('config', config);
    socket.on('disconnect', function() {
        if (user_id) {
            users.offline(user_id);
        }
    });

    const tempFeatured = m.highlighted();
    if (tempFeatured.length > 0) {
        socket.emit('highlighted', tempFeatured);
    }

    if (user_id) {
        users.one(user_id, user => {
            users.online(user_id);

            const perms = roles[user.role];
            const online = users.onlineUsers();

            socket.on('user me', function() {
                socket.emit('user signature', user);
            });

            socket.on('send', function(message) {
                const channel = users.channel(id);

                // Block message if needed.
                if (true === users.isBlocked(user_id) || false === security.viableMessage(user, channel, message)) {
                    return;
                }

                const msg = m.userMessage(user, message);

                socket.to(`room:${channel}`).emit('messages', m.list(channel, msg));

                // Finally push to the history.
                m.pushHistory(channel, msg);
                m.saveMessage(channel, msg);
            });

            socket.emit('online-list', online);
            socket.broadcast.emit('online-list', online);

            for (var k in roles) {
                if (roles[k] <= perms) {
                    socket.join('role.'+k);
                }
            }

            socket.on('chat send', function(channel, message) {
                message = String(message)
                channel = String(channel)

                if (true === users.isBlocked(user._id) || false === security.viableMessage(user, channel, message)) {
                    return;
                }

                if (channel.length == 0 || message.length == 0) {
                    return;
                }

                const msg = m.userMessage(user, message);
                const list = m.list(channel, msg);

                socket.broadcast.emit('chat ' + channel, list);
                socket.to(`room:${channel}`).emit('messages', list);

                // Finally push to the history.
                m.pushHistory(channel, msg);
            });

            const rolePower = roles[user.role];
            if (rolePower > 0) {
                socket.on('mute', function(targetId) {
                    users.one(targetId, function(targetUser) {
                        if (roles[targetUser.role] <= rolePower) {
                            const message = m.list('log', {type: 'LOG', data: {action: 'muted', author: user, user: targetUser, timestamp: (new Date()).getTime()}});

                            socket.to('role.developer').to('role.administrator').to('role.super-moderator').to('role.child-moderator').emit('log', message);
                            socket.to('role.developer').to('role.administrator').to('role.super-moderator').to('role.child-moderator').emit('messages', message);
                            socket.emit('log', message);
                            socket.emit('messages', message);
                            users.onMuteUser(targetId);
                        }
                    })
                });
            }

            if (rolePower >= 2) {
                socket.on('ban', function(targetId) {
                    users.one(targetId, function(targetUser) {
                        if (roles[targetUser.role] <= rolePower) {
                            const message = m.list('log', {type: 'LOG', data: {action: 'banned', author: user, user: targetUser, timestamp: (new Date()).getTime()}});

                            socket.to('role.developer').to('role.administrator').to('role.super-moderator').to('role.child-moderator').emit('log', message);
                            socket.to('role.developer').to('role.administrator').to('role.super-moderator').to('role.child-moderator').emit('messages', message);
                            socket.emit('log', message);
                            socket.emit('messages', message);
                            users.onBanUser(targetId);
                        }
                    })
                });

                socket.on('highlight', function(messageId) {
                    m.highlight(messageId, function(featured) {
                        chat.emit('highlighted', featured);
                        setTimeout(() => {
                            chat.emit('highlighted', m.popHighlight());
                        }, 2 * 60 * 1000);
                    });
                });
            }
        });

        return;
    }

    socket.on('user me', function() {
        socket.emit('user signature', {_id: false, username: 'guest', image: false, role: 'guest'});
    });
});



http.listen(program.port, function() {
    console.log('listening on *:3100');
});