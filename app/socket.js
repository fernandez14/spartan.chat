import xs from 'xstream';
import {adapt} from '@cycle/run/lib/adapt';

export function makeSocketIODriver(socket) {
    function get(eventName, { multiArgs = false } = {}) {
        const socketStream$ = xs.create({
            start(listener) {
                this.eventListener = multiArgs
                    ? (...args) => listener.next(args)
                    : arg => listener.next(arg);

                socket.on(eventName, this.eventListener);
            },
            stop() {
                socket.removeListener(eventName, this.eventListener);
            },
            eventListener: null,
        });

        return adapt(socketStream$);
    }

    function publish(event) {
        socket.emit(...event);
    }

    return function socketIODriver(events$) {
        events$.addListener({
            next: event => publish(event)
        });

        return {
            get,
            dispose: socket.destroy.bind(socket)
        }
    };
}