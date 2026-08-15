//# hash=3f73fb6d29648c8b7f0c59bebe1df00e
//# sourceMappingURL=sessions.js.map

function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) {
    try {
        var info = gen[key](arg);
        var value = info.value;
    } catch (error) {
        reject(error);
        return;
    }
    if (info.done) resolve(value);
    else Promise.resolve(value).then(_next, _throw);
}
function _async_to_generator(fn) {
    return function() {
        var self = this, args = arguments;
        return new Promise(function(resolve, reject) {
            var gen = fn.apply(self, args);
            function _next(value) {
                asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value);
            }
            function _throw(err) {
                asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err);
            }
            _next(undefined);
        });
    };
}
function _instanceof(left, right) {
    "@swc/helpers - instanceof";
    if (right != null && typeof Symbol !== "undefined" && right[Symbol.hasInstance]) {
        return !!right[Symbol.hasInstance](left);
    } else return left instanceof right;
}
function _ts_generator(thisArg, body) {
    var f, y, t, _ = {
        label: 0,
        sent: function() {
            if (t[0] & 1) throw t[1];
            return t[1];
        },
        trys: [],
        ops: []
    }, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype), d = Object.defineProperty;
    return d(g, "next", {
        value: verb(0)
    }), d(g, "throw", {
        value: verb(1)
    }), d(g, "return", {
        value: verb(2)
    }), typeof Symbol === "function" && d(g, Symbol.iterator, {
        value: function() {
            return this;
        }
    }), g;
    function verb(n) {
        return function(v) {
            return step([
                n,
                v
            ]);
        };
    }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while(g && (g = 0, op[0] && (_ = 0)), _)try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [
                op[0] & 2,
                t.value
            ];
            switch(op[0]){
                case 0:
                case 1:
                    t = op;
                    break;
                case 4:
                    _.label++;
                    return {
                        value: op[1],
                        done: false
                    };
                case 5:
                    _.label++;
                    y = op[1];
                    op = [
                        0
                    ];
                    continue;
                case 7:
                    op = _.ops.pop();
                    _.trys.pop();
                    continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) {
                        _ = 0;
                        continue;
                    }
                    if (op[0] === 3 && (!t || op[1] > t[0] && op[1] < t[3])) {
                        _.label = op[1];
                        break;
                    }
                    if (op[0] === 6 && _.label < t[1]) {
                        _.label = t[1];
                        t = op;
                        break;
                    }
                    if (t && _.label < t[2]) {
                        _.label = t[2];
                        _.ops.push(op);
                        break;
                    }
                    if (t[2]) _.ops.pop();
                    _.trys.pop();
                    continue;
            }
            op = body.call(thisArg, _);
        } catch (e) {
            op = [
                6,
                e
            ];
            y = 0;
        } finally{
            f = t = 0;
        }
        if (op[0] & 5) throw op[1];
        return {
            value: op[0] ? op[1] : void 0,
            done: true
        };
    }
}
function _type_of(obj) {
    "@swc/helpers - typeof";
    return obj && typeof Symbol !== "undefined" && obj.constructor === Symbol ? "symbol" : typeof obj;
}
/**
 * `openkai sessions` — list local persisted sessions (D-P2-6, scope §4).
 *
 * Prints one TSV row per session found under `.openkai/sessions/`, with the
 * session id, entry count, and first-user-message snippet. The local JSONL v3
 * tree is the source of truth; this command reads it back without touching
 * Cortex.
 */ import { promises as fs } from "node:fs";
