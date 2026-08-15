//# hash=3758c357af8810233fd0f73926d5c553
//# sourceMappingURL=upgrade.test.js.map

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
function _instanceof(left, right) {
    "@swc/helpers - instanceof";
    if (right != null && typeof Symbol !== "undefined" && right[Symbol.hasInstance]) {
        return !!right[Symbol.hasInstance](left);
    } else return left instanceof right;
}
function _object_spread(target) {
    for(var i = 1; i < arguments.length; i++){
        var source = arguments[i] != null ? arguments[i] : {};
        var ownKeys = Object.keys(source);
        if (typeof Object.getOwnPropertySymbols === "function") {
            ownKeys = ownKeys.concat(Object.getOwnPropertySymbols(source).filter(function(sym) {
                return Object.getOwnPropertyDescriptor(source, sym).enumerable;
            }));
        }
        ownKeys.forEach(function(key) {
            _define_property(target, key, source[key]);
        });
    }
    return target;
}
function ownKeys(object, enumerableOnly) {
    var keys = Object.keys(object);
    if (Object.getOwnPropertySymbols) {
        var symbols = Object.getOwnPropertySymbols(object);
        if (enumerableOnly) {
            symbols = symbols.filter(function(sym) {
                return Object.getOwnPropertyDescriptor(object, sym).enumerable;
            });
        }
        keys.push.apply(keys, symbols);
    }
    return keys;
}
function _object_spread_props(target, source) {
    source = source != null ? source : {};
    if (Object.getOwnPropertyDescriptors) Object.defineProperties(target, Object.getOwnPropertyDescriptors(source));
    else {
        ownKeys(Object(source)).forEach(function(key) {
            Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key));
        });
    }
    return target;
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
 * openkai upgrade tests (Inc 08, ADR OK-8 dual-channel). All filesystem
 * operations run against in-memory fakes or mkdtemp temp dirs; no real
 * network and no operator repo mutation.
 */ import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { promises as fsp } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { BUILD_CHANNEL, Upgrader, WitnessMismatchError, canonicalManifestBytes, compareVersions, detectTarget, manifestUrlForVersion, resolveAutoUpdateEnabled, resolveChannel, sha256Hex, signManifest, verifyManifestSignature } from "../dist/upgrade.js";
