//# hash=3dc004b9a26e407b97987078bcc26db6
//# sourceMappingURL=attention.js.map

/**
 * Focus-aware attention notifications (scope §1.1).
 *
 * When the terminal is **not focused** and a turn ends (or a permission
 * request lands), emit a terminal bell + OSC 9 / OSC 777 notification where the
 * terminal supports it. **Quiet when focused** — the operator is already
 * watching, so a bell is noise. The notification surface is I/O only; the
 * chrome attention *state* is owned by the status line (scope §2:
 * clean-by-default — attention lives in the status line, not a banner).
 *
 * All colour decisions are in {@link theme.ts}; this module only emits
 * non-colour control sequences (bell + OSC) and tracks a boolean focus flag.
 * No new runtime deps; the writer is whatever the runtime passes (the real
 * terminal's `write`, or a capturing writer in tests).
 */ /** A minimal write sink (the terminal's `write`, or a test capturer). */ function _class_call_check(instance, Constructor) {
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
/**
 * Focus-aware notifier. Default state is **focused** (scope §1.1: "quiet when
 * focused"). DEC 1004 reports focus only on *change*, so a terminal focused at
 * launch never emits a focus-in — defaulting to focused=true means the first
 * turn_end does NOT ring the bell while the operator is watching (the exact
 * noise scope §1.1 forbids). A terminal without focus reporting stays quiet
 * forever (the safe degradation); a real focus-out event flips this to false
 * and enables notifications.
 */ export var AttentionNotifier = /*#__PURE__*/ function() {
    "use strict";
    function AttentionNotifier(writer) {
        _class_call_check(this, AttentionNotifier);
        _define_property(this, "focused", true);
        _define_property(this, "writer", void 0);
        this.writer = writer;
    }
    _create_class(AttentionNotifier, [
        {
            /** Mark the terminal focused/unfocused (from DEC 1004 focus-in/out). */ key: "setFocused",
            value: function setFocused(focused) {
                this.focused = focused;
            }
        },
        {
            key: "isFocused",
            get: /** Current focus state. */ function get() {
                return this.focused;
            }
        },
        {
            /**
   * Emit a notification when unfocused (scope §1.1): a bell, an OSC 9 growl
   * (iTerm-style), and an OSC 777 notify (urxvt-style). Terminals that don't
   * understand the OSC sequences ignore them; the bell still fires. When
   * focused, this is a no-op (quiet).
   */ key: "notify",
            value: function notify(title, body) {
                if (this.focused) return;
                var message = body ? "".concat(title, ": ").concat(body) : title;
                this.writer.write("\x07"); // BEL
                this.writer.write("\x1b]9;".concat(escapeOsc(message), "\x07")); // OSC 9 (iTerm growl)
                this.writer.write("\x1b]777;notify;".concat(escapeOsc(title), ";").concat(escapeOsc(body !== null && body !== void 0 ? body : ""), "\x07")); // OSC 777
            }
        }
    ]);
    return AttentionNotifier;
}();
/**
 * Escape an OSC string payload (the string terminator BEL/ST is the only
 * special char that must not appear literally). Keeps the sequence well-formed.
 */ function escapeOsc(s) {
    return s.replace(/\x07/g, " ").replace(/\x1b/g, " ");
}
/** DEC 1004 focus-report sequences the runtime writes to enable/disable them. */ export var FOCUS_REPORT_ENABLE = "\x1b[?1004h";
export var FOCUS_REPORT_DISABLE = "\x1b[?1004l";
/** Raw focus-event payloads emitted by a DEC 1004 terminal. */ export var FOCUS_IN = "\x1b[I";
export var FOCUS_OUT = "\x1b[O";
/** True if `data` is a focus-in report. */ export function isFocusIn(data) {
    return data === FOCUS_IN;
}
/** True if `data` is a focus-out report. */ export function isFocusOut(data) {
    return data === FOCUS_OUT;
}
