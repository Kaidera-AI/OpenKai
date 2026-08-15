//# hash=830139a3e22686e270a7753bedc4f40c
//# sourceMappingURL=upgrade.js.map

function _array_like_to_array(arr, len) {
    if (len == null || len > arr.length) len = arr.length;
    for(var i = 0, arr2 = new Array(len); i < len; i++)arr2[i] = arr[i];
    return arr2;
}
function _array_without_holes(arr) {
    if (Array.isArray(arr)) return _array_like_to_array(arr);
}
function _assert_this_initialized(self) {
    if (self === void 0) throw new ReferenceError("this hasn't been initialised - super() hasn't been called");
    return self;
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
function _call_super(_this, derived, args) {
    derived = _get_prototype_of(derived);
    return _possible_constructor_return(_this, _is_native_reflect_construct() ? Reflect.construct(derived, args || [], _get_prototype_of(_this).constructor) : derived.apply(_this, args));
}
function _class_call_check(instance, Constructor) {
    if (!(instance instanceof Constructor)) throw new TypeError("Cannot call a class as a function");
}
function _construct(Parent, args, Class) {
    if (_is_native_reflect_construct()) _construct = Reflect.construct;
    else {
        _construct = function construct(Parent, args, Class) {
            var a = [
                null
            ];
            a.push.apply(a, args);
            var Constructor = Function.bind.apply(Parent, a);
            var instance = new Constructor();
            if (Class) _set_prototype_of(instance, Class.prototype);
            return instance;
        };
    }
    return _construct.apply(null, arguments);
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
function _get_prototype_of(o) {
    _get_prototype_of = Object.setPrototypeOf ? Object.getPrototypeOf : function getPrototypeOf(o) {
        return o.__proto__ || Object.getPrototypeOf(o);
    };
    return _get_prototype_of(o);
}
function _inherits(subClass, superClass) {
    if (typeof superClass !== "function" && superClass !== null) {
        throw new TypeError("Super expression must either be null or a function");
    }
    subClass.prototype = Object.create(superClass && superClass.prototype, {
        constructor: {
            value: subClass,
            writable: true,
            configurable: true
        }
    });
    if (superClass) _set_prototype_of(subClass, superClass);
}
function _instanceof(left, right) {
    "@swc/helpers - instanceof";
    if (right != null && typeof Symbol !== "undefined" && right[Symbol.hasInstance]) {
        return !!right[Symbol.hasInstance](left);
    } else return left instanceof right;
}
function _is_native_function(fn) {
    return Function.toString.call(fn).indexOf("[native code]") !== -1;
}
function _is_native_reflect_construct() {
    try {
        var result = !Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function() {}));
    } catch (_) {}
    return (_is_native_reflect_construct = function() {
        return !!result;
    })();
}
function _iterable_to_array(iter) {
    if (typeof Symbol !== "undefined" && iter[Symbol.iterator] != null || iter["@@iterator"] != null) {
        return Array.from(iter);
    }
}
function _non_iterable_spread() {
    throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
}
function _possible_constructor_return(self, call) {
    if (call && (_type_of(call) === "object" || typeof call === "function")) return call;
    return _assert_this_initialized(self);
}
function _set_prototype_of(o, p) {
    _set_prototype_of = Object.setPrototypeOf || function setPrototypeOf(o, p) {
        o.__proto__ = p;
        return o;
    };
    return _set_prototype_of(o, p);
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
function _wrap_native_super(Class) {
    var _cache = typeof Map === "function" ? new Map() : undefined;
    _wrap_native_super = function(Class) {
        if (Class === null || !_is_native_function(Class)) return Class;
        if (typeof Class !== "function") throw new TypeError("Super expression must either be null or a function");
        if (typeof _cache !== "undefined") {
            if (_cache.has(Class)) return _cache.get(Class);
            _cache.set(Class, Wrapper);
        }
        function Wrapper() {
            return _construct(Class, arguments, _get_prototype_of(this).constructor);
        }
        Wrapper.prototype = Object.create(Class.prototype, {
            constructor: {
                value: Wrapper,
                enumerable: false,
                writable: true,
                configurable: true
            }
        });
        return _set_prototype_of(Wrapper, Class);
    };
    return _wrap_native_super(Class);
}
/**
 * openkai upgrade — dual-channel auto-upgrade (ADR OK-8 / E001 Inc 08).
 *
 * Two distribution channels, per the droid pattern (research
 * `2026-08-14-factory-droid-findings.md` §4 "Packaging/auto-upgrade"):
 *
 *   - **standalone** — a per-platform bun-compiled binary that self-upgrades
 *     from a release manifest fetched over plain HTTPS. Honours an env
 *     kill-switch (`OPENKAI_AUTO_UPDATE_ENABLED=false`) that disables
 *     self-upgrade entirely, and supports rollback to the prior binary.
 *   - **npm** — `@openkai/cli` installed via npm. The channel is *pinned at
 *     build time*: the published tarball carries a fixed version and never
 *     self-mutates. Upgrade is an explicit `npm install -g @openkai/cli@<v>`.
 *
 * Witness verification ships *with* the upgrader (an auto-updating component
 * without it is an attack surface): every artifact is SHA-256 verified before
 * the binary swap, and manifests may be Ed25519-signed (verified when
 * `OPENKAI_RELEASE_PUBLIC_KEY` is set). No cloud-vendor-specific update
 * service is used — only plain HTTPS artifact fetch (cloud-agnostic policy).
 */ import { createHash, createPublicKey, sign, verify } from "node:crypto";
import { promises as fsp } from "node:fs";
import { CLI_VERSION } from "./version.js";
var DECLARED_BUILD_CHANNEL = typeof OPENKAI_BUILD_CHANNEL !== "undefined" ? OPENKAI_BUILD_CHANNEL : undefined;
/** The channel this build was compiled for (authoritative; set at build time). */ export var BUILD_CHANNEL = DECLARED_BUILD_CHANNEL === "standalone" ? "standalone" : "npm";
export var DEFAULT_MANIFEST_URL = "https://openkai.dev/releases/latest.json";
export var KILL_SWITCH_ENV = "OPENKAI_AUTO_UPDATE_ENABLED";
export var CHANNEL_ENV = "OPENKAI_CHANNEL";
export var MANIFEST_ENV = "OPENKAI_MANIFEST_URL";
export var RELEASE_KEY_ENV = "OPENKAI_RELEASE_PUBLIC_KEY";
// ─── Pure helpers ───────────────────────────────────────────────────────────
/**
 * Resolve the active channel. `envChannel` is an operator/test override;
 * otherwise the build-time stamp decides. Pure on its inputs for unit tests.
 */ export function resolveChannel(opts) {
    if (opts.envChannel === "standalone" || opts.envChannel === "npm") {
        return opts.envChannel;
    }
    return opts.buildChannel;
}
/**
 * Resolve the kill-switch. Anything in { "0", "false", "no", "off" } (case-
 * insensitive) disables auto-upgrade entirely; unset/other values enable it.
 */ export function resolveAutoUpdateEnabled(envValue) {
    if (envValue === undefined) return true;
    var normalised = envValue.trim().toLowerCase();
    return ![
        "0",
        "false",
        "no",
        "off"
    ].includes(normalised);
}
/** Detect the current platform's release target (matches build-binaries.sh). */ export function detectTarget() {
    var platform = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : process.platform, arch = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : process.arch;
    var archName = arch === "x64" ? "x64" : arch === "arm64" ? "arm64" : arch;
    return "".concat(platform, "-").concat(archName);
}
/** Semver-ish comparison: returns -1, 0, or 1. Tolerant of non-numeric parts. */ export function compareVersions(a, b) {
    var pa = a.split(".");
    var pb = b.split(".");
    var len = Math.max(pa.length, pb.length);
    for(var i = 0; i < len; i += 1){
        var _pa_i, _pb_i;
        var ai = (_pa_i = pa[i]) !== null && _pa_i !== void 0 ? _pa_i : "0";
        var bi = (_pb_i = pb[i]) !== null && _pb_i !== void 0 ? _pb_i : "0";
        var an = Number(ai);
        var bn = Number(bi);
        if (Number.isFinite(an) && Number.isFinite(bn)) {
            if (an < bn) return -1;
            if (an > bn) return 1;
        } else {
            if (ai < bi) return -1;
            if (ai > bi) return 1;
        }
    }
    return 0;
}
/** Canonical bytes a manifest signature covers (excludes the signature field). */ export function canonicalManifestBytes(manifest) {
    var sorted = {
        version: manifest.version,
        artifacts: _to_consumable_array(manifest.artifacts).sort(function(x, y) {
            return x.target < y.target ? -1 : x.target > y.target ? 1 : 0;
        })
    };
    return new TextEncoder().encode(JSON.stringify(sorted));
}
export function sha256Hex(bytes) {
    return createHash("sha256").update(bytes).digest("hex");
}
export var WitnessMismatchError = /*#__PURE__*/ function(Error1) {
    "use strict";
    _inherits(WitnessMismatchError, Error1);
    function WitnessMismatchError(kind, expected, actual) {
        _class_call_check(this, WitnessMismatchError);
        var _this;
        _this = _call_super(this, WitnessMismatchError, [
            "".concat(kind, " witness mismatch: expected ").concat(expected, ", got ").concat(actual)
        ]), _define_property(_this, "kind", void 0), _define_property(_this, "name", void 0), _this.kind = kind, _this.name = "WitnessMismatchError";
        return _this;
    }
    return WitnessMismatchError;
}(_wrap_native_super(Error));
export var AutoUpdateDisabledError = /*#__PURE__*/ function(Error1) {
    "use strict";
    _inherits(AutoUpdateDisabledError, Error1);
    function AutoUpdateDisabledError() {
        _class_call_check(this, AutoUpdateDisabledError);
        var _this;
        _this = _call_super(this, AutoUpdateDisabledError, [
            "auto-update disabled by kill-switch (OPENKAI_AUTO_UPDATE_ENABLED=false)"
        ]), _define_property(_this, "name", "AutoUpdateDisabledError");
        return _this;
    }
    return AutoUpdateDisabledError;
}(_wrap_native_super(Error));
export var NoPreviousBinaryError = /*#__PURE__*/ function(Error1) {
    "use strict";
    _inherits(NoPreviousBinaryError, Error1);
    function NoPreviousBinaryError(path) {
        _class_call_check(this, NoPreviousBinaryError);
        var _this;
        _this = _call_super(this, NoPreviousBinaryError, [
            "no previous binary to roll back to at ".concat(path)
        ]), _define_property(_this, "name", "NoPreviousBinaryError");
        return _this;
    }
    return NoPreviousBinaryError;
}(_wrap_native_super(Error));
/**
 * Verify an Ed25519 manifest signature. `publicKeyBase64` is a DER SPKI
 * Ed25519 public key (base64). Returns true on valid signature, false on
 * mismatch. Throws only on malformed key material.
 */ export function verifyManifestSignature(manifest, publicKeyBase64, signatureHex) {
    var key = createPublicKey({
        key: Buffer.from(publicKeyBase64, "base64"),
        format: "der",
        type: "spki"
    });
    var data = canonicalManifestBytes(manifest);
    var signature = Buffer.from(signatureHex, "hex");
    return verify(null, data, key, signature);
}
/** Sign a manifest (test/utility helper — not used in the upgrade path). */ export function signManifest(manifest, privateKeyPem) {
    var data = canonicalManifestBytes(manifest);
    return sign(null, data, privateKeyPem).toString("hex");
}
/** Update witness: verifies manifest signature + artifact SHA-256 before swap. */ export var UpdateWitness = /*#__PURE__*/ function() {
    "use strict";
    function UpdateWitness(releasePublicKey) {
        _class_call_check(this, UpdateWitness);
        _define_property(this, "releasePublicKey", void 0);
        this.releasePublicKey = releasePublicKey;
    }
    _create_class(UpdateWitness, [
        {
            /** Verify the manifest signature when a release key is pinned. */ key: "verifyManifest",
            value: function verifyManifest(manifest) {
                if (!this.releasePublicKey) {
                    // No key pinned → manifest-signature verification is opt-in. The
                    // artifact SHA-256 witness still gates every swap (see verifyArtifact).
                    return;
                }
                if (!manifest.signature) {
                    throw new WitnessMismatchError("manifest", "signed manifest", "unsigned");
                }
                var ok = verifyManifestSignature(manifest, this.releasePublicKey, manifest.signature);
                if (!ok) {
                    throw new WitnessMismatchError("manifest", "valid signature", "invalid");
                }
            }
        },
        {
            /** Verify a downloaded artifact's SHA-256 against the manifest. */ key: "verifyArtifact",
            value: function verifyArtifact(artifact, bytes) {
                var actual = sha256Hex(bytes);
                if (actual.toLowerCase() !== artifact.sha256.toLowerCase()) {
                    throw new WitnessMismatchError("artifact", artifact.sha256, actual);
                }
            }
        }
    ]);
    return UpdateWitness;
}();
export var defaultDeps = {
    fetchManifest: function fetchManifest(url) {
        return _async_to_generator(function() {
            var res;
            return _ts_generator(this, function(_state) {
                switch(_state.label){
                    case 0:
                        return [
                            4,
                            fetch(url)
                        ];
                    case 1:
                        res = _state.sent();
                        if (!res.ok) {
                            throw new Error("manifest fetch failed: ".concat(res.status, " ").concat(url));
                        }
                        return [
                            4,
                            res.json()
                        ];
                    case 2:
                        return [
                            2,
                            _state.sent()
                        ];
                }
            });
        })();
    },
    download: function download(url) {
        return _async_to_generator(function() {
            var res, _;
            return _ts_generator(this, function(_state) {
                switch(_state.label){
                    case 0:
                        return [
                            4,
                            fetch(url)
                        ];
                    case 1:
                        res = _state.sent();
                        if (!res.ok) {
                            throw new Error("artifact fetch failed: ".concat(res.status, " ").concat(url));
                        }
                        _ = Uint8Array.bind;
                        return [
                            4,
                            res.arrayBuffer()
                        ];
                    case 2:
                        return [
                            2,
                            new (_.apply(Uint8Array, [
                                void 0,
                                _state.sent()
                            ]))
                        ];
                }
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
    chmod: function chmod(p, m) {
        return fsp.chmod(p, m);
    },
    stat: function stat(p) {
        return _async_to_generator(function() {
            var s;
            return _ts_generator(this, function(_state) {
                switch(_state.label){
                    case 0:
                        return [
                            4,
                            fsp.stat(p)
                        ];
                    case 1:
                        s = _state.sent();
                        return [
                            2,
                            {
                                isFile: s.isFile()
                            }
                        ];
                }
            });
        })();
    }
};
/**
 * Standalone-channel binary upgrader. The npm channel is handled upstream
 * (runUpgrade) and never constructs this class — npm installs never
 * self-mutate.
 *
 * Layout next to the running binary:
 *   <binary>            — the active standalone binary
 *   <binary>.new        — staging path for the downloaded artifact
 *   <binary>.previous   — the prior binary, preserved for rollback
 */ export var Upgrader = /*#__PURE__*/ function() {
    "use strict";
    function Upgrader(opts) {
        _class_call_check(this, Upgrader);
        _define_property(this, "opts", void 0);
        _define_property(this, "previousBinary", void 0);
        _define_property(this, "staging", void 0);
        _define_property(this, "witness", void 0);
        this.opts = opts;
        this.previousBinary = "".concat(opts.currentBinary, ".previous");
        this.staging = "".concat(opts.currentBinary, ".new");
        this.witness = new UpdateWitness(opts.releasePublicKey);
    }
    _create_class(Upgrader, [
        {
            key: "fetchManifestFor",
            value: function fetchManifestFor(version) {
                return _async_to_generator(function() {
                    var url, manifest;
                    return _ts_generator(this, function(_state) {
                        switch(_state.label){
                            case 0:
                                url = version ? manifestUrlForVersion(this.opts.manifestUrl, version) : this.opts.manifestUrl;
                                return [
                                    4,
                                    this.opts.deps.fetchManifest(url)
                                ];
                            case 1:
                                manifest = _state.sent();
                                this.witness.verifyManifest(manifest);
                                return [
                                    2,
                                    manifest
                                ];
                        }
                    });
                }).call(this);
            }
        },
        {
            key: "findArtifact",
            value: function findArtifact(manifest) {
                var _this = this;
                return manifest.artifacts.find(function(a) {
                    return a.target === _this.opts.target;
                });
            }
        },
        {
            key: "check",
            value: /** Check for an available update without applying anything. */ function check(version) {
                return _async_to_generator(function() {
                    var manifest, artifact, updateAvailable;
                    return _ts_generator(this, function(_state) {
                        switch(_state.label){
                            case 0:
                                return [
                                    4,
                                    this.fetchManifestFor(version)
                                ];
                            case 1:
                                manifest = _state.sent();
                                artifact = this.findArtifact(manifest);
                                updateAvailable = artifact !== undefined && compareVersions(manifest.version, this.opts.currentVersion) > 0;
                                return [
                                    2,
                                    {
                                        manifest: manifest,
                                        artifact: artifact,
                                        latest: manifest.version,
                                        updateAvailable: updateAvailable
                                    }
                                ];
                        }
                    });
                }).call(this);
            }
        },
        {
            key: "upgrade",
            value: /**
   * Perform a witnessed upgrade. Refuses when the kill-switch is off, when
   * no artifact matches the current target, when already up-to-date, or when
   * the SHA-256 witness fails. The prior binary is preserved for rollback.
   */ function upgrade(version) {
                return _async_to_generator(function() {
                    var result, bytes, unused;
                    return _ts_generator(this, function(_state) {
                        switch(_state.label){
                            case 0:
                                if (!this.opts.autoUpdateEnabled) {
                                    throw new AutoUpdateDisabledError();
                                }
                                return [
                                    4,
                                    this.check(version)
                                ];
                            case 1:
                                result = _state.sent();
                                if (!result.artifact) {
                                    throw new Error("no release artifact for target ".concat(this.opts.target, " in manifest"));
                                }
                                if (!result.updateAvailable) {
                                    return [
                                        2,
                                        {
                                            alreadyUpToDate: true,
                                            from: this.opts.currentVersion,
                                            to: this.opts.currentVersion,
                                            previousBinary: this.previousBinary
                                        }
                                    ];
                                }
                                return [
                                    4,
                                    this.opts.deps.download(result.artifact.url)
                                ];
                            case 2:
                                bytes = _state.sent();
                                this.witness.verifyArtifact(result.artifact, bytes);
                                // Stage the new binary, make it executable, then swap atomically.
                                return [
                                    4,
                                    this.opts.deps.writeFile(this.staging, bytes)
                                ];
                            case 3:
                                _state.sent();
                                return [
                                    4,
                                    this.opts.deps.chmod(this.staging, 493)
                                ];
                            case 4:
                                _state.sent();
                                _state.label = 5;
                            case 5:
                                _state.trys.push([
                                    5,
                                    8,
                                    ,
                                    9
                                ]);
                                return [
                                    4,
                                    this.opts.deps.stat(this.opts.currentBinary)
                                ];
                            case 6:
                                _state.sent();
                                return [
                                    4,
                                    this.opts.deps.copyFile(this.opts.currentBinary, this.previousBinary)
                                ];
                            case 7:
                                _state.sent();
                                return [
                                    3,
                                    9
                                ];
                            case 8:
                                unused = _state.sent();
                                return [
                                    3,
                                    9
                                ];
                            case 9:
                                return [
                                    4,
                                    this.opts.deps.rename(this.staging, this.opts.currentBinary)
                                ];
                            case 10:
                                _state.sent();
                                return [
                                    2,
                                    {
                                        alreadyUpToDate: false,
                                        from: this.opts.currentVersion,
                                        to: result.latest,
                                        artifact: result.artifact,
                                        previousBinary: this.previousBinary
                                    }
                                ];
                        }
                    });
                }).call(this);
            }
        },
        {
            key: "rollback",
            value: /**
   * Roll back to the `.previous` binary. Always allowed (recovery path) —
   * not gated by the kill-switch, so an operator can recover even when
   * auto-update is disabled. The rolled-back-from binary becomes the new
   * `.previous`, so rollback is reversible (re-roll-forward).
   */ function rollback() {
                return _async_to_generator(function() {
                    var prevExists, st, unused, prevBytes, curBytes;
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
                                    this.opts.deps.stat(this.previousBinary)
                                ];
                            case 1:
                                st = _state.sent();
                                prevExists = st.isFile;
                                return [
                                    3,
                                    3
                                ];
                            case 2:
                                unused = _state.sent();
                                prevExists = false;
                                return [
                                    3,
                                    3
                                ];
                            case 3:
                                if (!prevExists) {
                                    throw new NoPreviousBinaryError(this.previousBinary);
                                }
                                return [
                                    4,
                                    this.opts.deps.readFile(this.previousBinary)
                                ];
                            case 4:
                                prevBytes = _state.sent();
                                return [
                                    4,
                                    this.opts.deps.readFile(this.opts.currentBinary)
                                ];
                            case 5:
                                curBytes = _state.sent();
                                // Stage previous, swap into place, then save the old current as the new
                                // previous (enables a reversible re-roll-forward).
                                return [
                                    4,
                                    this.opts.deps.writeFile(this.staging, prevBytes)
                                ];
                            case 6:
                                _state.sent();
                                return [
                                    4,
                                    this.opts.deps.chmod(this.staging, 493)
                                ];
                            case 7:
                                _state.sent();
                                return [
                                    4,
                                    this.opts.deps.rename(this.staging, this.opts.currentBinary)
                                ];
                            case 8:
                                _state.sent();
                                return [
                                    4,
                                    this.opts.deps.writeFile(this.previousBinary, curBytes)
                                ];
                            case 9:
                                _state.sent();
                                return [
                                    2,
                                    {
                                        from: this.opts.currentVersion,
                                        to: "(previous)",
                                        previousBinary: this.previousBinary
                                    }
                                ];
                        }
                    });
                }).call(this);
            }
        }
    ]);
    return Upgrader;
}();
/** Build a version-specific manifest URL from a base (latest) URL. */ export function manifestUrlForVersion(base, version) {
    if (base.includes("latest.json")) {
        return base.replace("latest.json", "".concat(version, ".json"));
    }
    return "".concat(base.replace(/\/$/, ""), "/").concat(version, ".json");
}
function resolveContext(options) {
    var _options_env, _ref, _options_manifestUrl, _options_currentBinary, _options_currentVersion, _options_target, _options_deps;
    var env = (_options_env = options.env) !== null && _options_env !== void 0 ? _options_env : process.env;
    var channel = resolveChannel({
        buildChannel: BUILD_CHANNEL,
        envChannel: env[CHANNEL_ENV]
    });
    var autoUpdateEnabled = resolveAutoUpdateEnabled(env[KILL_SWITCH_ENV]);
    var manifestUrl = (_ref = (_options_manifestUrl = options.manifestUrl) !== null && _options_manifestUrl !== void 0 ? _options_manifestUrl : env[MANIFEST_ENV]) !== null && _ref !== void 0 ? _ref : DEFAULT_MANIFEST_URL;
    var currentBinary = (_options_currentBinary = options.currentBinary) !== null && _options_currentBinary !== void 0 ? _options_currentBinary : process.execPath;
    var currentVersion = (_options_currentVersion = options.currentVersion) !== null && _options_currentVersion !== void 0 ? _options_currentVersion : CLI_VERSION;
    var target = (_options_target = options.target) !== null && _options_target !== void 0 ? _options_target : detectTarget();
    var releasePublicKey = env[RELEASE_KEY_ENV];
    return {
        channel: channel,
        autoUpdateEnabled: autoUpdateEnabled,
        manifestUrl: manifestUrl,
        currentBinary: currentBinary,
        currentVersion: currentVersion,
        target: target,
        releasePublicKey: releasePublicKey,
        deps: (_options_deps = options.deps) !== null && _options_deps !== void 0 ? _options_deps : defaultDeps
    };
}
/** `openkai upgrade` CLI entry point. Returns an exit code + message. */ export function runUpgrade(options) {
    return _async_to_generator(function() {
        var ctx, message, message1, upgrader, result, message2, error, message3, result1, lines, error1, message4, message5, result2, message6, message7, error2, message8;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    ctx = resolveContext(options);
                    // npm channel: pinned at build time, never self-mutates.
                    if (ctx.channel === "npm") {
                        message = [
                            "openkai upgrade — channel: npm (pinned at build time)",
                            "npm installs never self-mutate. Upgrade explicitly with:",
                            "  npm install -g @openkai/cli@<version>"
                        ].join("\n");
                        return [
                            2,
                            {
                                exitCode: 0,
                                message: message,
                                channel: "npm",
                                autoUpdateEnabled: false
                            }
                        ];
                    }
                    // `OPENKAI_CHANNEL=standalone` must not re-enter the self-mutating path on a
                    // build that is not a compiled standalone binary. Under a host interpreter
                    // `process.execPath` is *node*, not an openkai binary, so the swap would
                    // overwrite the user's node install with a release artifact — the witness
                    // verifies the bytes, but nothing else verifies the destination. Callers that
                    // pass an explicit `currentBinary` (tests, embedders) are unaffected.
                    if (BUILD_CHANNEL !== "standalone" && options.currentBinary === undefined) {
                        message1 = [
                            "openkai upgrade — refusing standalone self-upgrade: this build is not a",
                            "standalone binary (".concat(CHANNEL_ENV, "=standalone was set on an npm build)."),
                            "Self-upgrade here would overwrite ".concat(ctx.currentBinary, ", not an openkai binary."),
                            "Upgrade explicitly with: npm install -g @openkai/cli@<version>"
                        ].join("\n");
                        return [
                            2,
                            {
                                exitCode: 1,
                                message: message1,
                                channel: ctx.channel,
                                autoUpdateEnabled: ctx.autoUpdateEnabled
                            }
                        ];
                    }
                    upgrader = new Upgrader({
                        manifestUrl: ctx.manifestUrl,
                        currentBinary: ctx.currentBinary,
                        currentVersion: ctx.currentVersion,
                        target: ctx.target,
                        autoUpdateEnabled: ctx.autoUpdateEnabled,
                        releasePublicKey: ctx.releasePublicKey,
                        deps: ctx.deps
                    });
                    if (!options.rollback) return [
                        3,
                        4
                    ];
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
                        upgrader.rollback()
                    ];
                case 2:
                    result = _state.sent();
                    message2 = [
                        "rollback complete: ".concat(result.from, " → previous binary"),
                        "previous binary preserved at ".concat(result.previousBinary),
                        "restart openkai to run the restored binary."
                    ].join("\n");
                    return [
                        2,
                        {
                            exitCode: 0,
                            message: message2,
                            channel: ctx.channel,
                            autoUpdateEnabled: ctx.autoUpdateEnabled
                        }
                    ];
                case 3:
                    error = _state.sent();
                    message3 = "rollback failed: ".concat(_instanceof(error, Error) ? error.message : String(error));
                    return [
                        2,
                        {
                            exitCode: 1,
                            message: message3,
                            channel: ctx.channel,
                            autoUpdateEnabled: ctx.autoUpdateEnabled
                        }
                    ];
                case 4:
                    if (!options.check) return [
                        3,
                        8
                    ];
                    _state.label = 5;
                case 5:
                    _state.trys.push([
                        5,
                        7,
                        ,
                        8
                    ]);
                    return [
                        4,
                        upgrader.check(options.version)
                    ];
                case 6:
                    result1 = _state.sent();
                    lines = [
                        "openkai upgrade — channel: standalone",
                        "auto-update: ".concat(ctx.autoUpdateEnabled ? "enabled" : "disabled (".concat(KILL_SWITCH_ENV, "=false)")),
                        "current: ".concat(ctx.currentVersion),
                        "latest: ".concat(result1.latest)
                    ];
                    if (!result1.artifact) {
                        lines.push("artifact: none for target ".concat(ctx.target));
                    } else {
                        lines.push("artifact: ".concat(result1.artifact.target, " (sha256 ").concat(result1.artifact.sha256.slice(0, 12), "…)"));
                    }
                    lines.push(result1.updateAvailable ? "update available: yes" : "update available: no");
                    return [
                        2,
                        {
                            exitCode: 0,
                            message: lines.join("\n"),
                            channel: ctx.channel,
                            autoUpdateEnabled: ctx.autoUpdateEnabled
                        }
                    ];
                case 7:
                    error1 = _state.sent();
                    message4 = "check failed: ".concat(_instanceof(error1, Error) ? error1.message : String(error1));
                    return [
                        2,
                        {
                            exitCode: 1,
                            message: message4,
                            channel: ctx.channel,
                            autoUpdateEnabled: ctx.autoUpdateEnabled
                        }
                    ];
                case 8:
                    // upgrade: gated by the kill-switch.
                    if (!ctx.autoUpdateEnabled) {
                        message5 = [
                            "openkai upgrade — auto-update disabled (".concat(KILL_SWITCH_ENV, "=false)"),
                            "self-upgrade refused. Re-enable by unsetting ".concat(KILL_SWITCH_ENV, ","),
                            "or recover with `openkai upgrade --rollback`."
                        ].join("\n");
                        return [
                            2,
                            {
                                exitCode: 1,
                                message: message5,
                                channel: ctx.channel,
                                autoUpdateEnabled: false
                            }
                        ];
                    }
                    _state.label = 9;
                case 9:
                    _state.trys.push([
                        9,
                        11,
                        ,
                        12
                    ]);
                    return [
                        4,
                        upgrader.upgrade(options.version)
                    ];
                case 10:
                    result2 = _state.sent();
                    if (result2.alreadyUpToDate) {
                        message6 = "already up-to-date: ".concat(result2.from);
                        return [
                            2,
                            {
                                exitCode: 0,
                                message: message6,
                                channel: ctx.channel,
                                autoUpdateEnabled: ctx.autoUpdateEnabled
                            }
                        ];
                    }
                    message7 = [
                        "verifying manifest… ok",
                        result2.artifact ? "downloading ".concat(result2.artifact.target, " (").concat(result2.to, ")…") : "downloading (".concat(result2.to, ")…"),
                        "witness: sha256 verified",
                        "swapping binary: ".concat(result2.from, " → ").concat(result2.to),
                        "previous binary preserved at ".concat(result2.previousBinary),
                        "upgrade complete: ".concat(result2.to),
                        "restart openkai to run the new binary."
                    ].join("\n");
                    return [
                        2,
                        {
                            exitCode: 0,
                            message: message7,
                            channel: ctx.channel,
                            autoUpdateEnabled: ctx.autoUpdateEnabled
                        }
                    ];
                case 11:
                    error2 = _state.sent();
                    if (_instanceof(error2, WitnessMismatchError)) {
                        return [
                            2,
                            {
                                exitCode: 1,
                                message: "upgrade refused: ".concat(error2.message),
                                channel: ctx.channel,
                                autoUpdateEnabled: ctx.autoUpdateEnabled
                            }
                        ];
                    }
                    message8 = "upgrade failed: ".concat(_instanceof(error2, Error) ? error2.message : String(error2));
                    return [
                        2,
                        {
                            exitCode: 1,
                            message: message8,
                            channel: ctx.channel,
                            autoUpdateEnabled: ctx.autoUpdateEnabled
                        }
                    ];
                case 12:
                    return [
                        2
                    ];
            }
        });
    })();
}
