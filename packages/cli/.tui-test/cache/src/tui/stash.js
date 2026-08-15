//# hash=b191435999b304f656064fe96ef73abe
//# sourceMappingURL=stash.js.map

function _array_like_to_array(arr, len) {
    if (len == null || len > arr.length) len = arr.length;
    for(var i = 0, arr2 = new Array(len); i < len; i++)arr2[i] = arr[i];
    return arr2;
}
function _array_without_holes(arr) {
    if (Array.isArray(arr)) return _array_like_to_array(arr);
}
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
function _class_call_check(instance, Constructor) {
    if (!(instance instanceof Constructor)) throw new TypeError("Cannot call a class as a function");
}
function _defineProperties(target, props) {
    for(var i = 0; i < props.length; i++){
        var descriptor = props[i];
        descriptor.enumerable = descriptor.enumerable || false;
        descriptor.configurable = true;
        if ("value" in descriptor) descriptor.writable = true;
        Object.defineProperty(target, descriptor.key, descriptor);
    }
}
function _create_class(Constructor, protoProps, staticProps) {
    if (protoProps) _defineProperties(Constructor.prototype, protoProps);
    if (staticProps) _defineProperties(Constructor, staticProps);
    return Constructor;
}
function _define_property(obj, key, value) {
    if (key in obj) {
        Object.defineProperty(obj, key, {
            value: value,
            enumerable: true,
            configurable: true,
            writable: true
        });
    } else obj[key] = value;
    return obj;
}
function _iterable_to_array(iter) {
    if (typeof Symbol !== "undefined" && iter[Symbol.iterator] != null || iter["@@iterator"] != null) {
        return Array.from(iter);
    }
}
function _non_iterable_spread() {
    throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
}
function _to_consumable_array(arr) {
    return _array_without_holes(arr) || _iterable_to_array(arr) || _unsupported_iterable_to_array(arr) || _non_iterable_spread();
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
function _unsupported_iterable_to_array(o, minLen) {
    if (!o) return;
    if (typeof o === "string") return _array_like_to_array(o, minLen);
    var n = Object.prototype.toString.call(o).slice(8, -1);
    if (n === "Object" && o.constructor) n = o.constructor.name;
    if (n === "Map" || n === "Set") return Array.from(n);
    if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _array_like_to_array(o, minLen);
}
/**
 * Prompt stash + frecency-ranked history (scope §1.4).
 *
 * Two pure-function cores plus a thin local-state store. The scope §3 verify
 * rule: frecency ordering + stash push/pop are **pure functions** — tested
 * without the TUI. The persistence layer (read/write `.openkai/`) is a small
 * JSON wrapper; it is the only I/O in this module.
 *
 * - {@link PromptStash}: a LIFO draft stack (Ctrl+S to stash a draft, Ctrl+S
 *   on an empty composer to pop the top back in).
 * - {@link rankFrecency} / {@link frecencyScore}: pure ranking by
 *   frequency × recency decay.
 * - {@link FrecencyHistory}: persists `text -> {count, lastUsed}` under
 *   `.openkai/history.json` (gitignored local state, scope §1.4).
 */ import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
// ── Prompt stash (pure) ─────────────────────────────────────────────────────
/**
 * A LIFO draft stack (scope §1.4). Pure array ops over a private array; no
 * I/O, no timers. `push` ignores empty drafts so a stray Ctrl+S on an empty
 * composer does not push a phantom frame.
 */ export var PromptStash = /*#__PURE__*/ function() {
    "use strict";
    function PromptStash() {
        _class_call_check(this, PromptStash);
        _define_property(this, "stack", []);
    }
    _create_class(PromptStash, [
        {
            /** Push a draft onto the stack. Empty drafts are ignored. */ key: "push",
            value: function push(text) {
                if (text.length > 0) this.stack.push(text);
            }
        },
        {
            /** Pop the most-recently stashed draft, or `undefined` when empty. */ key: "pop",
            value: function pop() {
                return this.stack.pop();
            }
        },
        {
            /** Peek the top without popping. */ key: "peek",
            value: function peek() {
                return this.stack[this.stack.length - 1];
            }
        },
        {
            key: "size",
            get: /** Number of stashed drafts. */ function get() {
                return this.stack.length;
            }
        },
        {
            key: "isEmpty",
            get: /** True when the stash holds nothing. */ function get() {
                return this.stack.length === 0;
            }
        }
    ]);
    return PromptStash;
}();
/** One hour in ms (the recency-decay timescale). */ var HOUR_MS = 3600000;
/**
 * Frecency score: `count / (1 + ageHours)` (scope §1.4 — frequency + recency).
 * Pure: depends only on the entry + `now`. Higher is better; recency decays so
 * a frequently-used old prompt can still outrank a fresh one-shot, but a
 * just-submitted prompt always scores at least its count.
 */ export function frecencyScore(entry, now) {
    var ageMs = Math.max(0, now - entry.lastUsed);
    var ageHours = ageMs / HOUR_MS;
    return entry.count / (1 + ageHours);
}
/**
 * Rank entries by frecency score, descending (best first). Pure: returns a new
 * array, leaves the input untouched. Ties break on `lastUsed` (newer first),
 * then `text` (stable, deterministic) so the order is reproducible in tests.
 */ export function rankFrecency(entries, now) {
    return _to_consumable_array(entries).map(function(entry) {
        return {
            entry: entry,
            score: frecencyScore(entry, now)
        };
    }).sort(function(a, b) {
        if (b.score !== a.score) return b.score - a.score;
        if (b.entry.lastUsed !== a.entry.lastUsed) return b.entry.lastUsed - a.entry.lastUsed;
        return a.entry.text < b.entry.text ? -1 : a.entry.text > b.entry.text ? 1 : 0;
    }).map(function(r) {
        return r.entry;
    });
}
/**
 * Frecency history persisted under `.openkai/history.json` (scope §1.4). The
 * ranking is the pure {@link rankFrecency}; this class only reads/writes JSON
 * and updates `count` / `lastUsed`. Missing file -> empty (first run).
 */ export var FrecencyHistory = /*#__PURE__*/ function() {
    "use strict";
    function FrecencyHistory(filePath) {
        _class_call_check(this, FrecencyHistory);
        _define_property(this, "filePath", void 0);
        _define_property(this, "entries", void 0);
        this.filePath = filePath;
        this.entries = new Map();
    }
    _create_class(FrecencyHistory, [
        {
            key: "load",
            value: /** Load from disk. Missing/corrupt file -> empty (no throw). */ function load() {
                return _async_to_generator(function() {
                    var raw, parsed, unused;
                    return _ts_generator(this, function(_state) {
                        switch(_state.label){
                            case 0:
                                _state.trys.push([
                                    0,
                                    2,
                                    ,
                                    3
                                ]);
                                return [
                                    4,
                                    readFile(this.filePath, "utf-8")
                                ];
                            case 1:
                                raw = _state.sent();
                                parsed = JSON.parse(raw);
                                if (parsed && _type_of(parsed.entries) === "object") {
                                    this.entries = new Map(Object.entries(parsed.entries));
                                }
                                return [
                                    3,
                                    3
                                ];
                            case 2:
                                unused = _state.sent();
                                // Missing or corrupt: start empty.
                                this.entries = new Map();
                                return [
                                    3,
                                    3
                                ];
                            case 3:
                                return [
                                    2
                                ];
                        }
                    });
                }).call(this);
            }
        },
        {
            key: "save",
            value: /** Persist to disk (atomic-ish: mkdir -p then write). */ function save() {
                return _async_to_generator(function() {
                    var file;
                    return _ts_generator(this, function(_state) {
                        switch(_state.label){
                            case 0:
                                file = {
                                    entries: Object.fromEntries(this.entries)
                                };
                                return [
                                    4,
                                    mkdir(path.dirname(this.filePath), {
                                        recursive: true
                                    })
                                ];
                            case 1:
                                _state.sent();
                                return [
                                    4,
                                    writeFile(this.filePath, JSON.stringify(file, null, 2), "utf-8")
                                ];
                            case 2:
                                _state.sent();
                                return [
                                    2
                                ];
                        }
                    });
                }).call(this);
            }
        },
        {
            /** Record a submission: bump `count` + set `lastUsed`. */ key: "record",
            value: function record(text, now) {
                var trimmed = text.trim();
                if (trimmed.length === 0) return;
                var existing = this.entries.get(trimmed);
                if (existing) {
                    existing.count += 1;
                    existing.lastUsed = now;
                } else {
                    this.entries.set(trimmed, {
                        text: trimmed,
                        count: 1,
                        lastUsed: now
                    });
                }
            }
        },
        {
            /** All entries (read-only view for ranking). */ key: "entriesList",
            value: function entriesList() {
                return _to_consumable_array(this.entries.values());
            }
        },
        {
            /** Frecency-ranked entries, best first (delegates to the pure ranker). */ key: "ranked",
            value: function ranked(now) {
                return rankFrecency(this.entriesList(), now);
            }
        }
    ]);
    return FrecencyHistory;
}();
