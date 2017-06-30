import {div, h1, input, ul, li, img, span, p, a, i, textarea, button, form, h4, label} from '@cycle/dom';
import xs from 'xstream';
import debounce from 'xstream/extra/debounce';

const ENTER_KEY = 13;
const ESC_KEY = 27;

/**
 *
 * @param dom
 */
function intent(dom, socket) {
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

    const messages$ = channel$.map(name => socket.get('chat ' + name)).flatten();

    return {msg$, scroll$, messages$, channel$};
};

/**
 *
 * @param actions$
 * @returns {MemoryStream|MemoryStream<{list: Array, message: string}>}
 */
function model(actions) {
    const scroll$ = actions.scroll$
        .map(a => ({lock: a.top == a.height}))
        .startWith({lock: true})
        .map(status => {
            return state => Object.assign({}, state, {lock: status.lock});
        });

    const currentChannel$ = actions.channel$
        .map(channel => {
            return state => Object.assign({}, state, {channel: channel, list: [], lock: true});
        })

    const message$ = actions.msg$
        .map(message => {
            return state => Object.assign({}, state, {message: message.sent ? '' : message.payload})
        }); 

    const sent$ = actions.msg$.filter(m => m.sent)
        .map(m => ({content: m.payload.trim(), user_id: 'nobody', username: 'nobody', avatar: false}));

    const packed$ = sent$.map(m => ({list: [m]}));
    const messages$ = xs.merge(actions.messages$, packed$)
        .map(packed => {
            return state => Object.assign({}, state, {list: state.list.concat(packed.list)});
        });

    const state$ = xs.merge(messages$, message$, scroll$, currentChannel$)
        .fold((state, action) => action(state), {list: [], message: '', lock: true, channel: 'general'})
        .startWith({list: [], message: '', lock: true, channel: 'general'});

    const socketSend$ = xs.combine(sent$, actions.channel$).map(send => (['chat send', send[1], send[0].content]));
    const socketChannel$ = actions.channel$.map(channel => (['chat update-me', channel]));
    const socket$ = xs.merge(socketChannel$, socketSend$);

    return {
        state$,
        socket$
    };
};
let stream = false;
let users2 = false;
let users = false;
let channelName = "";
let favorite = {
    status:false
};
let show_details = false;
let admin = false;

