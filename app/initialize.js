import io from 'socket.io-client';
import {run} from '@cycle/run';
import {makeDOMDriver} from '@cycle/dom';
import {makeSocketIODriver} from './socket';
import {Chat} from './chat';

document.addEventListener('DOMContentLoaded', () => {
    const drivers = {
        DOM: makeDOMDriver('#app'),
        socketIO: makeSocketIODriver(io('http://spartangeek.com:3100', {'query': 'token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiNTY4YjA5ZjY3YTQ3ODAyY2EzNmNhMTE0Iiwic2NvcGUiOlsidXNlciIsImRldmVsb3BlciJdLCJleHAiOjE1MDE0MTA1MjQsImlzcyI6InNwYXJ0YW5nZWVrIn0.9_Y0pm8nQjNKN1_czEnFNClyBhwf70NMsiNwPeSNi_4'}))
    };

    run(Chat, drivers);
});