import path from "node:path";
import { SessionStore } from "@openkai/core";
/** Run the sessions listing. */ export function runSessions(options) {
    return _async_to_generator(function() {
        var _options_root, root, entries, unused, sessionIds, _iteratorNormalCompletion, _didIteratorError, _iteratorError, _iterator, _step, sessionId, store, storeEntries, header, messageEntries, firstUser, snippet, parent, error, err;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    root = (_options_root = options.root) !== null && _options_root !== void 0 ? _options_root : path.join(process.cwd(), ".openkai", "sessions");
                    if (options.show) {
                        return [
                            2,
                            showSession(root, options.show)
                        ];
                    }
                    _state.label = 1;
                case 1:
                    _state.trys.push([
                        1,
                        3,
                        ,
                        4
                    ]);
                    return [
                        4,
                        fs.readdir(root, {
                            withFileTypes: true
                        })
                    ];
                case 2:
                    entries = _state.sent();
                    return [
                        3,
                        4
                    ];
                case 3:
                    unused = _state.sent();
                    // No sessions dir yet — clean empty state.
                    process.stdout.write("(no sessions)\n");
                    return [
                        2,
                        0
                    ];
                case 4:
                    sessionIds = entries.filter(function(e) {
                        return e.isDirectory();
                    }).map(function(e) {
                        return e.name;
                    });
                    if (sessionIds.length === 0) {
                        process.stdout.write("(no sessions)\n");
                        return [
                            2,
                            0
                        ];
                    }
                    process.stdout.write("session_id\tentries\tfirst_user_message\n");
                    _iteratorNormalCompletion = true, _didIteratorError = false, _iteratorError = undefined;
                    _state.label = 5;
                case 5:
                    _state.trys.push([
                        5,
                        13,
                        14,
                        15
                    ]);
                    _iterator = sessionIds.sort()[Symbol.iterator]();
                    _state.label = 6;
                case 6:
                    if (!!(_iteratorNormalCompletion = (_step = _iterator.next()).done)) return [
                        3,
                        12
                    ];
                    sessionId = _step.value;
                    store = new SessionStore({
                        root: root,
                        sessionId: sessionId
                    });
                    _state.label = 7;
                case 7:
                    _state.trys.push([
                        7,
                        10,
                        ,
                        11
                    ]);
                    return [
                        4,
                        store.readEntries()
                    ];
                case 8:
                    storeEntries = _state.sent();
                    return [
                        4,
                        store.readHeader()
                    ];
                case 9:
                    header = _state.sent();
                    messageEntries = storeEntries.filter(function(e) {
                        return e.type === "message";
                    });
                    firstUser = messageEntries.find(function(e) {
                        if (e.type !== "message") return false;
                        return e.message.role === "user";
                    });
                    snippet = firstUser && firstUser.type === "message" ? contentSnippet(firstUser.message) : "";
                    parent = (header === null || header === void 0 ? void 0 : header.parentSessionId) ? " ← ".concat(header.parentSessionId.slice(0, 8)) : "";
                    process.stdout.write("".concat(sessionId, "	").concat(messageEntries.length, "	").concat(snippet).concat(parent, "\n"));
                    return [
                        3,
                        11
                    ];
                case 10:
                    error = _state.sent();
                    process.stderr.write("ERROR reading ".concat(sessionId, ": ").concat(_instanceof(error, Error) ? error.message : String(error), "\n"));
                    return [
                        3,
                        11
                    ];
                case 11:
                    _iteratorNormalCompletion = true;
                    return [
                        3,
                        6
                    ];
                case 12:
                    return [
                        3,
                        15
                    ];
                case 13:
                    err = _state.sent();
                    _didIteratorError = true;
                    _iteratorError = err;
                    return [
                        3,
                        15
                    ];
                case 14:
                    try {
                        if (!_iteratorNormalCompletion && _iterator.return != null) {
                            _iterator.return();
                        }
                    } finally{
                        if (_didIteratorError) {
                            throw _iteratorError;
                        }
                    }
                    return [
                        7
                    ];
                case 15:
                    return [
                        2,
                        0
                    ];
            }
        });
    })();
}
/** Show full entry details for one session. */ function showSession(root, sessionId) {
    return _async_to_generator(function() {
        var store, _ref, _ref1, header, entries, _iteratorNormalCompletion, _didIteratorError, _iteratorError, _iterator, _step, entry, parent, id, role, text, error;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    store = new SessionStore({
                        root: root,
                        sessionId: sessionId
                    });
                    _state.label = 1;
                case 1:
                    _state.trys.push([
                        1,
                        4,
                        ,
                        5
                    ]);
                    return [
                        4,
                        store.readHeader()
                    ];
                case 2:
                    header = _state.sent();
                    return [
                        4,
                        store.readEntries()
                    ];
                case 3:
                    entries = _state.sent();
                    process.stdout.write("=== session ".concat(sessionId, " (v").concat((_ref = header === null || header === void 0 ? void 0 : header.version) !== null && _ref !== void 0 ? _ref : "?", ", parent=").concat((_ref1 = header === null || header === void 0 ? void 0 : header.parentSessionId) !== null && _ref1 !== void 0 ? _ref1 : "none", ") ===\n"));
                    _iteratorNormalCompletion = true, _didIteratorError = false, _iteratorError = undefined;
                    try {
                        for(_iterator = entries[Symbol.iterator](); !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true){
                            entry = _step.value;
                            parent = entry.parentId ? entry.parentId.slice(0, 8) : "root";
                            id = entry.id.slice(0, 8);
                            if (entry.type === "message") {
                                role = entry.message.role;
                                text = contentSnippet(entry.message);
                                process.stdout.write("  [".concat(entry.seq, "] ").concat(id, " ← ").concat(parent, "  ").concat(role, ": ").concat(text, "\n"));
                            } else if (entry.type === "custom") {
                                process.stdout.write("  [".concat(entry.seq, "] ").concat(id, " ← ").concat(parent, "  custom:").concat(entry.customType, "\n"));
                            } else {
                                process.stdout.write("  [".concat(entry.seq, "] ").concat(id, " ← ").concat(parent, "  ").concat(entry.type, "\n"));
                            }
                        }
                    } catch (err) {
                        _didIteratorError = true;
                        _iteratorError = err;
                    } finally{
                        try {
                            if (!_iteratorNormalCompletion && _iterator.return != null) {
                                _iterator.return();
                            }
                        } finally{
                            if (_didIteratorError) {
                                throw _iteratorError;
                            }
                        }
                    }
                    return [
                        2,
                        0
                    ];
                case 4:
                    error = _state.sent();
                    process.stderr.write("ERROR: ".concat(_instanceof(error, Error) ? error.message : String(error), "\n"));
                    return [
                        2,
                        1
                    ];
                case 5:
                    return [
                        2
                    ];
            }
        });
    })();
}
/** Extract a short text snippet from a message. */ function contentSnippet(message) {
    var content = "content" in message ? message.content : undefined;
    if (typeof content === "string") {
        return content.replace(/\n/g, " ").slice(0, 60);
    }
    if (Array.isArray(content)) {
        var text = content.filter(function(part) {
            return (typeof part === "undefined" ? "undefined" : _type_of(part)) === "object" && part !== null && "type" in part && part.type === "text";
        }).map(function(part) {
            return part.text;
        }).join("");
        return text.replace(/\n/g, " ").slice(0, 60);
    }
    return "";
}
