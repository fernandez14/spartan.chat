import io from 'socket.io-client';
import {run} from '@cycle/run';
import {makeDOMDriver} from '@cycle/dom';
import {makeSocketIODriver} from './socket';
import {Chat} from './chat';

document.addEventListener('DOMContentLoaded', () => {
    const socket = io('http://localhost:3100', {
        forceNew: true,
        'query': 'token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiNTY4YjA5ZjY3YTQ3ODAyY2EzNmNhMTE0Iiwic2NvcGUiOlsidXNlciIsImRldmVsb3BlciJdLCJleHAiOjE1MDI3MTQxMzksImlzcyI6InNwYXJ0YW5nZWVrIn0.Aw9e8AwV9LELO6FXqHhVx6z89u9JPkjVD_MBnuUNe00'
    });
    socket.on('connect', () => {
        socket.emit('user me');
    });

    const drivers = {
        DOM: makeDOMDriver('#app'),
        socketIO: makeSocketIODriver(socket)
    };

    run(Chat, drivers);
});
