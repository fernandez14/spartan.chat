import {div, h1, input, ul, li, img, span, p} from '@cycle/dom';
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

    const messages$ = socket.get('chat dia-de-hueva');

    return {msg$, scroll$, messages$};
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

    const state$ = xs.merge(messages$, message$, scroll$)
        .fold((state, action) => {
            return action(state);
        }, {list: [], message: '', lock: true})
        .startWith({list: [], message: '', lock: true});

    return {
        state$,
        sent$
    };
};

function view(state$) {
    return state$.map(state => {
        return div('.mw7.center.sans-serif', [
            h1('.tc', 'SpartanGeek'),
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
        ]);
    });
}

export function Chat(sources) {
    const actions$ = intent(sources.DOM, sources.socketIO);
    const model$ = model(actions$);
    const vtree$ = view(model$.state$);

    const sent$ = model$.sent$
        .map(message => (["chat send", "dia-de-hueva", message.content]))
        .startWith(['chat update-me', 'dia-de-hueva']);

    return {
        DOM: vtree$,
        socketIO: sent$
    };
};