// ─── Pure helpers ────────────────────────────────────────────────────────────
test("channel selection: build-time stamp is authoritative; env overrides", function() {
    assert.equal(resolveChannel({
        buildChannel: "npm"
    }), "npm");
    assert.equal(resolveChannel({
        buildChannel: "standalone"
    }), "standalone");
    assert.equal(resolveChannel({
        buildChannel: "npm",
        envChannel: "standalone"
    }), "standalone");
    assert.equal(resolveChannel({
        buildChannel: "standalone",
        envChannel: "npm"
    }), "npm");
    // invalid env value is ignored → falls back to build stamp
    assert.equal(resolveChannel({
        buildChannel: "npm",
        envChannel: "garbage"
    }), "npm");
});
test("channel selection: the shipped npm build stamps BUILD_CHANNEL=npm (pinned by construction)", function() {
    // The npm tarball is compiled by `tsc`, never by build-binaries.sh, so the
    // OPENKAI_BUILD_CHANNEL define is absent and the constant defaults to npm.
    assert.equal(BUILD_CHANNEL, "npm");
});
test("kill-switch: falsey values disable auto-upgrade entirely; unset/other enable it", function() {
    for(var _i = 0, _iter = [
        "false",
        "0",
        "no",
        "off",
        "FALSE",
        " Off "
    ]; _i < _iter.length; _i++){
        var off = _iter[_i];
        assert.equal(resolveAutoUpdateEnabled(off), false, "".concat(off, " should disable"));
    }
    assert.equal(resolveAutoUpdateEnabled(undefined), true);
    assert.equal(resolveAutoUpdateEnabled("true"), true);
    assert.equal(resolveAutoUpdateEnabled("1"), true);
});
test("version comparison: semver-ish ordering", function() {
    assert.equal(compareVersions("0.0.0", "0.0.1"), -1);
    assert.equal(compareVersions("0.1.0", "0.0.9"), 1);
    assert.equal(compareVersions("1.2.3", "1.2.3"), 0);
    assert.equal(compareVersions("2.0.0", "1.99.99"), 1);
});
test("target detection maps x64/arm64 + darwin/linux", function() {
    assert.equal(detectTarget("darwin", "arm64"), "darwin-arm64");
    assert.equal(detectTarget("linux", "x64"), "linux-x64");
    assert.equal(detectTarget("darwin", "x64"), "darwin-x64");
});
test("manifestUrlForVersion rewrites latest.json and appends otherwise", function() {
    assert.equal(manifestUrlForVersion("https://openkai.dev/releases/latest.json", "0.1.0"), "https://openkai.dev/releases/0.1.0.json");
    assert.equal(manifestUrlForVersion("https://x/releases/", "0.1.0"), "https://x/releases/0.1.0.json");
});
// ─── Witness ──────────────────────────────────────────────────────────────────
function manifest(version, bytes) {
    var target = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : "darwin-arm64";
    return {
        version: version,
        artifacts: [
            {
                target: target,
                url: "https://x/openkai-".concat(target),
                sha256: sha256Hex(bytes)
            }
        ]
    };
}
test("witness: artifact sha256 match passes; mismatch throws WitnessMismatchError", function() {
    return _async_to_generator(function() {
        var good, m, u, res;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    good = new TextEncoder().encode("binary-a");
                    m = manifest("0.0.1", good);
                    u = new Upgrader({
                        manifestUrl: "https://x/latest.json",
                        currentBinary: "/tmp/x",
                        currentVersion: "0.0.0",
                        target: "darwin-arm64",
                        autoUpdateEnabled: true,
                        deps: fakeDeps({
                            manifest: m,
                            artifactBytes: good
                        })
                    });
                    return [
                        4,
                        u.upgrade()
                    ];
                case 1:
                    res = _state.sent();
                    assert.equal(res.alreadyUpToDate, false);
                    assert.equal(res.from, "0.0.0");
                    assert.equal(res.to, "0.0.1");
                    return [
                        2
                    ];
            }
        });
    })();
});
test("witness: sha256 mismatch is refused before any swap", function() {
    return _async_to_generator(function() {
        var real, tampered, m, cwd, bin, u, _, _1;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    real = new TextEncoder().encode("real-binary");
                    tampered = new TextEncoder().encode("tampered-binary");
                    m = manifest("0.0.1", real);
                    return [
                        4,
                        mkdtemp(path.join(tmpdir(), "openkai-up-"))
                    ];
                case 1:
                    cwd = _state.sent();
                    bin = path.join(cwd, "openkai");
                    return [
                        4,
                        writeFile(bin, "current-bytes")
                    ];
                case 2:
                    _state.sent();
                    _state.label = 3;
                case 3:
                    _state.trys.push([
                        3,
                        ,
                        7,
                        9
                    ]);
                    u = new Upgrader({
                        manifestUrl: "https://x/latest.json",
                        currentBinary: bin,
                        currentVersion: "0.0.0",
                        target: "darwin-arm64",
                        autoUpdateEnabled: true,
                        deps: fakeDeps({
                            manifest: m,
                            artifactBytes: tampered
                        })
                    });
                    return [
                        4,
                        assert.rejects(u.upgrade(), function(err) {
                            assert.ok(_instanceof(err, WitnessMismatchError));
                            assert.equal(err.kind, "artifact");
                            return true;
                        })
                    ];
                case 4:
                    _state.sent();
                    // current binary untouched on refusal
                    _ = assert.equal;
                    return [
                        4,
                        readFile(bin, "utf-8")
                    ];
                case 5:
                    _.apply(assert, [
                        _state.sent(),
                        "current-bytes"
                    ]);
                    _1 = assert.equal;
                    return [
                        4,
                        readFile("".concat(bin, ".new"), "utf-8").catch(function() {
                            return "absent";
                        })
                    ];
                case 6:
                    _1.apply(assert, [
                        _state.sent(),
                        "absent"
                    ]);
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
test("witness: Ed25519 manifest signature is verified when a key is pinned", function() {
    var _generateKeyPairSync = generateKeyPairSync("ed25519"), publicKey = _generateKeyPairSync.publicKey, privateKey = _generateKeyPairSync.privateKey;
    var pubB64 = publicKey.export({
        format: "der",
        type: "spki"
    }).toString("base64");
    var bytes = new TextEncoder().encode("binary");
    var m = manifest("0.0.1", bytes);
    var sig = signManifest(m, privateKey.export({
        format: "pem",
        type: "pkcs8"
    }).toString());
    assert.equal(verifyManifestSignature(m, pubB64, sig), true);
    // tampered version → signature invalid
    var tampered = _object_spread_props(_object_spread({}, m), {
        version: "9.9.9"
    });
    assert.equal(verifyManifestSignature(tampered, pubB64, sig), false);
    // canonical bytes are stable + exclude the signature field
    var canon = new TextDecoder().decode(canonicalManifestBytes(m));
    assert.ok(canon.includes('"version":"0.0.1"'));
    assert.ok(!canon.includes("signature"));
});
test("witness: unsigned manifest is refused when a release key is pinned", function() {
    return _async_to_generator(function() {
        var _generateKeyPairSync, publicKey, privateKey, pubB64, good, m, u;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    _generateKeyPairSync = generateKeyPairSync("ed25519"), publicKey = _generateKeyPairSync.publicKey, privateKey = _generateKeyPairSync.privateKey;
                    pubB64 = publicKey.export({
                        format: "der",
                        type: "spki"
                    }).toString("base64");
                    good = new TextEncoder().encode("binary");
                    m = manifest("0.0.1", good); // no signature field
                    u = new Upgrader({
                        manifestUrl: "https://x/latest.json",
                        currentBinary: "/tmp/x",
                        currentVersion: "0.0.0",
                        target: "darwin-arm64",
                        autoUpdateEnabled: true,
                        releasePublicKey: pubB64,
                        deps: fakeDeps({
                            manifest: m,
                            artifactBytes: good
                        })
                    });
                    return [
                        4,
                        assert.rejects(u.check(), function(err) {
                            assert.ok(_instanceof(err, WitnessMismatchError));
                            assert.equal(err.kind, "manifest");
                            return true;
                        })
                    ];
                case 1:
                    _state.sent();
                    void privateKey;
                    return [
                        2
                    ];
            }
        });
    })();
});
// ─── Upgrader: upgrade + rollback + kill-switch ───────────────────────────────
test("upgrade: swaps binary, preserves previous, reports version bump", function() {
    return _async_to_generator(function() {
        var cwd, bin, newBytes, m, u, res, _, _1, _2, _3;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    return [
                        4,
                        mkdtemp(path.join(tmpdir(), "openkai-up-"))
                    ];
                case 1:
                    cwd = _state.sent();
                    bin = path.join(cwd, "openkai");
                    return [
                        4,
                        writeFile(bin, "old-bytes")
                    ];
                case 2:
                    _state.sent();
                    _state.label = 3;
                case 3:
                    _state.trys.push([
                        3,
                        ,
                        7,
                        9
                    ]);
                    newBytes = new TextEncoder().encode("new-bytes");
                    m = manifest("0.0.1", newBytes);
                    u = new Upgrader({
                        manifestUrl: "https://x/latest.json",
                        currentBinary: bin,
                        currentVersion: "0.0.0",
                        target: "darwin-arm64",
                        autoUpdateEnabled: true,
                        deps: fakeDeps({
                            manifest: m,
                            artifactBytes: newBytes
                        })
                    });
                    return [
                        4,
                        u.upgrade()
                    ];
                case 4:
                    res = _state.sent();
                    assert.equal(res.alreadyUpToDate, false);
                    assert.equal(res.to, "0.0.1");
                    _ = assert.equal;
                    _2 = (_1 = new TextDecoder()).decode;
                    return [
                        4,
                        readFile(bin)
                    ];
                case 5:
                    _.apply(assert, [
                        _2.apply(_1, [
                            _state.sent()
                        ]),
                        "new-bytes"
                    ]);
                    _3 = assert.equal;
                    return [
                        4,
                        readFile("".concat(bin, ".previous"), "utf-8")
                    ];
                case 6:
                    _3.apply(assert, [
                        _state.sent(),
                        "old-bytes"
                    ]);
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
test("upgrade: already-up-to-date is a no-op (no swap, no previous written)", function() {
    return _async_to_generator(function() {
        var cwd, bin, sameBytes, m, u, res, _, _1;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    return [
                        4,
                        mkdtemp(path.join(tmpdir(), "openkai-up-"))
                    ];
                case 1:
                    cwd = _state.sent();
                    bin = path.join(cwd, "openkai");
                    return [
                        4,
                        writeFile(bin, "current-bytes")
                    ];
                case 2:
                    _state.sent();
                    _state.label = 3;
                case 3:
                    _state.trys.push([
                        3,
                        ,
                        7,
                        9
                    ]);
                    sameBytes = new TextEncoder().encode("current-bytes");
                    m = manifest("0.0.0", sameBytes); // same version
                    u = new Upgrader({
                        manifestUrl: "https://x/latest.json",
                        currentBinary: bin,
                        currentVersion: "0.0.0",
                        target: "darwin-arm64",
                        autoUpdateEnabled: true,
                        deps: fakeDeps({
                            manifest: m,
                            artifactBytes: sameBytes
                        })
                    });
                    return [
                        4,
                        u.upgrade()
                    ];
                case 4:
                    res = _state.sent();
                    assert.equal(res.alreadyUpToDate, true);
                    _ = assert.equal;
                    return [
                        4,
                        readFile(bin, "utf-8")
                    ];
                case 5:
                    _.apply(assert, [
                        _state.sent(),
                        "current-bytes"
                    ]);
                    _1 = assert.equal;
                    return [
                        4,
                        readFile("".concat(bin, ".previous"), "utf-8").catch(function() {
                            return "absent";
                        })
                    ];
                case 6:
                    _1.apply(assert, [
                        _state.sent(),
                        "absent"
                    ]);
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
test("kill-switch: upgrade refuses entirely when disabled; no swap happens", function() {
    return _async_to_generator(function() {
        var cwd, bin, newBytes, m, u, _;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    return [
                        4,
                        mkdtemp(path.join(tmpdir(), "openkai-up-"))
                    ];
                case 1:
                    cwd = _state.sent();
                    bin = path.join(cwd, "openkai");
                    return [
                        4,
                        writeFile(bin, "current-bytes")
                    ];
                case 2:
                    _state.sent();
                    _state.label = 3;
                case 3:
                    _state.trys.push([
                        3,
                        ,
                        6,
                        8
                    ]);
                    newBytes = new TextEncoder().encode("new-bytes");
                    m = manifest("0.0.1", newBytes);
                    u = new Upgrader({
                        manifestUrl: "https://x/latest.json",
                        currentBinary: bin,
                        currentVersion: "0.0.0",
                        target: "darwin-arm64",
                        autoUpdateEnabled: false,
                        deps: fakeDeps({
                            manifest: m,
                            artifactBytes: newBytes
                        })
                    });
                    return [
                        4,
                        assert.rejects(u.upgrade(), function(err) {
                            assert.equal(err.name, "AutoUpdateDisabledError");
                            return true;
                        })
                    ];
                case 4:
                    _state.sent();
                    _ = assert.equal;
                    return [
                        4,
                        readFile(bin, "utf-8")
                    ];
                case 5:
                    _.apply(assert, [
                        _state.sent(),
                        "current-bytes"
                    ]);
                    return [
                        3,
                        8
                    ];
                case 6:
                    return [
                        4,
                        rm(cwd, {
                            recursive: true,
                            force: true
                        })
                    ];
                case 7:
                    _state.sent();
                    return [
                        7
                    ];
                case 8:
                    return [
                        2
                    ];
            }
        });
    })();
});
test("rollback: restores previous binary and is NOT gated by the kill-switch", function() {
    return _async_to_generator(function() {
        var cwd, bin, prev, u, res, _, _1;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    return [
                        4,
                        mkdtemp(path.join(tmpdir(), "openkai-up-"))
                    ];
                case 1:
                    cwd = _state.sent();
                    bin = path.join(cwd, "openkai");
                    prev = "".concat(bin, ".previous");
                    return [
                        4,
                        writeFile(bin, "new-bytes")
                    ];
                case 2:
                    _state.sent();
                    return [
                        4,
                        writeFile(prev, "old-bytes")
                    ];
                case 3:
                    _state.sent();
                    _state.label = 4;
                case 4:
                    _state.trys.push([
                        4,
                        ,
                        8,
                        10
                    ]);
                    u = new Upgrader({
                        manifestUrl: "https://x/latest.json",
                        currentBinary: bin,
                        currentVersion: "0.0.1",
                        target: "darwin-arm64",
                        autoUpdateEnabled: false,
                        deps: fakeDeps({
                            manifest: manifest("0.0.1", new TextEncoder().encode("x")),
                            artifactBytes: new TextEncoder().encode("x")
                        })
                    });
                    return [
                        4,
                        u.rollback()
                    ];
                case 5:
                    res = _state.sent();
                    assert.equal(res.from, "0.0.1");
                    _ = assert.equal;
                    return [
                        4,
                        readFile(bin, "utf-8")
                    ];
                case 6:
                    _.apply(assert, [
                        _state.sent(),
                        "old-bytes"
                    ]);
                    // the rolled-back-from binary is now the new previous (reversible)
                    _1 = assert.equal;
                    return [
                        4,
                        readFile(prev, "utf-8")
                    ];
                case 7:
                    _1.apply(assert, [
                        _state.sent(),
                        "new-bytes"
                    ]);
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
test("rollback: throws NoPreviousBinaryError when none preserved", function() {
    return _async_to_generator(function() {
        var cwd, bin, u;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    return [
                        4,
                        mkdtemp(path.join(tmpdir(), "openkai-up-"))
                    ];
                case 1:
                    cwd = _state.sent();
                    bin = path.join(cwd, "openkai");
                    return [
                        4,
                        writeFile(bin, "current-bytes")
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
                    u = new Upgrader({
                        manifestUrl: "https://x/latest.json",
                        currentBinary: bin,
                        currentVersion: "0.0.0",
                        target: "darwin-arm64",
                        autoUpdateEnabled: true,
                        deps: fakeDeps({
                            manifest: manifest("0.0.0", new TextEncoder().encode("x")),
                            artifactBytes: new TextEncoder().encode("x")
                        })
                    });
                    return [
                        4,
                        assert.rejects(u.rollback(), function(err) {
                            assert.equal(err.name, "NoPreviousBinaryError");
                            return true;
                        })
                    ];
                case 4:
                    _state.sent();
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
test("upgrade then rollback round-trip restores the original binary", function() {
    return _async_to_generator(function() {
        var cwd, bin, newBytes, m, u, _, _1;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    return [
                        4,
                        mkdtemp(path.join(tmpdir(), "openkai-up-"))
                    ];
                case 1:
                    cwd = _state.sent();
                    bin = path.join(cwd, "openkai");
                    return [
                        4,
                        writeFile(bin, "old-bytes")
                    ];
                case 2:
                    _state.sent();
                    _state.label = 3;
                case 3:
                    _state.trys.push([
                        3,
                        ,
                        8,
                        10
                    ]);
                    newBytes = new TextEncoder().encode("new-bytes");
                    m = manifest("0.0.1", newBytes);
                    u = new Upgrader({
                        manifestUrl: "https://x/latest.json",
                        currentBinary: bin,
                        currentVersion: "0.0.0",
                        target: "darwin-arm64",
                        autoUpdateEnabled: true,
                        deps: fakeDeps({
                            manifest: m,
                            artifactBytes: newBytes
                        })
                    });
                    return [
                        4,
                        u.upgrade()
                    ];
                case 4:
                    _state.sent();
                    _ = assert.equal;
                    return [
                        4,
                        readFile(bin, "utf-8")
                    ];
                case 5:
                    _.apply(assert, [
                        _state.sent(),
                        "new-bytes"
                    ]);
                    return [
                        4,
                        u.rollback()
                    ];
                case 6:
                    _state.sent();
                    _1 = assert.equal;
                    return [
                        4,
                        readFile(bin, "utf-8")
                    ];
                case 7:
                    _1.apply(assert, [
                        _state.sent(),
                        "old-bytes"
                    ]);
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
// ─── CLI runner (channel selection end-to-end) ───────────────────────────────
test("CLI: npm channel never self-mutates — upgrade prints pin message, exit 0", function() {
    return _async_to_generator(function() {
        var runUpgrade, res;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    return [
                        4,
                        import("../dist/upgrade.js")
                    ];
                case 1:
                    runUpgrade = _state.sent().runUpgrade;
                    return [
                        4,
                        runUpgrade({
                            env: {
                                OPENKAI_CHANNEL: "npm"
                            },
                            currentBinary: "/tmp/x",
                            currentVersion: "0.0.0"
                        })
                    ];
                case 2:
                    res = _state.sent();
                    assert.equal(res.channel, "npm");
                    assert.equal(res.exitCode, 0);
                    assert.match(res.message, /pinned at build time/);
                    assert.match(res.message, /npm install -g/);
                    return [
                        2
                    ];
            }
        });
    })();
});
test("CLI: standalone upgrade applies with kill-switch unset; --check reports available", function() {
    return _async_to_generator(function() {
        var runUpgrade, cwd, bin, newBytes, m, deps, check, up, _;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    return [
                        4,
                        import("../dist/upgrade.js")
                    ];
                case 1:
                    runUpgrade = _state.sent().runUpgrade;
                    return [
                        4,
                        mkdtemp(path.join(tmpdir(), "openkai-up-"))
                    ];
                case 2:
                    cwd = _state.sent();
                    bin = path.join(cwd, "openkai");
                    return [
                        4,
                        writeFile(bin, "old-bytes")
                    ];
                case 3:
                    _state.sent();
                    _state.label = 4;
                case 4:
                    _state.trys.push([
                        4,
                        ,
                        8,
                        10
                    ]);
                    newBytes = new TextEncoder().encode("new-bytes");
                    m = manifest("0.0.1", newBytes);
                    deps = fakeDeps({
                        manifest: m,
                        artifactBytes: newBytes
                    });
                    return [
                        4,
                        runUpgrade({
                            check: true,
                            env: {
                                OPENKAI_CHANNEL: "standalone"
                            },
                            currentBinary: bin,
                            currentVersion: "0.0.0",
                            deps: deps
                        })
                    ];
                case 5:
                    check = _state.sent();
                    assert.equal(check.exitCode, 0);
                    assert.match(check.message, /channel: standalone/);
                    assert.match(check.message, /auto-update: enabled/);
                    assert.match(check.message, /update available: yes/);
                    return [
                        4,
                        runUpgrade({
                            env: {
                                OPENKAI_CHANNEL: "standalone"
                            },
                            currentBinary: bin,
                            currentVersion: "0.0.0",
                            deps: deps
                        })
                    ];
                case 6:
                    up = _state.sent();
                    assert.equal(up.exitCode, 0);
                    assert.match(up.message, /upgrade complete: 0.0.1/);
                    _ = assert.equal;
                    return [
                        4,
                        readFile(bin, "utf-8")
                    ];
                case 7:
                    _.apply(assert, [
                        _state.sent(),
                        "new-bytes"
                    ]);
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
test("CLI: kill-switch off → upgrade exits 1 and refuses; --rollback still works", function() {
    return _async_to_generator(function() {
        var runUpgrade, cwd, bin, newBytes, m, deps, refused, _, rolled, _1;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    return [
                        4,
                        import("../dist/upgrade.js")
                    ];
                case 1:
                    runUpgrade = _state.sent().runUpgrade;
                    return [
                        4,
                        mkdtemp(path.join(tmpdir(), "openkai-up-"))
                    ];
                case 2:
                    cwd = _state.sent();
                    bin = path.join(cwd, "openkai");
                    return [
                        4,
                        writeFile(bin, "new-bytes")
                    ];
                case 3:
                    _state.sent();
                    return [
                        4,
                        writeFile("".concat(bin, ".previous"), "old-bytes")
                    ];
                case 4:
                    _state.sent();
                    _state.label = 5;
                case 5:
                    _state.trys.push([
                        5,
                        ,
                        10,
                        12
                    ]);
                    newBytes = new TextEncoder().encode("newer-bytes");
                    m = manifest("0.0.2", newBytes);
                    deps = fakeDeps({
                        manifest: m,
                        artifactBytes: newBytes
                    });
                    return [
                        4,
                        runUpgrade({
                            env: {
                                OPENKAI_CHANNEL: "standalone",
                                OPENKAI_AUTO_UPDATE_ENABLED: "false"
                            },
                            currentBinary: bin,
                            currentVersion: "0.0.1",
                            deps: deps
                        })
                    ];
                case 6:
                    refused = _state.sent();
                    assert.equal(refused.exitCode, 1);
                    assert.equal(refused.autoUpdateEnabled, false);
                    assert.match(refused.message, /disabled/);
                    _ = assert.equal;
                    return [
                        4,
                        readFile(bin, "utf-8")
                    ];
                case 7:
                    _.apply(assert, [
                        _state.sent(),
                        "new-bytes"
                    ]); // untouched
                    return [
                        4,
                        runUpgrade({
                            rollback: true,
                            env: {
                                OPENKAI_CHANNEL: "standalone",
                                OPENKAI_AUTO_UPDATE_ENABLED: "false"
                            },
                            currentBinary: bin,
                            currentVersion: "0.0.1",
                            deps: deps
                        })
                    ];
                case 8:
                    rolled = _state.sent();
                    assert.equal(rolled.exitCode, 0);
                    assert.match(rolled.message, /rollback complete/);
                    _1 = assert.equal;
                    return [
                        4,
                        readFile(bin, "utf-8")
                    ];
                case 9:
                    _1.apply(assert, [
                        _state.sent(),
                        "old-bytes"
                    ]);
                    return [
                        3,
                        12
                    ];
                case 10:
                    return [
                        4,
                        rm(cwd, {
                            recursive: true,
                            force: true
                        })
                    ];
                case 11:
                    _state.sent();
                    return [
                        7
                    ];
                case 12:
                    return [
                        2
                    ];
            }
        });
    })();
});
test("CLI: OPENKAI_CHANNEL=standalone on an npm build refuses — never overwrites process.execPath", function() {
    return _async_to_generator(function() {
        var runUpgrade, newBytes, m, downloaded, deps, execPathBefore, res, _;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    return [
                        4,
                        import("../dist/upgrade.js")
                    ];
                case 1:
                    runUpgrade = _state.sent().runUpgrade;
                    // No `currentBinary`: this is the real-operator path where it would default
                    // to process.execPath (node, under an npm install). The swap must be refused
                    // before any download — overwriting the host interpreter is not an upgrade.
                    newBytes = new TextEncoder().encode("newer-bytes");
                    m = manifest("9.9.9", newBytes);
                    downloaded = false;
                    deps = _object_spread_props(_object_spread({}, fakeDeps({
                        manifest: m,
                        artifactBytes: newBytes
                    })), {
                        download: function download() {
                            return _async_to_generator(function() {
                                return _ts_generator(this, function(_state) {
                                    downloaded = true;
                                    return [
                                        2,
                                        newBytes
                                    ];
                                });
                            })();
                        }
                    });
                    return [
                        4,
                        readFile(process.execPath)
                    ];
                case 2:
                    execPathBefore = _state.sent();
                    return [
                        4,
                        runUpgrade({
                            env: {
                                OPENKAI_CHANNEL: "standalone"
                            },
                            currentVersion: "0.0.1",
                            deps: deps
                        })
                    ];
                case 3:
                    res = _state.sent();
                    assert.equal(res.exitCode, 1);
                    assert.match(res.message, /not a\nstandalone binary/);
                    assert.equal(downloaded, false, "must refuse before downloading an artifact");
                    _ = assert.deepEqual;
                    return [
                        4,
                        readFile(process.execPath)
                    ];
                case 4:
                    _.apply(assert, [
                        _state.sent(),
                        execPathBefore,
                        "the running interpreter must be byte-identical after a refused upgrade"
                    ]);
                    return [
                        2
                    ];
            }
        });
    })();
});
/**
 * Real-filesystem deps with only the network faked (mirrors the undo tests'
 * pattern of real ops on mkdtemp temp dirs). No real network, no operator
 * repo mutation — every path the Upgrader touches lives in a temp dir.
 */ function fakeDeps(state) {
    return {
        fetchManifest: function fetchManifest() {
            return _async_to_generator(function() {
                return _ts_generator(this, function(_state) {
                    return [
                        2,
                        state.manifest
                    ];
                });
            })();
        },
        download: function download() {
            var _state_downloadedBytes;
            return _async_to_generator(function() {
                return _ts_generator(this, function(_state) {
                    return [
                        2,
                        (_state_downloadedBytes = state.downloadedBytes) !== null && _state_downloadedBytes !== void 0 ? _state_downloadedBytes : state.artifactBytes
                    ];
                });
            })();
        },
        readFile: function readFile(p) {
            return fsp.readFile(p);
        },
        writeFile: function writeFile(p, d) {
            return fsp.writeFile(p, d);
        },
        rename: function rename(from, to) {
            return fsp.rename(from, to);
        },
        copyFile: function copyFile(from, to) {
            return fsp.copyFile(from, to);
        },
        chmod: function chmod() {
            return _async_to_generator(function() {
                return _ts_generator(this, function(_state) {
                    return [
                        2
                    ];
                });
            })();
        },
        stat: function stat(p) {
            return _async_to_generator(function() {
                var st;
                return _ts_generator(this, function(_state) {
                    switch(_state.label){
                        case 0:
                            return [
                                4,
                                fsp.stat(p)
                            ];
                        case 1:
                            st = _state.sent();
                            return [
                                2,
                                {
                                    isFile: st.isFile()
                                }
                            ];
                    }
                });
            })();
        }
    };
}
// satisfy the unused-import linter for the re-exported type
void BUILD_CHANNEL;
