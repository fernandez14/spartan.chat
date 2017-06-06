import {div, h1, input, ul, li} from '@cycle/dom';
import xs from 'xstream';
import debounce from 'xstream/extra/debounce';

const ENTER_KEY = 13;
const ESC_KEY = 27;

/**
 *
 * @param dom
 * @returns {Stream|Stream<T1>}
 */
function intent(dom, socket) {
    return xs.merge(
        // Watch all keyup events in textbox.
        dom.select('.message').events('keyup')
            .filter(e => {
                let trimmed = String(e.target.value).trim();
                return trimmed;
            })
            .map(e => ({type: 'message', sent: e.keyCode == ENTER_KEY, payload: String(e.target.value)})),

        // Watch scroll on message list.
        dom.select('.list-container').events('scroll')
            .compose(debounce(100))
            .map(e => ({type: 'feed-scroll', top: e.target.scrollTop, height: e.target.scrollHeight - e.target.clientHeight})),

        // Simulate periodic messages.
        xs.periodic(1000).map(i => ({type: 'others-message', payload: String(i) + ' y seguimos contando....'}))
    );
};

/**
 *
 * @param actions$
 * @returns {MemoryStream|MemoryStream<{list: Array, message: string}>}
 */
function model(actions$) {
    const messages$ = actions$.filter(a => a.type == 'others-message' || (a.type == 'message' && a.sent))
        .map(a => ({message: a.payload.trim()}))
        .fold((acc, c) => acc.concat(c), [])
        .map(list => list.slice(-50));

    const scroll$ = actions$.filter(a => a.type == 'feed-scroll')
        .map(a => ({lock: a.top == a.height}))
        .startWith({lock: true});

    const message$ = actions$.filter(a => a.type == 'message')
        .map(a => ({message: a.sent ? '' : a.payload}))
        .startWith({message: ''});

    const state$ = xs.combine(messages$, message$, scroll$)
        .map(m => {
           let [messages, current, scroll] = m;

           return {list: messages, message: current.message, lock: scroll.lock};
        });

    return state$.startWith({list: [], message: '', lock: true});
};

function view(state$) {
    return state$.map(state => {
        return div('.mw7.center.sans-serif', [
            h1('.tc', 'SpartanGeek'),
            div('.ba.pa3.h6.b--silver.overflow-auto.list-container', {style: {maxHeight: '250px'}}, [
                ul('.list.pa0.ma0', state.list.map(item => {
                    return li('.pv2', {
                        hook: {
                            insert: vnode => {
                                if (state.lock) {
                                    vnode.elm.parentElement.parentElement.scrollTop = vnode.elm.parentElement.offsetHeight;
                                }
                            }
                        }
                    }, item.message);
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
    const state$ = model(actions$);
    const vtree$ = view(state$);

    return {
        DOM: vtree$
    };
};