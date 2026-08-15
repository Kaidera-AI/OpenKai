//# hash=b96975c699d240636f5ff324d082aa29
//# sourceMappingURL=permissions.test.js.map

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
 * P4b permission engine + protocol-v2 approval-channel tests (scope §6).
 *
 * Deterministic + offline: pure {@link evaluate} policy tests need no I/O; the
 * transport round-trip tests use a pi-ai faux provider (scripted `write_file`
 * tool calls) + a real {@link InProcessTransport} with the permission gate
 * enabled. All filesystem mutation is confined to a `node:fs.mkdtemp` temp dir;
 * no test runs a destructive shell command (the `bash` guarantee is proved by
 * the pure engine, not by executing bash).
 */ import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, access, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createModels, uuidv7 } from "@earendil-works/pi-ai";
import { fauxProvider, fauxAssistantMessage, fauxText, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import { InProcessTransport, evaluate } from "@openkai/core";
import { PermissionOverlay } from "../dist/tui/permission.js";
import { OVERLAY_FOOTER } from "../dist/tui/theme.js";
/** Strip ANSI escape sequences for plain-text assertions. */ function stripAnsi(text) {
    return text.replace(/\x1b\[[0-9;]*m/g, "");
}
// ── A. Pure policy engine (scope §3) — no I/O, no transport ───────────────────
test("policy: .env stays denied even with a trailing `allow **` rule (deny is terminal)", function() {
    var cwd = "/proj";
    var rules = [
        {
            path: "**",
            decision: "allow",
            label: "allow-all"
        }
    ];
    // The deny floor is checked before the rule walk, so the last `allow **` rule
    // cannot promote a protected path. Last-match-wins sits *under* the floor.
    assert.equal(evaluate("write_file", {
        path: ".env"
    }, cwd, rules), "deny");
    assert.equal(evaluate("write_file", {
        path: "secrets/.env"
    }, cwd, rules), "deny");
    assert.equal(evaluate("write_file", {
        path: ".env.local"
    }, cwd, rules), "deny");
    assert.equal(evaluate("edit_file", {
        path: ".env"
    }, cwd, rules), "deny");
});
test("policy: last-match-wins ordering across two overlapping globs", function() {
    var cwd = "/proj";
    var rules = [
        {
            path: "src/**",
            decision: "ask",
            label: "src-ask"
        },
        {
            path: "src/*.ts",
            decision: "allow",
            label: "ts-allow"
        }
    ];
    // `src/a.ts` matches both; the later `ts-allow` wins → allow.
    assert.equal(evaluate("write_file", {
        path: "src/a.ts"
    }, cwd, rules), "allow");
    // `src/a.js` matches only the first → ask.
    assert.equal(evaluate("write_file", {
        path: "src/a.js"
    }, cwd, rules), "ask");
    // Outside src → default ask (no rule matches).
    assert.equal(evaluate("write_file", {
        path: "README.md"
    }, cwd, rules), "ask");
});
test("policy: bash never resolves to allow (the dangerous-one backstop)", function() {
    var cwd = "/proj";
    // A trailing `allow **` path rule doesn't match bash (no path arg) → ask.
    assert.equal(evaluate("bash", {
        command: "echo hi"
    }, cwd, [
        {
            path: "**",
            decision: "allow"
        }
    ]), "ask");
    // Even a match-all rule (no tool, no path) cannot promote bash past ask — the
    // engine clamps an `allow` for bash back to `ask`.
    assert.equal(evaluate("bash", {
        command: "rm -rf /"
    }, cwd, [
        {
            decision: "allow"
        }
    ]), "ask");
    // An explicit bash-targeted allow is also clamped.
    assert.equal(evaluate("bash", {
        command: "echo hi"
    }, cwd, [
        {
            tool: "bash",
            decision: "allow"
        }
    ]), "ask");
    // A deny rule still denies.
    assert.equal(evaluate("bash", {
        command: "echo hi"
    }, cwd, [
        {
            decision: "deny"
        }
    ]), "deny");
});
test("policy: out-of-cwd paths are denied", function() {
    var cwd = "/proj";
    assert.equal(evaluate("write_file", {
        path: "../outside.txt"
    }, cwd), "deny");
    assert.equal(evaluate("read_file", {
        path: "../../etc/passwd"
    }, cwd), "deny");
    // A path that resolves back into cwd via `..` is fine.
    assert.equal(evaluate("write_file", {
        path: "sub/../inside.txt"
    }, cwd), "ask");
    // An absolute path inside cwd is fine.
    assert.equal(evaluate("write_file", {
        path: "/proj/inside.txt"
    }, cwd), "ask");
    // An absolute path outside cwd is denied.
    assert.equal(evaluate("write_file", {
        path: "/etc/hosts"
    }, cwd), "deny");
});
// ── B. Transport round-trip + always-scoping (scope §6) — real gate, tmp fs ──
/** Build a gated transport over a faux provider, cwd = `tmpDir`, scripted responses. */ function buildGatedTransport(tmpDir, responses) {
    var faux = fauxProvider({});
    faux.setResponses(responses);
    var models = createModels();
    models.setProvider(faux.provider);
    return new InProcessTransport({
        sessionId: uuidv7(),
        modelId: "faux-1",
        models: models,
        provider: "faux",
        cwd: tmpDir,
        enablePermissions: true
    });
}
/** Drain transport events; call `onPermissionRequest(requestId)` when one arrives. */ function drainEvents(transport, onPermissionRequest) {
    return _async_to_generator(function() {
        var _iter_return, events, permissionCount, iter, _ref, value, done;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    events = [];
                    permissionCount = 0;
                    iter = transport.events()[Symbol.asyncIterator]();
                    _state.label = 1;
                case 1:
                    return [
                        4,
                        iter.next()
                    ];
                case 2:
                    _ref = _state.sent(), value = _ref.value, done = _ref.done;
                    if (done) return [
                        3,
                        4
                    ];
                    events.push(value);
                    if (value.kind === "permission_request") {
                        permissionCount += 1;
                        onPermissionRequest(value.requestId, {
                            toolName: value.toolName,
                            rule: value.rule
                        });
                    }
                    _state.label = 3;
                case 3:
                    return [
                        3,
                        1
                    ];
                case 4:
                    return [
                        4,
                        (_iter_return = iter.return) === null || _iter_return === void 0 ? void 0 : _iter_return.call(iter)
                    ];
                case 5:
                    _state.sent();
                    return [
                        2,
                        {
                            events: events,
                            permissionCount: permissionCount
                        }
                    ];
            }
        });
    })();
}
/** File exists helper (rejects with ENOENT → false). */ function fileExists(p) {
    return _async_to_generator(function() {
        var unused;
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
                        access(p, fsConstants.F_OK)
                    ];
                case 1:
                    _state.sent();
                    return [
                        2,
                        true
                    ];
                case 2:
                    unused = _state.sent();
                    return [
                        2,
                        false
                    ];
                case 3:
                    return [
                        2
                    ];
            }
        });
    })();
}
test("round-trip: permission_request → respond('reject') leaves the file unchanged", function() {
    return _async_to_generator(function() {
        var tmp, transport, promptP, answered, _ref, events, permissionCount, _;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    return [
                        4,
                        mkdtemp(path.join(tmpdir(), "ok-perm-reject-"))
                    ];
                case 1:
                    tmp = _state.sent();
                    _state.label = 2;
                case 2:
                    _state.trys.push([
                        2,
                        ,
                        7,
                        9
                    ]);
                    transport = buildGatedTransport(tmp, [
                        fauxAssistantMessage([
                            fauxText("writing"),
                            fauxToolCall("write_file", {
                                path: "rejected.txt",
                                content: "SHOULD NOT EXIST"
                            })
                        ]),
                        fauxAssistantMessage([
                            fauxText("denied, moving on")
                        ])
                    ]);
                    promptP = transport.prompt("write rejected.txt");
                    answered = false;
                    return [
                        4,
                        drainEvents(transport, function(requestId) {
                            assert.equal(answered, false, "only one permission_request expected");
                            answered = true;
                            transport.respond(requestId, "reject");
                        })
                    ];
                case 3:
                    _ref = _state.sent(), events = _ref.events, permissionCount = _ref.permissionCount;
                    return [
                        4,
                        promptP
                    ];
                case 4:
                    _state.sent();
                    assert.equal(permissionCount, 1, "exactly one permission_request was emitted");
                    assert.equal(answered, true, "the request was answered with reject");
                    // The file must NOT exist — the tool never wrote because it was rejected.
                    _ = assert.equal;
                    return [
                        4,
                        fileExists(path.join(tmp, "rejected.txt"))
                    ];
                case 5:
                    _.apply(assert, [
                        _state.sent(),
                        false,
                        "file must not exist after reject"
                    ]);
                    // A tool_result was emitted (the refusal result returned to the model).
                    assert.ok(events.some(function(e) {
                        return e.kind === "tool_result";
                    }), "a tool_result was emitted for the refused call");
                    return [
                        4,
                        transport.close()
                    ];
                case 6:
                    _state.sent();
                    return [
                        3,
                        9
                    ];
                case 7:
                    return [
                        4,
                        rm(tmp, {
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
test("round-trip: respond('once') approves one write; the file appears", function() {
    return _async_to_generator(function() {
        var tmp, transport, promptP, permissionCount, readFile, written;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    return [
                        4,
                        mkdtemp(path.join(tmpdir(), "ok-perm-once-"))
                    ];
                case 1:
                    tmp = _state.sent();
                    _state.label = 2;
                case 2:
                    _state.trys.push([
                        2,
                        ,
                        8,
                        10
                    ]);
                    transport = buildGatedTransport(tmp, [
                        fauxAssistantMessage([
                            fauxText("writing"),
                            fauxToolCall("write_file", {
                                path: "once.txt",
                                content: "approved"
                            })
                        ]),
                        fauxAssistantMessage([
                            fauxText("done")
                        ])
                    ]);
                    promptP = transport.prompt("write once.txt");
                    return [
                        4,
                        drainEvents(transport, function(requestId) {
                            transport.respond(requestId, "once");
                        })
                    ];
                case 3:
                    permissionCount = _state.sent().permissionCount;
                    return [
                        4,
                        promptP
                    ];
                case 4:
                    _state.sent();
                    assert.equal(permissionCount, 1, "one permission_request emitted for the once-approved call");
                    return [
                        4,
                        import("node:fs/promises")
                    ];
                case 5:
                    readFile = _state.sent().readFile;
                    return [
                        4,
                        readFile(path.join(tmp, "once.txt"), "utf-8")
                    ];
                case 6:
                    written = _state.sent();
                    assert.equal(written, "approved", "the once-approved write landed on disk");
                    return [
                        4,
                        transport.close()
                    ];
                case 7:
                    _state.sent();
                    return [
                        3,
                        10
                    ];
                case 8:
                    return [
                        4,
                        rm(tmp, {
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
test("always-scoping: no re-prompt within a session, but a fresh prompt in a new session", function() {
    return _async_to_generator(function() {
        var tmp, transport, promptP, permissionCount, readFile, _, tmp2, transport2, promptP2, _ref, pc2;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    return [
                        4,
                        mkdtemp(path.join(tmpdir(), "ok-perm-always-"))
                    ];
                case 1:
                    tmp = _state.sent();
                    _state.label = 2;
                case 2:
                    _state.trys.push([
                        2,
                        ,
                        16,
                        18
                    ]);
                    transport = buildGatedTransport(tmp, [
                        fauxAssistantMessage([
                            fauxText("a"),
                            fauxToolCall("write_file", {
                                path: "a.txt",
                                content: "x"
                            })
                        ]),
                        fauxAssistantMessage([
                            fauxText("b"),
                            fauxToolCall("write_file", {
                                path: "a.txt",
                                content: "x"
                            })
                        ]),
                        fauxAssistantMessage([
                            fauxText("done")
                        ])
                    ]);
                    promptP = transport.prompt("write a.txt twice");
                    return [
                        4,
                        drainEvents(transport, function(requestId) {
                            // Only the first call prompts; answer it `always`.
                            transport.respond(requestId, "always");
                        })
                    ];
                case 3:
                    permissionCount = _state.sent().permissionCount;
                    return [
                        4,
                        promptP
                    ];
                case 4:
                    _state.sent();
                    assert.equal(permissionCount, 1, "only the first identical call re-prompts; the second uses the always cache");
                    return [
                        4,
                        import("node:fs/promises")
                    ];
                case 5:
                    readFile = _state.sent().readFile;
                    _ = assert.equal;
                    return [
                        4,
                        readFile(path.join(tmp, "a.txt"), "utf-8")
                    ];
                case 6:
                    _.apply(assert, [
                        _state.sent(),
                        "x",
                        "file written"
                    ]);
                    return [
                        4,
                        transport.close()
                    ];
                case 7:
                    _state.sent();
                    return [
                        4,
                        mkdtemp(path.join(tmpdir(), "ok-perm-always2-"))
                    ];
                case 8:
                    tmp2 = _state.sent();
                    _state.label = 9;
                case 9:
                    _state.trys.push([
                        9,
                        ,
                        13,
                        15
                    ]);
                    transport2 = buildGatedTransport(tmp2, [
                        fauxAssistantMessage([
                            fauxText("a"),
                            fauxToolCall("write_file", {
                                path: "a.txt",
                                content: "x"
                            })
                        ]),
                        fauxAssistantMessage([
                            fauxText("done")
                        ])
                    ]);
                    promptP2 = transport2.prompt("write a.txt once");
                    return [
                        4,
                        drainEvents(transport2, function(requestId) {
                            transport2.respond(requestId, "once");
                        })
                    ];
                case 10:
                    _ref = _state.sent(), pc2 = _ref.permissionCount;
                    return [
                        4,
                        promptP2
                    ];
                case 11:
                    _state.sent();
                    assert.equal(pc2, 1, "a fresh session prompts again — `always` is session-scoped (in memory only)");
                    return [
                        4,
                        transport2.close()
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
                        rm(tmp2, {
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
                        3,
                        18
                    ];
                case 16:
                    return [
                        4,
                        rm(tmp, {
                            recursive: true,
                            force: true
                        })
                    ];
                case 17:
                    _state.sent();
                    return [
                        7
                    ];
                case 18:
                    return [
                        2
                    ];
            }
        });
    })();
});
// ── C. Golden-frame: the permission overlay (scope §5 + §6) ────────────────
test("golden-frame: overlay shows the P4a footer grammar and theme-token diff colours", function() {
    return _async_to_generator(function() {
        var overlay, raw, frame, rawFrame;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    overlay = new PermissionOverlay({
                        toolName: "write_file",
                        rule: "ask — default for write_file",
                        preview: {
                            kind: "diff",
                            path: "/tmp/proj/a.txt",
                            before: "old line one\nold line two",
                            after: "new line one\nnew line two"
                        },
                        onDecision: function onDecision() {}
                    });
                    raw = overlay.render(80);
                    frame = raw.map(stripAnsi).join("\n");
                    rawFrame = raw.join("\n");
                    // Footer grammar — identical to every other overlay (scope §3.2 + §5).
                    assert.ok(frame.includes(OVERLAY_FOOTER), "overlay must carry the canonical footer grammar");
                    // Tool header + rule line.
                    assert.ok(frame.includes("write_file"), "overlay header shows the tool name");
                    assert.ok(/ask — default for write_file/.test(frame), "overlay shows the policy-engine reason");
                    // Diff lines: removed (before) with `- `, added (after) with `+ `.
                    assert.ok(frame.includes("- old line one"), "removed lines are prefixed `- `");
                    assert.ok(frame.includes("+ new line one"), "added lines are prefixed `+ `");
                    // Theme-token diff colours (scope §5): added → highlight.base (cyan 39),
                    // removed → highlight.danger (red 124). Ad-hoc colour literals are a defect.
                    assert.ok(rawFrame.includes("\x1b[38;5;39m"), "added diff lines use the cyan highlight token (39)");
                    assert.ok(rawFrame.includes("\x1b[38;5;124m"), "removed diff lines use the red danger token (124)");
                    // The three approval actions are present.
                    assert.ok(frame.includes("Allow once"), "Allow once action present");
                    assert.ok(frame.includes("Allow always"), "Allow always action present");
                    assert.ok(frame.includes("Reject"), "Reject action present");
                    // Capture the acceptance-evidence overlay frame from THIS run, so the
                    // committed artifact cannot drift from what the code actually renders.
                    return [
                        4,
                        writeFile(new URL("../test/evidence/permission-overlay.txt", import.meta.url), [
                            "# P4b permission-overlay golden-frame evidence (headless render, 80 cols)",
                            "# Regenerated by `npm test -w @openkai/cli` — do not hand-edit.",
                            "# Footer grammar: " + OVERLAY_FOOTER,
                            "# Diff colours: added=highlight.base(cyan 39) removed=highlight.danger(red 124)",
                            "",
                            raw.join("\n"),
                            ""
                        ].join("\n"))
                    ];
                case 1:
                    _state.sent();
                    return [
                        2
                    ];
            }
        });
    })();
});
test("golden-frame: command preview overlay (bash)", function() {
    var overlay = new PermissionOverlay({
        toolName: "bash",
        rule: "ask — bash requires approval (never auto-allowed)",
        preview: {
            kind: "command",
            command: "echo hello",
            cwd: "/tmp/proj"
        },
        onDecision: function onDecision() {}
    });
    var frame = overlay.render(80).map(stripAnsi).join("\n");
    assert.ok(frame.includes(OVERLAY_FOOTER), "command preview carries the canonical footer");
    assert.ok(frame.includes("echo hello"), "command preview shows the command");
    assert.ok(frame.includes("/tmp/proj"), "command preview shows the resolved cwd");
});
