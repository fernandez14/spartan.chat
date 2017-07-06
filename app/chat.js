import {main, header, div, h1, input, ul, li, img, span, p, a, b, iframe, nav} from '@cycle/dom';
import tippy from 'tippy.js';
import xs from 'xstream';
import debounce from 'xstream/extra/debounce';

const ENTER_KEY = 13;
const ESC_KEY = 27;
const CONFIG = {
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

const ROLES = {
    'guest': 0,
    'user': 0,
    'category-moderator': 1,
    'super-moderator': 2,
    'administrator': 3,
    'developer': 4
};

const Loggers = {
    muted: (author, user) => {
        return `${author.username} ha silenciado a ${user.username} por 5 minutos.`;
    }
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

/**
 *
 * @param dom
 */
function intent(dom, socket) {

    /**
     * Some initial data will come right outta socket.io.
     *
     * This allows dynamic config & socket auth.
     */
    const signature$ = socket.get('user signature');
    const online$ = socket.get('online-list');
    const config$ = socket.get('config');
    const actionsLog$ = socket.get('log');

    /**
     * DOM intents including:
     *
     * - keyups from message box
     * - scroll on messages container
     * - change channel clicks
     */
    const msg$ = dom.select('.message').events('keyup')
        .filter(e => {
            let trimmed = String(e.target.value).trim();
            return trimmed;
        })
        .map(e => ({type: 'message', sent: e.keyCode == ENTER_KEY, payload: String(e.target.value)}));

    const scroll$ = dom.select('.list-container').events('scroll')
        .compose(debounce(25))
        .map(e => ({type: 'feed-scroll', top: e.target.scrollTop, height: e.target.scrollHeight - e.target.clientHeight}));

    const channel$ = dom.select('.channel').events('click')
        .map(e => (e.target.dataset.id))
        .startWith('general');

    const video$ = channel$
        .map(channel => channel == 'dia-de-hueva')
        .startWith(false);

    const mute$ = dom.select('.mute').events('click')
        .map(e => (e.target.dataset.user_id));

    const channelMessages$ = channel$.map(name => socket.get('chat ' + name)).flatten();
    const messages$ = xs.merge(channelMessages$, actionsLog$);

    return {config$, actionsLog$, signature$, msg$, scroll$, messages$, channel$, video$, mute$, online$};
};

/**
 *
 * @param actions$
 * @returns {MemoryStream|MemoryStream<{list: Array, message: string}>}
 */
function model(actions) {
    const currentUser$ = actions.signature$.startWith(GUEST_USER);

    const remoteConfig$ = actions.config$
        .map(config => {
            return state => Object.assign({}, state, {config});
        });

    const scroll$ = actions.scroll$
        .map(a => ({lock: a.top == a.height}))
        .startWith({lock: true})
        .map(status => {
            return state => Object.assign({}, state, {lock: status.lock, missing: status.lock === true ? 0 : state.missing});
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
            console.log(list);
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
            return state => Object.assign({}, state, {list: state.list.concat(packed.list), missing: state.lock === false ? state.missing + packed.list.length : state.missing});
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
};

function commandView(type, data, list, index, scrollHook, rolePower) {
    switch (type) {
        case 'MESSAGE':
            const dataset = {user_id: data.user_id};
            const simple = index > 0 && list[index - 1].data.user_id === data.user_id;
            const nrole = ROLES[data.role];
            const role = new Array(nrole).fill();

            return li('.dt.hover-bg-near-white.w-100.ph3.pv2', scrollHook, [
                div('.dtc.w2', simple == false ? img({attrs: {src: data.image ? data.image : 'http://via.placeholder.com/40x40'}}) : span('.f7.silver', hour(data.timestamp))),
                div('.dtc.v-top.pl3', [
                    simple == false ? span('.f6.f5-ns.fw6.lh-title.black.db.mb1', [
                        data.username,
                        role.length > 0 ? span('.f6.blue.ml1', role.map(i => span('.icon-star-filled'))) : span()
                    ]) : '',
                    p('.f6.fw4.mt0.mb0.black-60', data.content)
                ]),
                div('.dtc.v-mid.actions', [
                    rolePower > 0 && simple == false ? span('.f5.silver.fr.icon-lock.hover-red.pointer.mute', {
                        dataset,
                        props: {title: 'Silenciar por 5 minutos'}
                    }) : span(),
                    rolePower > 1 && simple == false ? span('.f5.silver.fr.icon-block.hover-red.pointer', {
                        dataset,
                        props: {title: 'Baneo por 1 día'}
                    }) : span(),
                    rolePower > 2 ? span('.f5.silver.fr.icon-star.hover-gold.pointer', {
                        dataset,
                        props: {title: 'Marcar como mensaje destacado'}
                    }) : span(),
                ])
            ]);

            break;
        case 'LOG':
            return li('.dt.hover-bg-near-white.w-100.ph3.pv2', scrollHook, [
                div('.dtc.w2', span('.f7.silver', hour(data.timestamp))),
                div('.dtc.v-top.pl3', p('.f6.fw4.mt0.mb0.silver', Loggers[data.action](data.author, data.user))),
            ]);
            break;
    }
}

function view(state$) {
    return state$.map(state => {
        const channel = state.config.channels[state.channel];
        const nrole = ROLES[state.user.role];
        const onlineTippy = {
            style: {top: '14px'},
            hook: {
                insert(vnode) {
                    const tip = tippy(vnode.elm, {
                        position: 'bottom-end',
                        arrow: true,
                        performance: true,
                        html: '#online-users',
                        popperOptions: {
                            placement: 'bottom'
                        },
                        wait(show, event) {
                            setTimeout(() => {
                                tip.update(popper);
                                show();
                            }, 30);
                        }
                    });
                    const popper = tip.getPopperElement(vnode.elm);
                }
            }
        }

        return main({style: {height: '100%', paddingTop: '62px'}}, [
            header('.bg-blue.pv2.ph4.absolute.top-0.left-0.w-100', nav('.mw9.center', [
                div('.dib.v-mid.w-70', [
                    a('.dib.v-mid', {attrs: {href: 'https://spartangeek.com/'}}, img('.w4', {
                        attrs: {
                            src: '/images/logo.svg',
                            alt: 'SpartanGeek.com'
                        }
                    })),
                    a('.dib.v-mid.white-80.hover-white.pointer.pl4.link', {attrs: {href: 'https://spartangeek.com/'}}, 'Comunidad'),
                    a('.dib.v-mid.white-80.hover-white.pointer.pl4.link', {attrs: {href: 'https://www.youtube.com/user/SpartanGeekTV'}}, 'Canal de Youtube'),
                    a('.dib.v-mid.white-80.hover-white.pointer.pl4.link', {attrs: {href: 'https://spartangeek.com/asistente/'}}, 'Pedir PC Spartana'),
                ]),
                div('.dib.v-mid.w-30.tr', state.user._id == false ? [
                    a('.dib.pa2.white-80.ph3.link', {attrs: {href: 'https://spartangeek.com/'}}, 'Iniciar sesión'),
                    a('.dib.pa2.white-80.bg-black-80.ph3.br2.ba.b--black-30.ml2.link', {attrs: {href: 'https://spartangeek.com/'}}, 'Unirme')
                ] : [
                    a('.dib.v-mid.white-80.pointer.ph3', state.user.username),
                    img('.dib.v-mid.br-100', {
                        attrs: {src: state.user.image || '/images/avatar.svg'},
                        style: {width: '40px', height: '40px'}
                    })
                ])
            ])),
            div('.mw9.center.sans-serif.cf.flex.flex-column.flex-row-ns', {style: {height: '100%'}}, [
                div('.fade-in.w-100.pl4-ns.pt4-ns', {class: {dn: channel.youtubePlayer === false}}, [
                    channel.youtubePlayer === false ? null : iframe('.bn.br2', {
                        props: {
                            width: '100%',
                            height: '300',
                            src: `https://www.youtube.com/embed/${channel.youtubeVideo}`,
                            frameborder: 0,
                            allowfullscreen: true
                        }
                    })
                ]),
                div('.w-100.flex-auto.flex.pa4-ns', [
                    div('.bg-white.br2.flex-auto.shadow.relative.flex.flex-column', [
                        nav('.pa3.ma0.tc.bb.b--black-05.relative', {style: {flex: '0 1 auto'}}, [
                            a('.dib.v-mid.link.black-60.channel.ph2.pointer', {
                                class: {b: state.channel == 'general'},
                                dataset: {id: 'general'}
                            }, 'General'),
                            a('.dib.v-mid.link.black-60.dark.channel.ph2.pointer', {
                                class: {b: state.channel == 'dia-de-hueva'},
                                dataset: {id: 'dia-de-hueva'}
                            }, 'Día de hueva'),
                            a('.dib.v-mid.link.black-60.dark.ph2.pointer.absolute.right-1.ba.b--light-gray.br2.ph2.pv1', onlineTippy, [
                                span('.bg-green.br-100.dib.mr2', {style: {width: '10px', height: '10px'}}),
                                span('.b', String(state.online.length) + ' '),
                                span('.dn.dib-m.dib-l', `${state.online.length > 1 ? 'conectados' : 'conectado'}`),
                                div('#online-users.dn', ul('.list.pa0.ma0', state.online.map(u => {
                                    return li('.ph2', [
                                        img('.dib.v-mid.br-100', {
                                            attrs: {src: u.image == null || u.image == '' ? '/images/avatar.svg' : u.image},
                                            style: {width: '20px', height: '20px'}
                                        }),
                                        span('.ml2', u.username)
                                    ])
                                })))
                            ]),
                        ]),
                        div('.pv3.h6.overflow-auto.list-container.relative', {style: {flex: '1 1 auto'}}, [
                            ul('.list.pa0.ma0', state.list.map((command, index, list) => {
                                const type = command.type;
                                const data = command.data;
                                const scrollHook = {
                                    hook: {
                                        insert: vnode => {
                                            if (state.lock) {
                                                vnode.elm.parentElement.parentElement.scrollTop = vnode.elm.parentElement.offsetHeight;
                                            }
                                        }
                                    }
                                };

                                return commandView(type, data, list, index, scrollHook, nrole);
                            })),
                        ]),
                        div('.white.bg-blue.absolute.pa2.ph3.br2.f6', {
                            class: {dn: state.missing === 0},
                            style: {bottom: '90px', right: '1rem'}
                        }, [
                            b(state.missing),
                            span(' nuevos mensajes')
                        ]),
                        div('.pa3.bt.b--light-gray.relative', {style: {flex: '0 1 auto'}}, [
                            input('.pa2.input-reset.ba.bg-white.b--light-gray.bw1.near-black.w-100.message.br2.outline-0', {
                                props: {
                                    autofocus: true,
                                    type: 'text',
                                    placeholder: 'Escribe tu mensaje aquí',
                                    value: state.message,
                                    disabled: state.user._id === false
                                }
                            }),
                            state.user._id === false ? div('.absolute.top-0.left-0.w-100.tc.bg-near-black.white-90.pv2.h-100', [
                                div('.dib.v-mid.pv3', [
                                    a('.link.underline.white', {attrs: {href: 'https://spartangeek.com'}}, 'Únete'),
                                    ' o ',
                                    a('.link.underline.white', {attrs: {href: 'https://spartangeek.com'}}, 'Inicia sesión'),
                                    ' para escribir en el chat.'
                                ])
                            ]) : null
                        ]),
                    ])
                ])
            ]),

        ]);
    });
}

export function Chat(sources) {
    const actions$ = intent(sources.DOM, sources.socketIO);
    const model$ = model(actions$);
    const vtree$ = view(model$.state$);

    return {
        DOM: vtree$,
        socketIO: model$.socket$
    };
};

function addZero(i) {
    if (i < 10) {
        i = "0" + i;
    }
    return i;
}


function hour(ts) {
    const d = new Date(ts);
    const h = addZero(d.getHours());
    const m = addZero(d.getMinutes());
    const s = addZero(d.getSeconds());

    return h + ":" + m;
}