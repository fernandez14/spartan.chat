(function() {
  'use strict';

  var globals = typeof global === 'undefined' ? self : global;
  if (typeof globals.require === 'function') return;

  var modules = {};
  var cache = {};
  var aliases = {};
  var has = {}.hasOwnProperty;

  var expRe = /^\.\.?(\/|$)/;
  var expand = function(root, name) {
    var results = [], part;
    var parts = (expRe.test(name) ? root + '/' + name : name).split('/');
    for (var i = 0, length = parts.length; i < length; i++) {
      part = parts[i];
      if (part === '..') {
        results.pop();
      } else if (part !== '.' && part !== '') {
        results.push(part);
      }
    }
    return results.join('/');
  };

  var dirname = function(path) {
    return path.split('/').slice(0, -1).join('/');
  };

  var localRequire = function(path) {
    return function expanded(name) {
      var absolute = expand(dirname(path), name);
      return globals.require(absolute, path);
    };
  };

  var initModule = function(name, definition) {
    var hot = hmr && hmr.createHot(name);
    var module = {id: name, exports: {}, hot: hot};
    cache[name] = module;
    definition(module.exports, localRequire(name), module);
    return module.exports;
  };

  var expandAlias = function(name) {
    return aliases[name] ? expandAlias(aliases[name]) : name;
  };

  var _resolve = function(name, dep) {
    return expandAlias(expand(dirname(name), dep));
  };

  var require = function(name, loaderPath) {
    if (loaderPath == null) loaderPath = '/';
    var path = expandAlias(name);

    if (has.call(cache, path)) return cache[path].exports;
    if (has.call(modules, path)) return initModule(path, modules[path]);

    throw new Error("Cannot find module '" + name + "' from '" + loaderPath + "'");
  };

  require.alias = function(from, to) {
    aliases[to] = from;
  };

  var extRe = /\.[^.\/]+$/;
  var indexRe = /\/index(\.[^\/]+)?$/;
  var addExtensions = function(bundle) {
    if (extRe.test(bundle)) {
      var alias = bundle.replace(extRe, '');
      if (!has.call(aliases, alias) || aliases[alias].replace(extRe, '') === alias + '/index') {
        aliases[alias] = bundle;
      }
    }

    if (indexRe.test(bundle)) {
      var iAlias = bundle.replace(indexRe, '');
      if (!has.call(aliases, iAlias)) {
        aliases[iAlias] = bundle;
      }
    }
  };

  require.register = require.define = function(bundle, fn) {
    if (bundle && typeof bundle === 'object') {
      for (var key in bundle) {
        if (has.call(bundle, key)) {
          require.register(key, bundle[key]);
        }
      }
    } else {
      modules[bundle] = fn;
      delete cache[bundle];
      addExtensions(bundle);
    }
  };

  require.list = function() {
    var list = [];
    for (var item in modules) {
      if (has.call(modules, item)) {
        list.push(item);
      }
    }
    return list;
  };

  var hmr = globals._hmr && new globals._hmr(_resolve, require, modules, cache);
  require._cache = cache;
  require.hmr = hmr && hmr.wrap;
  require.brunch = true;
  globals.require = require;
})();

