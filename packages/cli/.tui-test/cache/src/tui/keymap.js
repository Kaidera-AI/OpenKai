//# hash=1b2d298bf5793891d4a560364cb28438
//# sourceMappingURL=keymap.js.map

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
/**
 * Keymap (scope §4 `keymap.ts`) — KeybindingsManager + Esc grammar.
 *
 * Augments pi-tui's {@link Keybindings} with OpenKai-specific actions
 * (`openkai.toggleThinking`, `openkai.quit`, `openkai.openPalette`,
 * `openkai.stash`) and builds a {@link KeybindingsManager} installed as the
 * global keybinding registry so the Editor's built-in handlers resolve against
 * it. `tui.input.copy` is remapped off `ctrl+c` so Ctrl+C is free for
 * quit-with-confirm (scope §3.5). The leader-key palette (Ctrl+K, scope §1.3) is
 * intercepted at the app input-listener level (which runs before the focused
 * Editor), so it consumes Ctrl+K before the Editor's `deleteToLineEnd` would;
 * `deleteToLineEnd` is remapped to `alt+k` to keep the capability (ctrl+shift+k
 * is the same byte as ctrl+k in terminals without the kitty keyboard protocol,
 * so it would be unreachable) and avoid a keybinding conflict record.
 *
 * The Esc grammar (double-Esc clears the draft, scope §3.5) is detected at the
 * app input-listener level via {@link DoubleEscDetector}, which tracks rapid
 * consecutive Esc presses within a reassembly window.
 */ import { KeybindingsManager, TUI_KEYBINDINGS, matchesKey, setKeybindings } from "@earendil-works/pi-tui";
/** OpenKai-specific keybinding definitions (merged over the pi-tui defaults). */ export var OPENKAI_KEYBINDINGS = _object_spread_props(_object_spread({}, TUI_KEYBINDINGS), {
    "openkai.toggleThinking": {
        defaultKeys: "ctrl+o",
        description: "Toggle thinking density"
    },
    "openkai.quit": {
        defaultKeys: "ctrl+c",
        description: "Quit the TUI (with confirm)"
    },
    "openkai.openPalette": {
        defaultKeys: "ctrl+k",
        description: "Open the command palette"
    },
    "openkai.stash": {
        defaultKeys: "ctrl+s",
        description: "Stash / pop the prompt draft"
    }
});
/**
 * User bindings: remap `tui.input.copy` off `ctrl+c` so the Editor does not
 * swallow Ctrl+C before the quit-with-confirm handler sees it. Copy is
 * remapped to `alt+c`. `tui.editor.deleteToLineEnd` is remapped off `ctrl+k`
 * (to `ctrl+shift+k`) so Ctrl+K is free for the leader-key palette (§1.3).
 */ var OPENKAI_USER_BINDINGS = {
    "tui.input.copy": "alt+c",
    "tui.editor.deleteToLineEnd": "alt+k"
};
/**
 * Build and install the OpenKai {@link KeybindingsManager} as the global
 * registry. Returns the manager so the app input listener can match against
 * the OpenKai ids. Idempotent — safe to call once per process.
 */ export function installKeymap() {
    var manager = new KeybindingsManager(OPENKAI_KEYBINDINGS, OPENKAI_USER_BINDINGS);
    setKeybindings(manager);
    return manager;
}
/** True if `data` is the Ctrl+O toggle (matches the installed keybinding). */ export function isToggleThinking(data, manager) {
    return manager.matches(data, "openkai.toggleThinking");
}
/** True if `data` is the Ctrl+C quit (matches the installed keybinding). */ export function isQuit(data, manager) {
    return manager.matches(data, "openkai.quit");
}
/** True if `data` is the Ctrl+K palette open (matches the installed keybinding). */ export function isOpenPalette(data, manager) {
    return manager.matches(data, "openkai.openPalette");
}
/** True if `data` is the Ctrl+S stash/pop (matches the installed keybinding). */ export function isStash(data, manager) {
    return manager.matches(data, "openkai.stash");
}
/** True if `data` is a lone Escape key. */ export function isEscape(data) {
    return matchesKey(data, "escape");
}
/**
 * Double-Esc detector (scope §3.5). Returns `true` when two Esc presses
 * arrive within `windowMs` (default 350ms). The first Esc of a pair is not
 * consumed; the second clears the draft.
 */ export var DoubleEscDetector = /*#__PURE__*/ function() {
    "use strict";
    function DoubleEscDetector() {
        var windowMs = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : 350;
        _class_call_check(this, DoubleEscDetector);
        _define_property(this, "windowMs", void 0);
        _define_property(this, "lastEscAt", void 0);
        this.windowMs = windowMs;
        this.lastEscAt = 0;
    }
    _create_class(DoubleEscDetector, [
        {
            /** Feed an input chunk; returns `true` if this completes a double-Esc. */ key: "feed",
            value: function feed(data) {
                if (!isEscape(data)) {
                    this.lastEscAt = 0;
                    return false;
                }
                var now = Date.now();
                if (this.lastEscAt > 0 && now - this.lastEscAt <= this.windowMs) {
                    this.lastEscAt = 0;
                    return true;
                }
                this.lastEscAt = now;
                return false;
            }
        }
    ]);
    return DoubleEscDetector;
}();
