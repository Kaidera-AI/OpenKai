//# hash=aa55f5d6298de65464eee04528195470
//# sourceMappingURL=composer.js.map

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
 * Composer (scope §4 `composer.ts`) — Editor wiring.
 *
 * Wraps a pi-tui {@link Editor}: Enter submits (via the Editor's built-in
 * `tui.input.submit`), `onSubmit` fires the controller. Prompt history is
 * appended on submit; frecency-ranked recall seeding is owned by the
 * controller (scope §1.4) which calls {@link Editor.addToHistory} in ranked
 * order at startup. {@link Composer.prefill} inserts a slash command prefix
 * (used by the palette's `/btw` / `/resume` actions, scope §1.3).
 */ import { Editor } from "@earendil-works/pi-tui";
import { editorTheme } from "./theme.js";
/**
 * The prompt editor. The controller reads {@link Composer.text} on submit and
 * calls {@link Composer.clear} to reset the draft.
 */ export var Composer = /*#__PURE__*/ function() {
    "use strict";
    function Composer(tui, options) {
        var _this = this;
        _class_call_check(this, Composer);
        _define_property(this, "editor", void 0);
        _define_property(this, "onSubmitCb", void 0);
        _define_property(this, "history", []);
        this.onSubmitCb = options.onSubmit;
        var editor = new Editor(tui, editorTheme, {
            paddingX: 1
        });
        editor.disableSubmit = false;
        editor.onSubmit = function(text) {
            var trimmed = text.trim();
            if (trimmed.length === 0) return;
            _this.history.push(trimmed);
            editor.addToHistory(text);
            _this.onSubmitCb(trimmed);
        };
        this.editor = editor;
    }
    _create_class(Composer, [
        {
            key: "text",
            get: /** Current draft text (paste markers expanded). */ function get() {
                return this.editor.getExpandedText();
            }
        },
        {
            /** Clear the draft (double-Esc, scope §3.5). */ key: "clear",
            value: function clear() {
                this.editor.setText("");
            }
        },
        {
            /** Insert text at the cursor (used by `/resume <id>` command expansion). */ key: "insert",
            value: function insert(text) {
                this.editor.insertTextAtCursor(text);
            }
        },
        {
            /**
   * Replace the draft with a prefix (e.g. `/btw ` from the palette, scope §1.3)
   * so the operator types the argument and submits. Clears first so the prefix
   * is the only content.
   */ key: "prefill",
            value: function prefill(prefix) {
                this.editor.setText(prefix);
            }
        },
        {
            key: "promptHistory",
            get: /** Submitted-prompt history (frecency ordering is P4b; here: append order). */ function get() {
                return this.history;
            }
        }
    ]);
    return Composer;
}();
