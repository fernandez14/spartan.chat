import xs from 'xstream';

const CONFIG = {
    serverVersion: '0.1.2',
    newVersion: false,
    channels: {
        'general': {
            name: 'General',
            youtubePlayer: false,
            youtubeVideo: '',
            headline: ''
        },
        'dia-de-hueva': {
            name: 'Día de hueva',
            youtubePlayer: false,
            youtubeVideo: ''
        }
    }
};


const GUEST_USER = {
    _id: false,
    username: 'guest',
    image: '',
    role: 'guest'
};

const DEFAULT_STATE = {
    config: CONFIG,
    list: [],
    online: [],
    message: '',
    lock: true,
    channel: 'general',
    player: false,
    missing: 0,
    user: GUEST_USER
};

/**
 *
 * @param actions$
 * @returns {MemoryStream|MemoryStream<{list: Array, message: string}>}
 */
export function model(actions) {
    const currentUser$ = actions.signature$.startWith(GUEST_USER);

    const remoteConfig$ = actions.config$
        .map(config => {
            return state => ({
                ...state,
                config: {...state.config, ...config, newVersion: state.config.serverVersion != config.serverVersion}
            });
        });

    const scroll$ = actions.scroll$
        .startWith({lock: true})
        .map(status => {
            return state => Object.assign({}, state, {
                lock: status.lock,
                missing: status.lock === true ? 0 : state.missing
            });
        });

    const currentChannel$ = actions.channel$
        .map(channel => {
            return state => Object.assign({}, state, {channel: channel, list: [], lock: true});
        });

    const userReducer$ = currentUser$.map(user => {
        return state => Object.assign({}, state, {user});
    })

    const showVideo$ = actions.video$
        .map(player => {
            return state => Object.assign({}, state, {player});
        });

    const message$ = actions.msg$
        .map(message => {
            return state => Object.assign({}, state, {message: message.sent ? '' : message.payload})
        });

    const onlineUsers$ = actions.online$
        .map(list => {
            return state => ({...state, online: list});
        });

    /**
     * Transform sent messages to packed list of actual commands.
     *
     * @type {Stream<U>|Stream}
     */
    const sent$ = xs.combine(currentUser$, actions.msg$.filter(m => m.sent))
        .map(data => {
            const [user, msg] = data;

            return message(cmessage(user, msg, new Date()));
        });

    const packedSent$ = sent$.map(message => list(message));
    const messages$ = xs.merge(actions.messages$, packedSent$)
        .map(packed => {
            return state => Object.assign({}, state, {
                list: state.list.concat(packed.list),
                missing: state.lock === false ? state.missing + packed.list.length : state.missing
            });
        });

    /**
     * Merge all reducers to compute state.
     *
     * @type {*}
     */
    const state$ = xs.merge(remoteConfig$, userReducer$, messages$, message$, scroll$, currentChannel$, showVideo$, onlineUsers$)
        .fold((state, action) => action(state), DEFAULT_STATE)
        .startWith(DEFAULT_STATE);


    const socketSend$ = xs.combine(sent$, actions.channel$).map(send => (['chat send', send[1], send[0].data.content]));
    const socketChannel$ = actions.channel$.map(channel => (['chat update-me', channel]));
    const muteUsers$ = actions.mute$.map(id => (['mute', id]));
    const socket$ = xs.merge(socketChannel$, socketSend$, muteUsers$);

    return {
        state$,
        socket$
    };
}


function list(...messages) {
    return {list: messages};
}

function message(data) {
    return {type: 'MESSAGE', data};
}

function cmessage(user, message, date) {
    return {
        content: message.payload.trim(),
        user_id: user._id,
        username: user.username,
        image: user.image,
        role: user.role,
        timestamp: date.getTime()
    };
}