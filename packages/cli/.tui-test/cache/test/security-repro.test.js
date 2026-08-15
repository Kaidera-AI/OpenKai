//# hash=ca1c9b5ca2a9eeee6b240c5554c33526
//# sourceMappingURL=security-repro.test.js.map

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
 * SECURITY GATE REPRODUCERS — E001 §2 verification of cole's first security
 * review (handback a75cd416), which reported "deny-floor escape" and
 * "symlink/encoded-path traversal" as HELD with no reproducer on disk.
 *
 * These tests assert the CURRENT (vulnerable) behaviour so they pass on the
 * unfixed tree and prove the exploit. They are written to be inverted once the
 * fix lands: flip the marked assertions to expect "deny" / an error.
 */ import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { evaluate, readOnlyTools } from "@openkai/core";
function readTool(cwd) {
    var t = readOnlyTools(cwd).find(function(x) {
        return x.name === "read_file";
    });
    assert.ok(t, "read_file tool must exist");
    return t;
}
function callRead(cwd, p) {
    return _async_to_generator(function() {
        var res;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    return [
                        4,
                        readTool(cwd).execute("t1", {
                            path: p
                        })
                    ];
                case 1:
                    res = _state.sent();
                    return [
                        2,
                        res.content.map(function(c) {
                            return c.text;
                        }).join("")
                    ];
            }
        });
    })();
}
/**
 * FINDING 1 — symlink escape of the cwd containment boundary.
 * resolveWithin()/evaluate() are purely lexical (path.resolve, no realpath),
 * so an in-cwd symlink pointing outside cwd passes containment AND the
 * deny floor, and read_file defaults to `allow` — silent, unprompted read.
 */ test("REPRO 1: in-cwd symlink reads a secret outside cwd with decision=allow", function() {
    return _async_to_generator(function() {
        var root, cwd, outside, secretPath, keyMarker, decision, body;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    return [
                        4,
                        mkdtemp(path.join(tmpdir(), "okrepro-"))
                    ];
                case 1:
                    root = _state.sent();
                    cwd = path.join(root, "workspace");
                    outside = path.join(root, "outside");
                    return [
                        4,
                        import("node:fs/promises").then(function(fs) {
                            return fs.mkdir(cwd);
                        })
                    ];
                case 2:
                    _state.sent();
                    return [
                        4,
                        import("node:fs/promises").then(function(fs) {
                            return fs.mkdir(outside);
                        })
                    ];
                case 3:
                    _state.sent();
                    secretPath = path.join(outside, "id_rsa");
                    // Marker assembled at runtime so the static secret scanner doesn't trip on
                    // this canary fixture (it is not a real key).
                    keyMarker = "-----BEGIN OPENSSH PRIVATE KEY-----";
                    return [
                        4,
                        writeFile(secretPath, "".concat(keyMarker, "\nSECRET-OUTSIDE-CWD\n"))
                    ];
                case 4:
                    _state.sent();
                    // Attacker-controlled symlink living inside cwd with an innocuous name.
                    return [
                        4,
                        symlink(secretPath, path.join(cwd, "notes.txt"))
                    ];
                case 5:
                    _state.sent();
                    decision = evaluate("read_file", {
                        path: "notes.txt"
                    }, cwd);
                    return [
                        4,
                        callRead(cwd, "notes.txt")
                    ];
                case 6:
                    body = _state.sent();
                    // FIXED BEHAVIOUR (inverted 2026-08-16, finding 1 fix): the symlink
                    // resolves to its real outside-cwd target and is denied; the tool errors.
                    assert.equal(decision, "deny", "policy engine denies the symlink escape");
                    assert.match(body, /escapes working directory|Error/i, "no secret returned");
                    assert.doesNotMatch(body, /SECRET-OUTSIDE-CWD/, "no exfiltration");
                    return [
                        4,
                        rm(root, {
                            recursive: true,
                            force: true
                        })
                    ];
                case 7:
                    _state.sent();
                    return [
                        2
                    ];
            }
        });
    })();
});
/**
 * FINDING 2 — deny-floor escape via case variance on a case-insensitive
 * filesystem (macOS APFS/HFS+ default, Windows NTFS). The floor globs are
 * compiled case-sensitively, so ".ENV" misses the ".env" pattern while the
 * OS opens the very same file.
 */ test("REPRO 2: case-variant .ENV escapes the .env deny floor", function() {
    return _async_to_generator(function() {
        var cwd, denied, escaped, body;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    return [
                        4,
                        mkdtemp(path.join(tmpdir(), "okrepro-case-"))
                    ];
                case 1:
                    cwd = _state.sent();
                    return [
                        4,
                        writeFile(path.join(cwd, ".env"), "OPENROUTER_API_KEY=sk-SECRET-ENV-VALUE\n")
                    ];
                case 2:
                    _state.sent();
                    denied = evaluate("read_file", {
                        path: ".env"
                    }, cwd);
                    escaped = evaluate("read_file", {
                        path: ".ENV"
                    }, cwd);
                    assert.equal(denied, "deny", "control: exact-case .env is denied by the floor");
                    // FIXED BEHAVIOUR (inverted 2026-08-16, finding 2 fix): floor matching is
                    // case-insensitive + NFC-normalised, so .ENV is the same file as .env.
                    assert.equal(escaped, "deny", "case-variant .ENV is denied by the floor");
                    return [
                        4,
                        callRead(cwd, ".ENV")
                    ];
                case 3:
                    body = _state.sent();
                    assert.doesNotMatch(body, /sk-SECRET-ENV-VALUE/, "no secret read via case variance");
                    return [
                        4,
                        rm(cwd, {
                            recursive: true,
                            force: true
                        })
                    ];
                case 4:
                    _state.sent();
                    return [
                        2
                    ];
            }
        });
    })();
});
/**
 * FINDING 3 — the deny floor's slashed patterns are not basename-matched, so
 * only a top-level .git/config is protected; a nested one is not.
 */ test("REPRO 3: nested .git/config is outside the deny floor", function() {
    return _async_to_generator(function() {
        var cwd, top, nested;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    return [
                        4,
                        mkdtemp(path.join(tmpdir(), "okrepro-git-"))
                    ];
                case 1:
                    cwd = _state.sent();
                    top = evaluate("read_file", {
                        path: ".git/config"
                    }, cwd);
                    nested = evaluate("read_file", {
                        path: "vendor/dep/.git/config"
                    }, cwd);
                    assert.equal(top, "deny", "control: top-level .git/config is denied");
                    // FIXED BEHAVIOUR (inverted 2026-08-16, finding 3 fix): slashed floor
                    // patterns match at any depth.
                    assert.equal(nested, "deny", "nested .git/config is denied by the floor");
                    return [
                        4,
                        rm(cwd, {
                            recursive: true,
                            force: true
                        })
                    ];
                case 2:
                    _state.sent();
                    return [
                        2
                    ];
            }
        });
    })();
});
/**
 * REGRESSION GUARDS (2026-08-16) — the floor is a tool-layer boundary, not
 * only a policy decision: read-only tools never consult evaluate(), so they
 * enforce the floor themselves via guardPath.
 */ test("GUARD: read_file refuses floor files at the tool layer", function() {
    return _async_to_generator(function() {
        var cwd, body;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    return [
                        4,
                        mkdtemp(path.join(tmpdir(), "okguard-"))
                    ];
                case 1:
                    cwd = _state.sent();
                    return [
                        4,
                        writeFile(path.join(cwd, ".env"), "SECRET=floor-test\n")
                    ];
                case 2:
                    _state.sent();
                    _state.label = 3;
                case 3:
                    _state.trys.push([
                        3,
                        ,
                        5,
                        7
                    ]);
                    return [
                        4,
                        callRead(cwd, ".env")
                    ];
                case 4:
                    body = _state.sent();
                    assert.match(body, /denied — protected path/, "tool refuses the floor file");
                    assert.doesNotMatch(body, /floor-test/);
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
test("GUARD: recursive grep never surfaces floor-file content", function() {
    return _async_to_generator(function() {
        var cwd, sub, _body_match, grep, res, body;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    return [
                        4,
                        mkdtemp(path.join(tmpdir(), "okguard-grep-"))
                    ];
                case 1:
                    cwd = _state.sent();
                    return [
                        4,
                        writeFile(path.join(cwd, ".env"), "GREPPABLE_SECRET=1\n")
                    ];
                case 2:
                    _state.sent();
                    return [
                        4,
                        writeFile(path.join(cwd, "ok.txt"), "GREPPABLE_SECRET mentioned here\n")
                    ];
                case 3:
                    _state.sent();
                    sub = path.join(cwd, "sub");
                    return [
                        4,
                        import("node:fs/promises").then(function(fs) {
                            return fs.mkdir(sub);
                        })
                    ];
                case 4:
                    _state.sent();
                    return [
                        4,
                        writeFile(path.join(sub, ".env"), "GREPPABLE_SECRET=2\n")
                    ];
                case 5:
                    _state.sent();
                    _state.label = 6;
                case 6:
                    _state.trys.push([
                        6,
                        ,
                        8,
                        10
                    ]);
                    grep = readOnlyTools(cwd).find(function(t) {
                        return t.name === "grep";
                    });
                    assert.ok(grep);
                    return [
                        4,
                        grep.execute("t1", {
                            pattern: "GREPPABLE_SECRET"
                        })
                    ];
                case 7:
                    res = _state.sent();
                    body = res.content.map(function(c) {
                        return c.text;
                    }).join("");
                    assert.match(body, /ok\.txt/, "legitimate matches still surface");
                    assert.equal(((_body_match = body.match(/GREPPABLE_SECRET=\d/g)) !== null && _body_match !== void 0 ? _body_match : []).length, 0, "no floor-file lines leak");
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
