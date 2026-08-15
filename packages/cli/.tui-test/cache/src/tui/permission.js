//# hash=7b906fc8bd383cbd19fd0c0c8985a8de
//# sourceMappingURL=permission.js.map

function _array_like_to_array(arr, len) {
    if (len == null || len > arr.length) len = arr.length;
    for(var i = 0, arr2 = new Array(len); i < len; i++)arr2[i] = arr[i];
    return arr2;
}
function _array_without_holes(arr) {
    if (Array.isArray(arr)) return _array_like_to_array(arr);
}
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
 * Permission overlay (P4b scope §5) — the approval surface for a
 * `permission_request` event.
 *
 * Shown via `tui.showOverlay(...)` when the controller receives a
 * `permission_request`. Renders the tool name + rule, a diff/command preview,
 * a three-item {@link SelectList} (`Allow once` / `Allow always` / `Reject`),
 * and the canonical overlay footer (scope §3.2 + §5: identical footer grammar
 * to every other overlay — ad-hoc literals are a review defect).
 *
 * **All colour comes from theme.ts** — removed diff lines use
 * `highlight.danger` (red), added lines use `highlight.base` (cyan); the rule
 * line uses `text.muted`; the footer uses {@link renderOverlayFooter}. The
 * overlay itself is a {@link Component} so it renders headlessly for the
 * golden-frame test (scope §6): the test asserts the footer grammar + the
 * theme-token diff colours on the captured frame.
 *
 * `handleInput` delegates to the inner {@link SelectList}; `onSelect`/`onCancel`
 * fire {@link onDecision}, which the controller wires to
 * `transport.respond(requestId, decision)` + `tui.hideOverlay()`.
 */ import { SelectList } from "@earendil-works/pi-tui";
