//# hash=12f5c5c34a22a128e987f9aff3e5d296
//# sourceMappingURL=brand.js.map

function _array_like_to_array(arr, len) {
    if (len == null || len > arr.length) len = arr.length;
    for(var i = 0, arr2 = new Array(len); i < len; i++)arr2[i] = arr[i];
    return arr2;
}
function _array_without_holes(arr) {
    if (Array.isArray(arr)) return _array_like_to_array(arr);
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
function _unsupported_iterable_to_array(o, minLen) {
    if (!o) return;
    if (typeof o === "string") return _array_like_to_array(o, minLen);
    var n = Object.prototype.toString.call(o).slice(8, -1);
    if (n === "Object" && o.constructor) n = o.constructor.name;
    if (n === "Map" || n === "Set") return Array.from(n);
    if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _array_like_to_array(o, minLen);
}
/**
 * OpenKai branding (ADR OK-5 droid bar: the animated-logo moment happens
 * exactly once — the full splash renders on first run only, then a compact
 * mark ever after). Identity: OpenKai wordmark + "by Kaidera" provenance.
 */ import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
/** The full splash — first run only. Unicode block wordmark. */ export var OPENKAI_LOGO = [
    " ██████╗ ██████╗ ███████╗███╗   ██╗██╗  ██╗ █████╗ ██╗",
    "██╔═══██╗██╔══██╗██╔════╝████╗  ██║██║ ██╔╝██╔══██╗██║",
    "██║   ██║██████╔╝█████╗  ██╔██╗ ██║█████╔╝ ███████║██║",
    "██║   ██║██╔═══╝ ██╔══╝  ██║╚██╗██║██╔═██╗ ██╔══██║██║",
    "╚██████╔╝██║     ███████╗██║ ╚████║██║  ██╗██║  ██║██║",
    " ╚═════╝ ╚═╝     ╚══════╝╚═╝  ╚═══╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝"
];
export var BRAND_TAGLINE = "the open agent harness · by Kaidera";
/** The compact mark — every run after the first. */ export var compactMark = function compactMark(version) {
    return "OpenKai ".concat(version, " \xb7 by Kaidera — /help for commands, Ctrl+K palette");
};
var statePath = function statePath() {
    return path.join(homedir(), ".openkai", "state.json");
};
/** Splash state is user-global (~/.openkai/state.json), never per-project. */ export function shouldShowSplash() {
    var now = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : function() {
        return new Date();
    };
    void now;
    try {
        if (!existsSync(statePath())) return true;
        var state = JSON.parse(readFileSync(statePath(), "utf-8"));
        return state.splashSeen !== true;
    } catch (unused) {
        return true; // unreadable state: show the splash, it's harmless
    }
}
export function markSplashSeen() {
    try {
        var file = statePath();
        mkdirSync(path.dirname(file), {
            recursive: true
        });
        var state = {};
        if (existsSync(file)) {
            try {
                state = JSON.parse(readFileSync(file, "utf-8"));
            } catch (unused) {
                state = {};
            }
        }
        state.splashSeen = true;
        writeFileSync(file, "".concat(JSON.stringify(state, null, 2), "\n"), "utf-8");
    } catch (unused) {
    // branding state must never break the app
    }
}
/** The lines to render into a fresh transcript, per the once-rule. */ export function splashLines(version) {
    if (shouldShowSplash()) {
        markSplashSeen();
        return _to_consumable_array(OPENKAI_LOGO).concat([
            "",
            "".concat(BRAND_TAGLINE, " \xb7 ").concat(version),
            ""
        ]);
    }
    return [
        compactMark(version)
    ];
}
