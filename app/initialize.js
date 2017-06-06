import io from 'socket.io-client';
import {run} from '@cycle/run';
import {makeDOMDriver} from '@cycle/dom';
import {makeSocketIODriver} from 'cycle-socket.io';
import {Chat} from './chat';

document.addEventListener('DOMContentLoaded', () => {
    const drivers = {
        DOM: makeDOMDriver('#app'),
        socketIO: makeSocketIODriver(io('http://localhost:3100', {'query': 'token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiNTY4YjA5ZjY3YTQ3ODAyY2EzNmNhMTE0Iiwic2NvcGUiOlsidXNlciIsImRldmVsb3BlciJdLCJleHAiOjE0OTY3NzQwNTQsImlzcyI6InNwYXJ0YW5nZWVrIn0.U3wNGGRfklRmCu-M22o-64Zh8NRJ9Sy9LHF0DqVgL5c'}))
    };

    run(Chat, drivers);
});
