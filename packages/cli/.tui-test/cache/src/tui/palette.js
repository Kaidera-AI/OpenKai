//# hash=5c637d975755cc402d6c710801e0e980
//# sourceMappingURL=palette.js.map

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
 * Leader-key command palette (scope §1.3).
 *
 * A {@link Component} overlay opened by a leader key (Ctrl+K): a filter line +
 * a fuzzy-filtered {@link SelectList} of every command + the **canonical
 * overlay footer** (scope §3.2 — identical footer grammar to every overlay).
 * Fuzzy filtering uses pi-tui's {@link fuzzyFilter}; the {@link SelectList}
 * owns navigation/confirm/cancel. Typing appends to the query and rebuilds the
 * list from the fuzzy-ordered matches, so the palette doubles as a which-key
 * hint surface — each row shows the command's key.
 *
 * Renderable headlessly (the golden-frame test calls `render(width)` and
 * asserts the footer grammar). All colour comes from {@link theme.ts}.
 */ import { SelectList, fuzzyFilter, getKeybindings, matchesKey } from "@earendil-works/pi-tui";
import { paletteSelectTheme, renderOverlayFooter, text as textToken, highlight } from "./theme.js";
/**
 * The command palette overlay. Holds the live query, fuzzy-filters the item
 * set on every keystroke, and delegates up/down/enter/esc to an inner
 * {@link SelectList}. The inner list is rebuilt when the filter changes (the
 * palette owns ordering; the SelectList's built-in prefix filter is unused).
 */ export var CommandPalette = /*#__PURE__*/ function() {
    "use strict";
    function CommandPalette(options) {
        _class_call_check(this, CommandPalette);
        _define_property(this, "items", void 0);
        _define_property(this, "onSelectCb", void 0);
        _define_property(this, "onCancelCb", void 0);
        _define_property(this, "query", "");
        _define_property(this, "select", void 0);
        /** Guards against double-fire (Enter then Esc during teardown). */ _define_property(this, "answered", false);
        this.items = options.items;
        this.onSelectCb = options.onSelect;
        this.onCancelCb = options.onCancel;
        this.select = this.buildList();
    }
    _create_class(CommandPalette, [
        {
            key: "currentQuery",
            get: /** The current filter query (test accessor). */ function get() {
                return this.query;
            }
        },
        {
            /** The fuzzy-filtered items for the current query. */ key: "filteredItems",
            value: function filteredItems() {
                return fuzzyFilter(this.items, this.query, function(item) {
                    var _item_keys;
                    return "".concat(item.value, " ").concat(item.label, " ").concat(item.description, " ").concat((_item_keys = item.keys) !== null && _item_keys !== void 0 ? _item_keys : "");
                });
            }
        },
        {
            key: "buildList",
            value: /** Rebuild the inner SelectList from the current fuzzy matches. */ function buildList() {
                var _this = this;
                var matched = this.filteredItems();
                var selectItems = matched.map(function(item) {
                    var _item_keys;
                    return {
                        value: item.value,
                        label: item.label,
                        description: (_item_keys = item.keys) !== null && _item_keys !== void 0 ? _item_keys : item.description
                    };
                });
                var list = new SelectList(selectItems, 8, paletteSelectTheme);
                list.onSelect = function(item) {
                    var _matched_find;
                    if (_this.answered) return;
                    _this.answered = true;
                    var match = (_matched_find = matched.find(function(m) {
                        return m.value === item.value;
                    })) !== null && _matched_find !== void 0 ? _matched_find : item;
                    _this.onSelectCb(match);
                };
                list.onCancel = function() {
                    if (_this.answered) return;
                    _this.answered = true;
                    _this.onCancelCb();
                };
                return list;
            }
        },
        {
            key: "invalidate",
            value: function invalidate() {
                this.select.invalidate();
            }
        },
        {
            /**
   * Route keyboard input: navigation/confirm/cancel -> inner SelectList;
   * printable chars -> append to the query + rebuild; backspace -> truncate +
   * rebuild. Uses the global keybinding registry so user remaps are honoured.
   */ key: "handleInput",
            value: function handleInput(data) {
                var kb = getKeybindings();
                if (kb.matches(data, "tui.select.up") || kb.matches(data, "tui.select.down") || kb.matches(data, "tui.select.pageUp") || kb.matches(data, "tui.select.pageDown") || kb.matches(data, "tui.select.confirm") || kb.matches(data, "tui.select.cancel")) {
                    this.select.handleInput(data);
                    return;
                }
                // Backspace -> truncate the query.
                if (matchesKey(data, "backspace")) {
                    if (this.query.length > 0) {
                        this.query = this.query.slice(0, -1);
                        this.select = this.buildList();
                    }
                    return;
                }
                // Printable ASCII -> append to the query + rebuild.
                if (isPrintable(data)) {
                    this.query += data;
                    this.select = this.buildList();
                }
            // Anything else (multibyte/escape sequences not bound above) is ignored.
            }
        },
        {
            /** Render the palette frame: filter line + list + canonical footer. */ key: "render",
            value: function render(width) {
                var lines = [];
                lines.push("".concat(highlight.base("❯"), " ").concat(this.query.length > 0 ? textToken.base(this.query) : textToken.dim("type to filter…")));
                var _iteratorNormalCompletion = true, _didIteratorError = false, _iteratorError = undefined;
                try {
                    for(var _iterator = this.select.render(width)[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true){
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
                // Canonical overlay footer (scope §3.2) — identical grammar to every overlay.
                lines.push(renderOverlayFooter());
                return lines;
            }
        }
    ]);
    return CommandPalette;
}();
/** True if `data` is a single printable ASCII character (length 1, code ≥ 0x20). */ function isPrintable(data) {
    return data.length === 1 && data.charCodeAt(0) >= 0x20 && data.charCodeAt(0) < 0x7f;
}
