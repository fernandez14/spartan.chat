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
var fs = require('fs');

program.version('0.1.6')
    .option('--port <n>', 'Socket.IO port', 3100)
    .option('--zmq <n>', 'ZMQ pull server port', 5557)
    .option('-db, --mongo <url>', 'MongoDB connection URL.')
    .option('-secret, --jwt_secret <secret>', 'JWT secret.')
    .parse(process.argv);

// Attempt to connect to data source & zmq
mongoose.connect(program.mongo, {useMongoClient: true});
pull.bind('tcp://127.0.0.1:' + String(program.zmq));

const config = {
    serverVersion: program.version(),
    viewer: {
        title: 'Buldar Chat',
        subtitle: 'Conversaciones en tiempo real. Guerras de GIFs. Consejos que ayudarán o arruinarán tu vida.',
        youtubePlayer: false,
        youtubeVideo: 'lvDt7ghfsCk',
        live: fs.existsSync('./livestreaming')
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
            console.log('Received message', args.toString());
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
});

const chat = io.of('/chat').use(jwtMiddleware);

chat.on('connection', function(socket) {
    const token = socket.decoded_token || {};
    const user_id = token.user_id || false;
    const id = socket.id;

    /**
     * New connection sequence.
     * - Refresh frontend config using backend config.
     * - Connected peers.
     */
    socket.emit('config', config);
    socket.emit('chat.count', users.chatCount());

    /**
     * Per user event handlers.
     * - Historic messages update.
     */
    socket.on('chat update-me', function() {
        const list = m.list(...m.lastMessages());

        // Keep an eye of where the user is located.
        users.location(user_id, 'chat');
        users.online(user_id);
        
        socket.join('chat:feed');
        socket.emit('messages', list);
        socket.emit('chat.count', users.chatCount());
        socket.broadcast.emit('chat.count', users.chatCount());
    });

    socket.on('chat disconnect', function() {
        if (user_id) {
            users.offline(user_id);
            socket.emit('chat.count', users.chatCount());
            socket.broadcast.emit('chat.count', users.chatCount());
            users.location(user_id, 'board');
        }
    });

    socket.on('disconnect', function() {
        if (user_id) {
            users.offline(user_id);
            socket.broadcast.emit('chat.count', users.chatCount());
        }
    });

    const tempFeatured = m.highlighted();
    if (tempFeatured.length > 0) {
        socket.emit('highlighted', tempFeatured);
    }

    if (user_id) {
        users.one(user_id, user => {
            const perms = roles[user.role];
            const online = users.onlineUsers();

            socket.on('user me', function() {
                socket.emit('user signature', user);
            });

            socket.on('send', function(message) {
                // Block message if needed.
                //  || false === security.viableMessage(user, channel, message)
                if (users.isBlocked(user_id)) {
                    return;
                }

                const msg = m.userMessage(user, message);
                socket.to('chat:feed').emit('messages', m.list(msg));
                m.pushHistory(msg);

                // Finally push to the history.
                //m.saveMessage(channel, msg);
            });

            socket.emit('online-list', online);
            socket.broadcast.emit('online-list', online);

            for (var k in roles) {
                if (roles[k] <= perms) {
                    socket.join('role.'+k);
                }
            }

            socket.on('chat send', function(message) {
                message = String(message)
                //  || false === security.viableMessage(user, channel, message)
                if (true === users.isBlocked(user._id)) {
                    return;
                }

                if (message.length == 0) {
                    return;
                }

                const msg = m.userMessage(user, message);
                const list = m.list(msg);

                socket.to('chat:feed').emit('messages', list);

                // Finally push to the history.
                m.pushHistory(channel, msg);
            });

            const rolePower = roles[user.role];
            if (rolePower > 0) {
                socket.on('mute', function(targetId) {
                    users.one(targetId, function(targetUser) {
                        if (roles[targetUser.role] <= rolePower) {
                            const message = m.list({type: 'LOG', data: {action: 'muted', author: user, user: targetUser, timestamp: (new Date()).getTime()}});

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

            // Admin & up.
            if (rolePower > 2) {
                socket.on('chat update-video', function(id) {
                    config.viewer.youtubeVideo = id;
                    socket.emit('config', config);
                    socket.broadcast.emit('config', config);
                });

                socket.on('chat video', function(active) {
                    config.viewer.youtubePlayer = active;
                    socket.emit('config', config);
                    socket.broadcast.emit('config', config);
                });

                socket.on('chat live', function(live) {
                    config.viewer.live = live;
                    if (live) {
                        fs.closeSync(fs.openSync('./livestreaming', 'w'));
                    } else {
                        fs.unlinkSync('./livestreaming');
                    }
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
    console.log('Spawning http server on *:' + String(program.port));
    console.log('Pulling zmq messages from *:' + String(program.zmq));
});