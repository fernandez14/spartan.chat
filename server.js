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
var users = require('./users');
var pull = zmq.socket('pull');

program.version('0.1.1')
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
            youtubeVideo: 'iyWHsWWVSMY'
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

const zmq$ = xs.createWithMemory({
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

io.on('connection', function(socket) {
    const global = {
        next(incoming) {
            socket.emit(incoming.event, incoming.message);
        }
    };

    zmq$.addListener(global);
});


const chat = io.of('/chat').use(jwt.authorize({
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
}));

chat.on('connection', function(socket) {
    const token = socket.decoded_token || {};
    const user_id = token.user_id || false;

    socket.on('chat update-me', function(channel) {
        socket.emit('chat '+channel, m.list(...m.lastMessages(channel)));
    });


    socket.emit('config', config);
    socket.on('disconnect', function() {
        if (user_id) {
            users.offline(user_id);
        }
    });

    if (user_id) {
        users.one(user_id, user => {
            const changed = users.online(user_id);
            const perms = roles[user.role];
            const online = users.onlineUsers();

            socket.on('user me', function() {
                socket.emit('user signature', user);
            });

            socket.emit('online-list', online);

            if (changed) {
                socket.broadcast.emit('online-list', online);
            }


            for (var k in roles) {
                if (roles[k] <= perms) {
                    socket.join('role.'+k);
                }
            }

            socket.on('chat send', function(channel, message) {
                message = String(message)
                channel = String(channel)

                if (users.isBlocked(user._id)) {
                    return;
                }

                if (channel.length == 0 || message.length == 0) {
                    return;
                }

                const msg = m.userMessage(user, message);
                m.pushHistory(channel, msg);

                socket.broadcast.emit('chat ' + channel, m.list(msg));
            });

            const rolePower = roles[user.role];
            if (rolePower > 0) {
                socket.on('mute', function(id) {
                    users.one(id, function(targetUser) {
                        if (roles[targetUser.role] <= rolePower) {
                            const message = m.list({type: 'LOG', data: {action: 'muted', author: user, user: targetUser, timestamp: (new Date()).getTime()}});

                            socket.to('role.developer').emit('log', message);
                            socket.emit('log', message);
                            users.onMuteUser(id);
                        }
                    })
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