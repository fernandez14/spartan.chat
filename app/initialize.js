import io from 'socket.io-client';
import {run} from '@cycle/run';
import {makeDOMDriver} from '@cycle/dom';
import {makeSocketIODriver} from './socket';
import {Chat} from './chat';

document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('id_token');
    let params = {
        forceNew: true,
    };

    if (token !== null && String(token).length > 0) {
        params['query'] = 'token=' + token;
    }

    const socket = io('//spartangeek.com/transmit/', params);
    socket.on('connect', () => {
        socket.emit('user me');
    });

    const drivers = {
        DOM: makeDOMDriver('#app'),
        socketIO: makeSocketIODriver(socket)
    };

    run(Chat, drivers);
});
