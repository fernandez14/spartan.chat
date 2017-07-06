import xs from 'xstream';
import debounce from 'xstream/extra/debounce';

const ENTER_KEY = 13;
const ESC_KEY = 27;

/**
 *
 * @param dom
 * @param socket
 * @returns {{config$, actionsLog$, signature$, msg$, scroll$: (Stream|Stream<{type: string, top: (number|*), height: number}>), messages$: (Stream|*), channel$: (MemoryStream|MemoryStream<string>|*), video$: (MemoryStream|MemoryStream<boolean>), mute$, online$, fullReload$}}
 */
export function intent(dom, socket) {

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
        .map(e => ({
            type: 'feed-scroll',
            top: e.target.scrollTop,
            height: e.target.scrollHeight - e.target.offsetHeight
        }));

    const channel$ = dom.select('.channel').events('click')
        .map(e => (e.target.dataset.id))
        .startWith('general');

    const video$ = channel$
        .map(channel => channel == 'dia-de-hueva')
        .startWith(false);

    const mute$ = dom.select('.mute').events('click')
        .map(e => (e.target.dataset.user_id));

    const fullReload$ = dom.select('.fullReload').events('click').map(e => window.location.reload(true));

    const channelMessages$ = channel$.map(name => socket.get('chat ' + name)).flatten();
    const messages$ = xs.merge(channelMessages$, actionsLog$);

    return {config$, actionsLog$, signature$, msg$, scroll$, messages$, channel$, video$, mute$, online$, fullReload$};
}