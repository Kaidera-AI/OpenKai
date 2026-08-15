//# hash=e0564e41769ba3f8b80dfb0614d0c975
//# sourceMappingURL=status.js.map

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
/**
 * Status chrome line (scope §3.4) — one line, always present.
 *
 * Renders: `agent-pill · model · session(short) · tokens · persist-mode · spinner`.
 * The agent pill (scope §1.2) replaces the static `m:chat` mode chip — the agent
 * identity is the live surface; mode is `chat` for now and stays in state for
 * the `/model` command. Fixed-width chips so state cycles never reflow the
 * composer. `persist-mode` shows `local` (standalone-local, A1) or the Cortex
 * project key (KOS-managed).
 *
 * P4b adds an `attention` state (scope §1.1): when a turn settled while the
 * terminal was unfocused, the spinner chip shows an amber `◉ attention` glyph —
 * clean-by-default, the attention state lives in the status line, not a banner.
 *
 * Updates arrive via {@link StatusState} mutations driven by the transport
 * event stream (usage at `turn_end`, turn state from deltas/turn_end).
 */ import { Text } from "@earendil-works/pi-tui";
import { highlight, rolePill, surface, text as textToken, toolBorder } from "./theme.js";
/** Default chrome state for a fresh session. */ export function defaultStatusState(modelId, sessionId, persistMode) {
    return {
        mode: "chat",
        agentName: "openkai",
        modelId: modelId,
        sessionId: sessionId,
        usage: null,
        persistMode: persistMode,
        busy: false,
        awaitingApproval: false,
        attention: false
    };
}
/**
 * Render the spinner chip — reflects true turn state (scope §3.3 + §1.1).
 * Priority: awaiting > busy > attention > idle. The amber `◉ attention` glyph
 * only shows when not busy/awaiting, so a settled-but-unnoticed turn is the
 * only attention signal (clean-by-default, scope §2).
 */ function spinnerChip(busy, awaiting, attention) {
    if (awaiting) return highlight.danger("◐ waiting");
    if (busy) return highlight.base("◌ busy");
    if (attention) return highlight.attention("◉ attention");
    return textToken.muted("○ idle");
}
/**
 * Status chrome component. A thin {@link Text} wrapper whose `setText` is
 * called by the controller on every state change. Always rendered as the
 * bottom line of the layout root.
 */ export var StatusLine = /*#__PURE__*/ function() {
    "use strict";
    function StatusLine(state) {
        _class_call_check(this, StatusLine);
        _define_property(this, "text", void 0);
        _define_property(this, "state", void 0);
        this.state = state;
        this.text = new Text(this.renderLine(), 1, 0, function(line) {
            return surface["3"](line);
        });
    }
    _create_class(StatusLine, [
        {
            /** Update state and re-render the line. */ key: "update",
            value: function update(state) {
                this.state = state;
                this.text.setText(this.renderLine());
            }
        },
        {
            key: "currentState",
            get: /** Current state (read for tests / controller bookkeeping). */ function get() {
                return this.state;
            }
        },
        {
            key: "renderLine",
            value: /** Compose the chrome line from tokens (the only colour source). Compact so all
   * chips (agent/model/session/tokens/persist) fit an 80-col line (scope §3.4). */ function renderLine() {
                var model = this.state.modelId.length > 18 ? this.state.modelId.slice(0, 17) + "…" : this.state.modelId;
                var session = this.state.sessionId.slice(0, 8);
                var tokens = this.state.usage ? "".concat(this.state.usage.totalTokens, "t") : "—";
                var sep = textToken.muted("·");
                return [
                    rolePill(this.state.agentName),
                    model,
                    session,
                    tokens,
                    "p:".concat(this.state.persistMode),
                    spinnerChip(this.state.busy, this.state.awaitingApproval, this.state.attention)
                ].join(" ".concat(sep, " "));
            }
        },
        {
            // ── Component ───────────────────────────────────────────────────────────
            key: "render",
            value: function render(width) {
                return this.text.render(width);
            }
        },
        {
            key: "invalidate",
            value: function invalidate() {
                this.text.invalidate();
            }
        }
    ]);
    return StatusLine;
}();
/** A muted divider line rendered above the chrome (visual separation). */ export function chromeDivider() {
    return toolBorder("─".repeat(8));
}
