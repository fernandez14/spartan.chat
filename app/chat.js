import {div, h1, input, ul, li, img, span, p, a} from '@cycle/dom';
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

function view(state$) {
    return state$.map(state => {
        return div('.mw9.center.sans-serif.cf.ph4', [
            div('.fl.w-25', [
                ul('.list.pa0', [
                    li('.pa2', a('.link.blue.channel', {class: {b: state.channel == 'general'}, dataset: {id: 'general'}}, 'General')),
                    li('.pa2', a('.link.blue.channel', {class: {b: state.channel == 'dia-de-hueva'}, dataset: {id: 'dia-de-hueva'}}, 'Día de hueva'))
                ])
            ]),
            div('.fl.w-75.pt4', [
                h1('.dn.tc', 'SpartanGeek'),
                div('.ba.pa3.h6.b--silver.overflow-auto.list-container', {style: {maxHeight: '250px'}}, [
                    ul('.list.pa0.ma0', state.list.map((item, index, list) => {
                        const simple = index > 0 && list[index-1].user_id == item.user_id;

                        return li('.dt' + (simple == false ? '.pv2' : '.pb2'), {
                            hook: {
                                insert: vnode => {
                                    if (state.lock) {
                                        vnode.elm.parentElement.parentElement.scrollTop = vnode.elm.parentElement.offsetHeight;
                                    }
                                }
                            }
                        }, [
                            div('.dtc.w2', simple == false ? img({attrs: {src: item.avatar ? item.avatar : 'http://via.placeholder.com/40x40'}}) : ''),
                            div('.dtc.v-top.pl3', [
                                simple == false ? span('.f6.f5-ns.fw6.lh-title.black.db.mb1', item.username) : '',
                                p('.f6.fw4.mt0.mb0.black-60', item.content)
                            ])
                        ]);
                    }))
                ]),
                div('.pv3', [
                    input('.pa2.input-reset.ba.bg-black.b--black.white.w-100.message', {
                        props: {
                            type: 'text',
                            placeholder: 'Escribe tu mensaje aquí',
                            value: state.message
                        }
                    })
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