(function() {
var global = typeof window === 'undefined' ? this : window;
var __makeRelativeRequire = function(require, mappings, pref) {
  var none = {};
  var tryReq = function(name, pref) {
    var val;
    try {
      val = require(pref + '/node_modules/' + name);
      return val;
    } catch (e) {
      if (e.toString().indexOf('Cannot find module') === -1) {
        throw e;
      }

      if (pref.indexOf('node_modules') !== -1) {
        var s = pref.split('/');
        var i = s.lastIndexOf('node_modules');
        var newPref = s.slice(0, i).join('/');
        return tryReq(name, newPref);
      }
    }
    return none;
  };
  return function(name) {
    if (name in mappings) name = mappings[name];
    if (!name) return;
    if (name[0] !== '.' && pref) {
      var val = tryReq(name, pref);
      if (val !== none) return val;
    }
    return require(name);
  }
};
require.register("chat.js", function(exports, require, module) {
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.Chat = Chat;

var _dom = require('@cycle/dom');

var _xstream = require('xstream');

var _xstream2 = _interopRequireDefault(_xstream);

var _debounce = require('xstream/extra/debounce');

var _debounce2 = _interopRequireDefault(_debounce);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var ENTER_KEY = 13;
var ESC_KEY = 27;

/**
 *
 * @param dom
 */
function intent(dom, socket) {
    var msg$ = dom.select('.message').events('keyup').filter(function (e) {
        var trimmed = String(e.target.value).trim();
        return trimmed;
    }).map(function (e) {
        return { type: 'message', sent: e.keyCode == ENTER_KEY, payload: String(e.target.value) };
    });

    var scroll$ = dom.select('.list-container').events('scroll').compose((0, _debounce2.default)(25)).map(function (e) {
        return { type: 'feed-scroll', top: e.target.scrollTop, height: e.target.scrollHeight - e.target.clientHeight };
    });

    var channel$ = dom.select('.channel').events('click').map(function (e) {
        return e.target.dataset.id;
    }).startWith('general');

    var messages$ = channel$.map(function (name) {
        return socket.get('chat ' + name);
    }).flatten();

    return { msg$: msg$, scroll$: scroll$, messages$: messages$, channel$: channel$ };
};

/**
 *
 * @param actions$
 * @returns {MemoryStream|MemoryStream<{list: Array, message: string}>}
 */
function model(actions) {
    var scroll$ = actions.scroll$.map(function (a) {
        return { lock: a.top == a.height };
    }).startWith({ lock: true }).map(function (status) {
        return function (state) {
            return Object.assign({}, state, { lock: status.lock });
        };
    });

    var currentChannel$ = actions.channel$.map(function (channel) {
        return function (state) {
            return Object.assign({}, state, { channel: channel, list: [], lock: true });
        };
    });

    var message$ = actions.msg$.map(function (message) {
        return function (state) {
            return Object.assign({}, state, { message: message.sent ? '' : message.payload });
        };
    });

    var sent$ = actions.msg$.filter(function (m) {
        return m.sent;
    }).map(function (m) {
        return { content: m.payload.trim(), user_id: 'nobody', username: 'nobody', avatar: false };
    });

    var packed$ = sent$.map(function (m) {
        return { list: [m] };
    });
    var messages$ = _xstream2.default.merge(actions.messages$, packed$).map(function (packed) {
        return function (state) {
            return Object.assign({}, state, { list: state.list.concat(packed.list) });
        };
    });

    var state$ = _xstream2.default.merge(messages$, message$, scroll$, currentChannel$).fold(function (state, action) {
        return action(state);
    }, { list: [], message: '', lock: true, channel: 'general' }).startWith({ list: [], message: '', lock: true, channel: 'general' });

    var socketSend$ = _xstream2.default.combine(sent$, actions.channel$).map(function (send) {
        return ['chat send', send[1], send[0].content];
    });
    var socketChannel$ = actions.channel$.map(function (channel) {
        return ['chat update-me', channel];
    });
    var socket$ = _xstream2.default.merge(socketChannel$, socketSend$);

    return {
        state$: state$,
        socket$: socket$
    };
};
var stream = false;
var users2 = false;
var users = false;
var channelName = "";
var favorite = {
    status: false
};
var show_details = false;
var admin = false;

function view(state$) {
    return state$.map(function (state) {
        switch (state.channel) {
            case 'general':
                channelName = "General";
                break;
            case 'dia-de-hueva':
                channelName = "Día de hueva";
                break;
        }
        return (0, _dom.div)('.ng-scope', [(0, _dom.div)('#wrapper', { class: { "stream": stream } }, [!stream ? (0, _dom.div)('#page-content-wrapper', { class: { "no-stream": !stream, "users": users2 } }, [(0, _dom.div)('#panel', [(0, _dom.div)('.panel-title.panel-title-chat', [(0, _dom.p)([(0, _dom.a)([users2 ? (0, _dom.span)([(0, _dom.i)(".fa.fa-circle", {
            "attributes": {
                "aria-hidden": "true",
                "className": "fa fa-circle"
            },
            "style": {
                "name": "style",
                "value": "color: #3DE179;"
            }
        }), " N Spartanos conectados "]) : "", !users2 ? (0, _dom.i)('.fa.fa-angle-double-right') : "", users2 ? (0, _dom.i)('.fa.fa-angle-double-left') : ""])])]), users2 ? (0, _dom.div)('.detail-section-chat.users', [(0, _dom.div)(".search-box", [(0, _dom.div)(".input-group", [(0, _dom.div)(".input-group-addon", [(0, _dom.i)(".fa.fa-search", {
            "attributes": {
                "aria-hidden": "true",
                "className": "fa fa-search"
            }
        })]), (0, _dom.input)(".form-control.mb-20.search", {
            "attributes": {
                "type": "text",
                "ng-model": "searchText.content",
                "placeholder": "Buscar",
                "className": "form-control mb-20 search"
            }
        })])]), (0, _dom.ul)('.user-status', [])]) : ""])]) : "", stream ? (0, _dom.div)('#page-content-wrapper', [(0, _dom.div)('#panelvideo', [(0, _dom.div)('.panel-title', [(0, _dom.div)(".btn-group", {
            "attributes": {
                "role": "group",
                "aria-label": "...",
                "className": "btn-group"
            }
        }, [(0, _dom.button)(".btn.btn-default.channel", {
            "attributes": {
                "type": "button"
            },
            class: { b: state.channel == 'general', "active": state.channel == 'general' },
            dataset: { id: 'general' }
        }, ['General']), (0, _dom.button)(".btn.btn-default.channel", {
            "attributes": {
                "type": "button"
            },
            class: { b: state.channel == 'dia-de-hueva', "active": state.channel == 'dia-de-hueva' },
            dataset: { id: 'dia-de-hueva' }
        }, ['D\xEDa de hueva'])])]), (0, _dom.div)('.detail-section', [(0, _dom.div)(['youtube-media']), favorite.status ? (0, _dom.div)('.favorite-comment') : "", show_details && admin ? (0, _dom.div)('.detail-section', [(0, _dom.h4)(["Configuración"]), (0, _dom.form)('.form-inline', [(0, _dom.div)('.form-group', [(0, _dom.label)(['Código de Youtube']), (0, _dom.input)("#yt-code.form-control", {
            "attributes": {
                "type": "text",
                "placeholder": "abcde123"
            }
        })]), (0, _dom.button)(".btn.btn-default", {
            "attributes": {
                "type": "submit"
            }
        }, ['Actualizar video'])])]) : ""])])]) : "", (0, _dom.div)('#page-members-wrapper', { class: { "no-stream": !stream, "users": users2 } }, [admin && show_details && !stream ? (0, _dom.div)('.detail-section-admin', [(0, _dom.h4)(["Configuración"]), (0, _dom.form)('.form-inline', [(0, _dom.div)('.form-group', [(0, _dom.label)(['Código de Youtube']), (0, _dom.input)("#yt-code.form-control", {
            "attributes": {
                "type": "text",
                "placeholder": "abcde123"
            }
        })]), (0, _dom.button)(".btn.btn-default", {
            "attributes": {
                "type": "submit"
            }
        }, ['Actualizar video'])])]) : "", (0, _dom.div)('#panel', [!stream ? (0, _dom.div)(".panel-title.panel-title-chat.un", {
            class: { "stream": stream },
            style: { display: "none" }
        }, [(0, _dom.p)([(0, _dom.a)({
            "attributes": {
                "href": "#"
            }
        }, [(0, _dom.i)(".fa.fa-circle", {
            "attributes": {
                "aria-hidden": "true"
            },
            style: {
                color: "#3DE179;"
            }
        }), ' N Spartanos conectados\xA0', !users ? (0, _dom.i)(".fa.fa-caret-down") : "", users ? (0, _dom.i)(".fa.fa-caret-up") : ""]), admin ? (0, _dom.a)(".btn.btn-default.btn-icon.btn-round.icon-config", {
            class: { "active": show_details },
            "attributes": {
                "title": "Configurar este canal"
            }
        }, [(0, _dom.i)(".fa.fa-fw.fa-info-circle.icon")]) : ""])]) : "", !stream ? (0, _dom.div)('.panel-title.panel-title-chat', { class: { "stream": stream } }, [(0, _dom.div)(".btn-group", {
            "attributes": {
                "role": "group",
                "aria-label": "...",
                "className": "btn-group"
            }
        }, [(0, _dom.button)(".btn.btn-default.channel", {
            "attributes": {
                "type": "button"
            },
            class: { b: state.channel == 'general', "active": state.channel == 'general' },
            dataset: { id: 'general' }
        }, ['General']), (0, _dom.button)(".btn.btn-default.channel", {
            "attributes": {
                "type": "button"
            },
            class: { b: state.channel == 'dia-de-hueva', "active": state.channel == 'dia-de-hueva' },
            dataset: { id: 'dia-de-hueva' }
        }, ['D\xEDa de hueva'])]), (0, _dom.span)([admin ? (0, _dom.a)(".btn.btn-default.btn-icon.btn-round.icon-config", {
            class: { "active": show_details },
            "attributes": {
                "title": "Configurar este canal"
            }
        }, [(0, _dom.i)(".fa.fa-fw.fa-info-circle.icon")]) : ""])]) : "", stream ? (0, _dom.div)('.panel-title.panel-title-chat', { class: { "stream": stream } }, [(0, _dom.p)([(0, _dom.a)({
            "attributes": {
                "href": "#"
            }
        }, [(0, _dom.i)(".fa.fa-circle", {
            "attributes": {
                "aria-hidden": "true"
            },
            style: {
                color: "#3DE179;"
            }
        }), ' N Spartanos conectados\xA0', !users ? (0, _dom.i)(".fa.fa-caret-down") : "", users ? (0, _dom.i)(".fa.fa-caret-up") : ""]), admin ? (0, _dom.a)(".btn.btn-default.btn-icon.btn-round.icon-config", {
            class: { "active": show_details },
            "attributes": {
                "title": "Configurar este canal"
            }
        }, [(0, _dom.i)(".fa.fa-fw.fa-info-circle.icon")]) : ""])]) : "", !users ? (0, _dom.div)('.detail-section-chat', { class: { "stream": !stream } }, [(0, _dom.div)('.content-chat', [(0, _dom.div)('.message-history', state.list.map(function (item, index, list) {
            var simple = index > 0 && list[index - 1].user_id == item.user_id;
            var tzoffset = new Date(item.timestamp).getTimezoneOffset() * 60000;
            var formattedTime = new Date(Date.now() - tzoffset).toISOString().slice(-13, -5);
            return (0, _dom.div)('.message', {
                class: { "compact": simple },
                hook: {
                    insert: function insert(vnode) {
                        if (state.lock) {
                            vnode.elm.parentElement.parentElement.scrollTop = vnode.elm.parentElement.offsetHeight;
                        }
                    }
                }
            }, [simple == false ? (0, _dom.a)('.author', (0, _dom.img)('.avatar', { attrs: { src: item.avatar ? item.avatar : 'http://via.placeholder.com/40x40' } })) : "", simple == false ? (0, _dom.div)('.meta', [(0, _dom.a)('.username', item.username), (0, _dom.span)(".timestamp", " " + formattedTime)]) : "", simple ? (0, _dom.span)('.timestamp', formattedTime) : "", (0, _dom.div)('.content', item.content)]);
        })), (0, _dom.div)('.footer', { class: { "no-stream": !stream } }, [(0, _dom.div)('.input-box', [(0, _dom.div)('.input-group', [(0, _dom.textarea)('.input-box_text.message.input-reset', {
            props: {
                placeholder: 'Escribe tu mensaje...',
                value: state.message
            }
        })])])])])]) : "", users ? (0, _dom.div)('.detail-section-chat.users', { class: { "stream": !stream } }, [(0, _dom.div)(".search-box", [(0, _dom.div)(".input-group", [(0, _dom.div)(".input-group-addon", [(0, _dom.i)(".fa.fa-search", {
            "attributes": {
                "aria-hidden": "true"
            }
        })]), (0, _dom.input)(".form-control.mb-20.search", {
            "attributes": {
                "type": "text",
                "placeholder": "Buscar"
            }
        })])]), (0, _dom.ul)('.user-status')]) : ""])])])]);
    });
}

function Chat(sources) {
    var actions$ = intent(sources.DOM, sources.socketIO);
    var model$ = model(actions$);
    var vtree$ = view(model$.state$);

    return {
        DOM: vtree$,
        socketIO: model$.socket$
    };
};

});

require.register("initialize.js", function(exports, require, module) {
'use strict';

var _socket = require('socket.io-client');

var _socket2 = _interopRequireDefault(_socket);

var _run = require('@cycle/run');

var _dom = require('@cycle/dom');

var _socket3 = require('./socket');

var _chat = require('./chat');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

document.addEventListener('DOMContentLoaded', function () {
    var drivers = {
        DOM: (0, _dom.makeDOMDriver)('#app'),
        socketIO: (0, _socket3.makeSocketIODriver)((0, _socket2.default)('http://spartangeek.com:3100', { 'query': 'token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiNTY4YjA5ZjY3YTQ3ODAyY2EzNmNhMTE0Iiwic2NvcGUiOlsidXNlciIsImRldmVsb3BlciJdLCJleHAiOjE1MDE0MTA1MjQsImlzcyI6InNwYXJ0YW5nZWVrIn0.9_Y0pm8nQjNKN1_czEnFNClyBhwf70NMsiNwPeSNi_4' }))
    };

    (0, _run.run)(_chat.Chat, drivers);
});

});

require.register("socket.js", function(exports, require, module) {
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.makeSocketIODriver = makeSocketIODriver;

var _xstream = require('xstream');

var _xstream2 = _interopRequireDefault(_xstream);

var _adapt = require('@cycle/run/lib/adapt');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

function makeSocketIODriver(socket) {
    function get(eventName) {
        var _ref = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {},
            _ref$multiArgs = _ref.multiArgs,
            multiArgs = _ref$multiArgs === undefined ? false : _ref$multiArgs;

        var socketStream$ = _xstream2.default.create({
            start: function start(listener) {
                this.eventListener = multiArgs ? function () {
                    for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
                        args[_key] = arguments[_key];
                    }

                    return listener.next(args);
                } : function (arg) {
                    return listener.next(arg);
                };

                socket.on(eventName, this.eventListener);
            },
            stop: function stop() {
                socket.removeListener(eventName, this.eventListener);
            },

            eventListener: null
        });

        return (0, _adapt.adapt)(socketStream$);
    }

    function publish(event) {
        socket.emit.apply(socket, _toConsumableArray(event));
    }

    return function socketIODriver(events$) {
        events$.addListener({
            next: function next(event) {
                return publish(event);
            }
        });

        return {
            get: get,
            dispose: socket.destroy.bind(socket)
        };
    };
}

});

;require.register("___globals___", function(exports, require, module) {
  
});})();require('___globals___');


//# sourceMappingURL=app.js.map