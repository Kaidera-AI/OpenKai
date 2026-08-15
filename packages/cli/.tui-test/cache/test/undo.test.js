//# hash=7cffdf4c46568a2ebc96f04931f4ed33
//# sourceMappingURL=undo.test.js.map

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
/**
 * Shadow-git undo tests (Inc 05). All git operations run inside mkdtemp temp
 * dirs; the operator's real repo is never touched.
 */ import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ShadowGit, ShadowGitError } from "@openkai/core";
function tempProject() {
    return _async_to_generator(function() {
        var cwd;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    return [
                        4,
                        mkdtemp(path.join(tmpdir(), "openkai-shadow-"))
                    ];
                case 1:
                    cwd = _state.sent();
                    return [
                        4,
                        writeFile(path.join(cwd, "a.txt"), "original a\n", "utf-8")
                    ];
                case 2:
                    _state.sent();
                    return [
                        2,
                        cwd
                    ];
            }
        });
    })();
}
test("snapshot commits the full tree and is idempotent when clean", function() {
    return _async_to_generator(function() {
        var cwd, shadow, first, again;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    return [
                        4,
                        tempProject()
                    ];
                case 1:
                    cwd = _state.sent();
                    _state.label = 2;
                case 2:
                    _state.trys.push([
                        2,
                        ,
                        5,
                        7
                    ]);
                    shadow = new ShadowGit(cwd);
                    return [
                        4,
                        shadow.snapshot("before write_file: a.txt")
                    ];
                case 3:
                    first = _state.sent();
                    assert.ok(first.sha.length >= 8);
                    return [
                        4,
                        shadow.snapshot("before write_file: a.txt")
                    ];
                case 4:
                    again = _state.sent();
                    assert.equal(again.sha, first.sha);
                    assert.equal(again.message, "unchanged");
                    return [
                        3,
                        7
                    ];
                case 5:
                    return [
                        4,
                        rm(cwd, {
                            recursive: true,
                            force: true
                        })
                    ];
                case 6:
                    _state.sent();
                    return [
                        7
                    ];
                case 7:
                    return [
                        2
                    ];
            }
        });
    })();
});
test("undo restores modified content", function() {
    return _async_to_generator(function() {
        var cwd, shadow, restored, _;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    return [
                        4,
                        tempProject()
                    ];
                case 1:
                    cwd = _state.sent();
                    _state.label = 2;
                case 2:
                    _state.trys.push([
                        2,
                        ,
                        8,
                        10
                    ]);
                    shadow = new ShadowGit(cwd);
                    return [
                        4,
                        shadow.snapshot("baseline")
                    ];
                case 3:
                    _state.sent();
                    return [
                        4,
                        writeFile(path.join(cwd, "a.txt"), "mutated a\n", "utf-8")
                    ];
                case 4:
                    _state.sent();
                    return [
                        4,
                        shadow.snapshot("before edit_file: a.txt")
                    ];
                case 5:
                    _state.sent();
                    return [
                        4,
                        shadow.undo()
                    ];
                case 6:
                    restored = _state.sent();
                    _ = assert.equal;
                    return [
                        4,
                        readFile(path.join(cwd, "a.txt"), "utf-8")
                    ];
                case 7:
                    _.apply(assert, [
                        _state.sent(),
                        "original a\n"
                    ]);
                    assert.ok(restored.sha.length >= 8);
                    return [
                        3,
                        10
                    ];
                case 8:
                    return [
                        4,
                        rm(cwd, {
                            recursive: true,
                            force: true
                        })
                    ];
                case 9:
                    _state.sent();
                    return [
                        7
                    ];
                case 10:
                    return [
                        2
                    ];
            }
        });
    })();
});
test("undo deletes files created after the target snapshot", function() {
    return _async_to_generator(function() {
        var cwd, shadow, _;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    return [
                        4,
                        tempProject()
                    ];
                case 1:
                    cwd = _state.sent();
                    _state.label = 2;
                case 2:
                    _state.trys.push([
                        2,
                        ,
                        9,
                        11
                    ]);
                    shadow = new ShadowGit(cwd);
                    return [
                        4,
                        shadow.snapshot("baseline")
                    ];
                case 3:
                    _state.sent();
                    return [
                        4,
                        writeFile(path.join(cwd, "new.txt"), "brand new\n", "utf-8")
                    ];
                case 4:
                    _state.sent();
                    return [
                        4,
                        shadow.snapshot("before write_file: new.txt")
                    ];
                case 5:
                    _state.sent();
                    return [
                        4,
                        shadow.undo()
                    ];
                case 6:
                    _state.sent();
                    return [
                        4,
                        assert.rejects(readFile(path.join(cwd, "new.txt"), "utf-8"))
                    ];
                case 7:
                    _state.sent();
                    _ = assert.equal;
                    return [
                        4,
                        readFile(path.join(cwd, "a.txt"), "utf-8")
                    ];
                case 8:
                    _.apply(assert, [
                        _state.sent(),
                        "original a\n"
                    ]);
                    return [
                        3,
                        11
                    ];
                case 9:
                    return [
                        4,
                        rm(cwd, {
                            recursive: true,
                            force: true
                        })
                    ];
                case 10:
                    _state.sent();
                    return [
                        7
                    ];
                case 11:
                    return [
                        2
                    ];
            }
        });
    })();
});
test("undo walks back multiple snapshots in order", function() {
    return _async_to_generator(function() {
        var cwd, shadow, _, _1;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    return [
                        4,
                        tempProject()
                    ];
                case 1:
                    cwd = _state.sent();
                    _state.label = 2;
                case 2:
                    _state.trys.push([
                        2,
                        ,
                        13,
                        15
                    ]);
                    shadow = new ShadowGit(cwd);
                    return [
                        4,
                        shadow.snapshot("v0")
                    ];
                case 3:
                    _state.sent();
                    return [
                        4,
                        writeFile(path.join(cwd, "a.txt"), "v1\n", "utf-8")
                    ];
                case 4:
                    _state.sent();
                    return [
                        4,
                        shadow.snapshot("v1")
                    ];
                case 5:
                    _state.sent();
                    return [
                        4,
                        writeFile(path.join(cwd, "a.txt"), "v2\n", "utf-8")
                    ];
                case 6:
                    _state.sent();
                    return [
                        4,
                        shadow.snapshot("v2")
                    ];
                case 7:
                    _state.sent();
                    return [
                        4,
                        shadow.undo()
                    ];
                case 8:
                    _state.sent();
                    _ = assert.equal;
                    return [
                        4,
                        readFile(path.join(cwd, "a.txt"), "utf-8")
                    ];
                case 9:
                    _.apply(assert, [
                        _state.sent(),
                        "v1\n"
                    ]);
                    return [
                        4,
                        shadow.undo()
                    ];
                case 10:
                    _state.sent();
                    _1 = assert.equal;
                    return [
                        4,
                        readFile(path.join(cwd, "a.txt"), "utf-8")
                    ];
                case 11:
                    _1.apply(assert, [
                        _state.sent(),
                        "original a\n"
                    ]);
                    return [
                        4,
                        assert.rejects(shadow.undo(), function(error) {
                            assert.ok(_instanceof(error, ShadowGitError));
                            assert.match(error.message, /first snapshot/);
                            return true;
                        })
                    ];
                case 12:
                    _state.sent();
                    return [
                        3,
                        15
                    ];
                case 13:
                    return [
                        4,
                        rm(cwd, {
                            recursive: true,
                            force: true
                        })
                    ];
                case 14:
                    _state.sent();
                    return [
                        7
                    ];
                case 15:
                    return [
                        2
                    ];
            }
        });
    })();
});
test("history lists snapshots newest-first with messages", function() {
    return _async_to_generator(function() {
        var cwd, _history_, _history_1, shadow, history;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    return [
                        4,
                        tempProject()
                    ];
                case 1:
                    cwd = _state.sent();
                    _state.label = 2;
                case 2:
                    _state.trys.push([
                        2,
                        ,
                        7,
                        9
                    ]);
                    shadow = new ShadowGit(cwd);
                    return [
                        4,
                        shadow.snapshot("first")
                    ];
                case 3:
                    _state.sent();
                    return [
                        4,
                        writeFile(path.join(cwd, "b.txt"), "b\n", "utf-8")
                    ];
                case 4:
                    _state.sent();
                    return [
                        4,
                        shadow.snapshot("second")
                    ];
                case 5:
                    _state.sent();
                    return [
                        4,
                        shadow.history()
                    ];
                case 6:
                    history = _state.sent();
                    assert.equal(history.length, 2);
                    assert.equal((_history_ = history[0]) === null || _history_ === void 0 ? void 0 : _history_.message, "second");
                    assert.equal((_history_1 = history[1]) === null || _history_1 === void 0 ? void 0 : _history_1.message, "first");
                    return [
                        3,
                        9
                    ];
                case 7:
                    return [
                        4,
                        rm(cwd, {
                            recursive: true,
                            force: true
                        })
                    ];
                case 8:
                    _state.sent();
                    return [
                        7
                    ];
                case 9:
                    return [
                        2
                    ];
            }
        });
    })();
});
test("undo on a fresh project throws ShadowGitError, not a git error", function() {
    return _async_to_generator(function() {
        var cwd, shadow;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    return [
                        4,
                        mkdtemp(path.join(tmpdir(), "openkai-shadow-"))
                    ];
                case 1:
                    cwd = _state.sent();
                    _state.label = 2;
                case 2:
                    _state.trys.push([
                        2,
                        ,
                        4,
                        6
                    ]);
                    shadow = new ShadowGit(cwd);
                    return [
                        4,
                        assert.rejects(shadow.undo(), function(error) {
                            assert.ok(_instanceof(error, ShadowGitError));
                            assert.match(error.message, /no snapshots/);
                            return true;
                        })
                    ];
                case 3:
                    _state.sent();
                    return [
                        3,
                        6
                    ];
                case 4:
                    return [
                        4,
                        rm(cwd, {
                            recursive: true,
                            force: true
                        })
                    ];
                case 5:
                    _state.sent();
                    return [
                        7
                    ];
                case 6:
                    return [
                        2
                    ];
            }
        });
    })();
});