function view(state$) {
    return state$.map(state => {
        switch(state.channel){
            case 'general':
                channelName="General";
            break;
            case 'dia-de-hueva':
                channelName="Día de hueva";
            break;
        }
        return div('.ng-scope',[
            div('#wrapper', {class: {"stream": stream}}, [
                !stream ? div('#page-content-wrapper', {class: {"no-stream": !stream,"users": users2}}, [
                    div('#panel',[
                        div('.panel-title.panel-title-chat',[
                            p([
                                a([
                                    users2 ? span([
                                        i(".fa.fa-circle", {
                                            "attributes": {
                                                "aria-hidden": "true",
                                                "className": "fa fa-circle"
                                            },
                                            "style": {
                                                "name": "style",
                                                "value": "color: #3DE179;"
                                            }
                                        }),
                                        " N Spartanos conectados "
                                    ]):"",
                                    !users2 ? i('.fa.fa-angle-double-right'):"",
                                    users2 ? i('.fa.fa-angle-double-left'):"",
                                ])
                            ])
                        ]),
                        users2 ? div('.detail-section-chat.users',[
                            div(".search-box", [
                                div(".input-group", [
                                    div(".input-group-addon", [
                                        i(".fa.fa-search", {
                                            "attributes": {
                                                "aria-hidden": "true",
                                                "className": "fa fa-search"
                                            }
                                        })
                                    ]),
                                    input(".form-control.mb-20.search", {
                                        "attributes": {
                                            "type": "text",
                                            "ng-model": "searchText.content",
                                            "placeholder": "Buscar",
                                            "className": "form-control mb-20 search"
                                        }
                                    })
                                ])
                            ]),
                            ul('.user-status',[])
                        ]):""
                    ])
                ]):"",
                stream ? div('#page-content-wrapper',[
                    div('#panelvideo',[
                        div('.panel-title',[
                            div(".btn-group", {
                                "attributes": {
                                    "role": "group",
                                    "aria-label": "...",
                                    "className": "btn-group"
                                }
                                }, [
                                button(".btn.btn-default.channel", {
                                    "attributes": {
                                        "type": "button"
                                    },
                                    class: {b: state.channel == 'general',"active":state.channel == 'general'},
                                    dataset: {id: 'general'}
                                }, [`General`]),
                                button(".btn.btn-default.channel", {
                                    "attributes": {
                                        "type": "button"
                                    },
                                    class: {b: state.channel == 'dia-de-hueva',"active":state.channel == 'dia-de-hueva'},
                                    dataset: {id: 'dia-de-hueva'}
                                }, [`Día de hueva`])
                            ])
                        ]),
                        div('.detail-section',[
                            div(['youtube-media']),
                            favorite.status ? div('.favorite-comment'):"",
                            show_details && admin ? div('.detail-section',[
                                h4(["Configuración"]),
                                form('.form-inline',[
                                    div('.form-group',[
                                        label(['Código de Youtube']),
                                        input("#yt-code.form-control", {
                                            "attributes": {
                                                "type": "text",
                                                "placeholder": "abcde123"
                                            }
                                        })
                                    ]),
                                    button(".btn.btn-default", {
                                        "attributes": {
                                            "type": "submit"
                                        }
                                    }, [`Actualizar video`])
                                ])
                            ]):""
                        ])
                    ])
                ]):"",
                div('#page-members-wrapper', {class: {"no-stream": !stream,"users": users2}}, [
                    admin && show_details && !stream ? div('.detail-section-admin',[
                        h4(["Configuración"]),
                        form('.form-inline',[
                            div('.form-group',[
                                label(['Código de Youtube']),
                                input("#yt-code.form-control", {
                                    "attributes": {
                                        "type": "text",
                                        "placeholder": "abcde123"
                                    }
                                })
                            ]),
                            button(".btn.btn-default", {
                                "attributes": {
                                    "type": "submit"
                                }
                            }, [`Actualizar video`])
                        ])
                    ]):"",
                    div('#panel',[
                        !stream ? div(".panel-title.panel-title-chat.un", {
                            class: {"stream":stream},
                            style:{display:"none"}
                        },[
                            p([
                                a({
                                    "attributes": {
                                        "href": "#"
                                    }
                                }, [
                                    i(".fa.fa-circle", {
                                        "attributes": {
                                            "aria-hidden": "true"
                                        },
                                        style: {
                                            color: "#3DE179;"
                                        }
                                    }),
                                    ` N Spartanos conectados `,
                                    !users ? i(".fa.fa-caret-down"):"",
                                    users ? i(".fa.fa-caret-up"):""
                                ]),
                                admin ? a(".btn.btn-default.btn-icon.btn-round.icon-config", {
                                    class: {"active":show_details},
                                    "attributes": {
                                        "title": "Configurar este canal"
                                    }
                                }, [
                                    i(".fa.fa-fw.fa-info-circle.icon")
                                ]):""
                            ])
                        ]):"",
                        !stream ? div('.panel-title.panel-title-chat',{class: {"stream": stream}},[
                            div(".btn-group", {
                                "attributes": {
                                    "role": "group",
                                    "aria-label": "...",
                                    "className": "btn-group"
                                }
                                }, [
                                button(".btn.btn-default.channel", {
                                    "attributes": {
                                        "type": "button"
                                    },
                                    class: {b: state.channel == 'general',"active":state.channel == 'general'},
                                    dataset: {id: 'general'}
                                }, [`General`]),
                                button(".btn.btn-default.channel", {
                                    "attributes": {
                                        "type": "button"
                                    },
                                    class: {b: state.channel == 'dia-de-hueva',"active":state.channel == 'dia-de-hueva'},
                                    dataset: {id: 'dia-de-hueva'}
                                }, [`Día de hueva`])
                            ]),
                            span([
                                admin ? a(".btn.btn-default.btn-icon.btn-round.icon-config", {
                                    class: {"active":show_details},
                                    "attributes": {
                                        "title": "Configurar este canal"
                                    }
                                }, [
                                    i(".fa.fa-fw.fa-info-circle.icon")
                                ]):""
                            ])
                        ]):"",
                        stream ? div('.panel-title.panel-title-chat',{class: {"stream": stream}},[
                            p([
                                a({
                                    "attributes": {
                                        "href": "#"
                                    }
                                }, [
                                    i(".fa.fa-circle", {
                                        "attributes": {
                                            "aria-hidden": "true"
                                        },
                                        style: {
                                            color: "#3DE179;"
                                        }
                                    }),
                                    ` N Spartanos conectados `,
                                    !users ? i(".fa.fa-caret-down"):"",
                                    users ? i(".fa.fa-caret-up"):""
                                ]),
                                admin ? a(".btn.btn-default.btn-icon.btn-round.icon-config", {
                                    class: {"active":show_details},
                                    "attributes": {
                                        "title": "Configurar este canal"
                                    }
                                }, [
                                    i(".fa.fa-fw.fa-info-circle.icon")
                                ]):""
                            ])
                        ]):"",
                        /********************************************************************* 
                         * Chat messages
                         *********************************************************************/
                        !users ? div('.detail-section-chat',{class: {"stream": !stream}},[
                            div('.content-chat',[
                                div('.message-history', state.list.map((item, index, list) => {
                                    const simple = index > 0 && list[index-1].user_id == item.user_id;
                                    var tzoffset = (new Date(item.timestamp)).getTimezoneOffset() * 60000;
                                    var formattedTime = new Date(Date.now() - tzoffset).toISOString().slice(-13, -5);
                                    return div('.message', {
                                        class: {"compact": simple},
                                        hook: {
                                            insert: vnode => {
                                                if (state.lock) {
                                                    vnode.elm.parentElement.parentElement.scrollTop = vnode.elm.parentElement.offsetHeight;
                                                }
                                            }
                                        }
                                    }, [
                                        simple == false ? a('.author', img('.avatar',{attrs: {src: item.avatar ? item.avatar : 'http://via.placeholder.com/40x40'}})) : "",
                                        simple == false ? div('.meta',[
                                            a('.username',item.username),
                                            span(".timestamp", " "+formattedTime)
                                        ]) : "",
                                        simple ? span('.timestamp',formattedTime):"",
                                        div('.content',item.content)
                                    ]);
                                })),
                                div('.footer',{class: {"no-stream": !stream}},[
                                    div('.input-box',[
                                        div('.input-group',[
                                            textarea('.input-box_text.message.input-reset', {
                                                props: 
                                                {
                                                    placeholder: 'Escribe tu mensaje...',
                                                    value: state.message
                                                }
                                            })
                                        ])
                                    ])
                                ])
                            ])
                        ]):"",
                        /********************************************************************* 
                         * End Chat messages
                         *********************************************************************/
                        users ? div('.detail-section-chat.users',{class: {"stream": !stream}},[
                            div(".search-box", [
                                div(".input-group", [
                                    div(".input-group-addon", [
                                        i(".fa.fa-search", {
                                            "attributes": {
                                            "aria-hidden": "true"
                                            }
                                        })
                                    ]),
                                    input(".form-control.mb-20.search", {
                                        "attributes": {
                                            "type": "text",
                                            "placeholder": "Buscar"
                                        }
                                    })
                                ])
                            ]),
                            ul('.user-status')
                        ]):""
                    ])
                ])
            ])
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