import { highlight, renderOverlayFooter, surface, text as textToken, toolBorder } from "./theme.js";
/** The three approval actions surfaced as a SelectList. */ var APPROVAL_ITEMS = [
    {
        value: "once",
        label: "Allow once",
        description: "approve this call only"
    },
    {
        value: "always",
        label: "Allow always",
        description: "approve identical calls this session"
    },
    {
        value: "reject",
        label: "Reject",
        description: "deny and tell the model"
    }
];
/**
 * The permission overlay component. Composes a header + preview + SelectList +
 * footer, and routes input to the SelectList. Renderable headlessly.
 */ export var PermissionOverlay = /*#__PURE__*/ function() {
    "use strict";
    function PermissionOverlay(options) {
        var _this = this;
        _class_call_check(this, PermissionOverlay);
        _define_property(this, "toolName", void 0);
        _define_property(this, "rule", void 0);
        _define_property(this, "preview", void 0);
        _define_property(this, "onDecision", void 0);
        _define_property(this, "select", void 0);
        /** Guards against double-fire (Enter then Esc during teardown). */ _define_property(this, "answered", false);
        this.toolName = options.toolName;
        this.rule = options.rule;
        this.preview = options.preview;
        this.onDecision = options.onDecision;
        this.select = new SelectList(_to_consumable_array(APPROVAL_ITEMS), 5, {
            selectedPrefix: function selectedPrefix(t) {
                return highlight.base(t);
            },
            selectedText: function selectedText(t) {
                return highlight.base(t);
            },
            description: function description(t) {
                return textToken.muted(t);
            },
            scrollInfo: function scrollInfo(t) {
                return textToken.muted(t);
            },
            noMatch: function noMatch(t) {
                return textToken.muted(t);
            }
        });
        this.select.onSelect = function(item) {
            if (_this.answered) return;
            _this.answered = true;
            _this.onDecision(item.value);
        };
        this.select.onCancel = function() {
            if (_this.answered) return;
            _this.answered = true;
            _this.onDecision("reject");
        };
    }
    _create_class(PermissionOverlay, [
        {
            key: "invalidate",
            value: function invalidate() {
                this.select.invalidate();
            }
        },
        {
            key: "handleInput",
            value: function handleInput(data) {
                this.select.handleInput(data);
            }
        },
        {
            /** Render the overlay frame at `width` (headless-safe for golden-frame tests). */ key: "render",
            value: function render(width) {
                var lines = [];
                // Header: tool name (bold) + rule (muted).
                lines.push("".concat(textToken.strong(this.toolName), " ").concat(textToken.muted(this.rule)));
                lines.push(textToken.muted(toolBorder("─".repeat(Math.max(1, Math.min(width, 72))))));
                var _iteratorNormalCompletion = true, _didIteratorError = false, _iteratorError = undefined;
                try {
                    // Preview — branch on kind (the engine never formats display strings).
                    for(var _iterator = renderPreview(this.preview, width)[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true){
                        var line = _step.value;
                        lines.push(line);
                    }
                } catch (err) {
                    _didIteratorError = true;
                    _iteratorError = err;
                } finally{
                    try {
                        if (!_iteratorNormalCompletion && _iterator.return != null) {
                            _iterator.return();
                        }
                    } finally{
                        if (_didIteratorError) {
                            throw _iteratorError;
                        }
                    }
                }
                lines.push(textToken.muted(toolBorder("─".repeat(Math.max(1, Math.min(width, 72))))));
                var _iteratorNormalCompletion1 = true, _didIteratorError1 = false, _iteratorError1 = undefined;
                try {
                    // Actions.
                    for(var _iterator1 = this.select.render(width)[Symbol.iterator](), _step1; !(_iteratorNormalCompletion1 = (_step1 = _iterator1.next()).done); _iteratorNormalCompletion1 = true){
                        var line1 = _step1.value;
                        lines.push(line1);
                    }
                } catch (err) {
                    _didIteratorError1 = true;
                    _iteratorError1 = err;
                } finally{
                    try {
                        if (!_iteratorNormalCompletion1 && _iterator1.return != null) {
                            _iterator1.return();
                        }
                    } finally{
                        if (_didIteratorError1) {
                            throw _iteratorError1;
                        }
                    }
                }
                // Footer — the canonical overlay grammar (scope §3.2 + §5).
                lines.push(renderOverlayFooter());
                return lines;
            }
        }
    ]);
    return PermissionOverlay;
}();
/** Render the preview payload to coloured lines. */ function renderPreview(preview, width) {
    var cap = Math.max(8, Math.min(width - 2, 78));
    if (preview.kind === "command") {
        return [
            "".concat(textToken.muted("cwd  "), " ").concat(textToken.base(preview.cwd)),
            "".concat(textToken.muted("cmd  "), " ").concat(highlight.base(preview.command))
        ];
    }
    // diff: removed/added lines, token-coloured. before→removed, after→added,
    // presented as a unified-ish +/- sketch (the renderer applies the tokens).
    var lines = [];
    var beforeLines = preview.before.length === 0 ? [
        "(new file)"
    ] : preview.before.split("\n");
    var afterLines = preview.after.split("\n");
    var pathLine = "".concat(textToken.muted("file "), " ").concat(textToken.base(preview.path));
    lines.push(pathLine);
    var _iteratorNormalCompletion = true, _didIteratorError = false, _iteratorError = undefined;
    try {
        for(var _iterator = beforeLines[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true){
            var b = _step.value;
            lines.push(highlight.danger(truncate("- ".concat(b), cap)));
        }
    } catch (err) {
        _didIteratorError = true;
        _iteratorError = err;
    } finally{
        try {
            if (!_iteratorNormalCompletion && _iterator.return != null) {
                _iterator.return();
            }
        } finally{
            if (_didIteratorError) {
                throw _iteratorError;
            }
        }
    }
    var _iteratorNormalCompletion1 = true, _didIteratorError1 = false, _iteratorError1 = undefined;
    try {
        for(var _iterator1 = afterLines[Symbol.iterator](), _step1; !(_iteratorNormalCompletion1 = (_step1 = _iterator1.next()).done); _iteratorNormalCompletion1 = true){
            var a = _step1.value;
            lines.push(highlight.base(truncate("+ ".concat(a), cap)));
        }
    } catch (err) {
        _didIteratorError1 = true;
        _iteratorError1 = err;
    } finally{
        try {
            if (!_iteratorNormalCompletion1 && _iterator1.return != null) {
                _iterator1.return();
            }
        } finally{
            if (_didIteratorError1) {
                throw _iteratorError1;
            }
        }
    }
    return lines;
}
/** Truncate a line to `max` visible chars, keeping a trailing ellipsis. */ function truncate(line, max) {
    return line.length > max ? line.slice(0, max - 1) + "…" : line;
}
// Re-export so the surface[3] background is available if a renderer wants it.
export { surface };
