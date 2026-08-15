//# hash=394b651111c277a209d7aebe27c93c69
//# sourceMappingURL=transcript.js.map

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
 * Transcript renderer (scope §4 `transcript.ts`).
 *
 * Holds an ordered list of blocks — user messages, assistant messages,
 * thinking sections, tool cards, btw side-channel blocks, and notices — and
 * renders them to lines. Text deltas append to the current assistant message's
 * Markdown block (re-render block, not screen); thinking deltas buffer into a
 * collapsed-by-default section revealed by the density toggle (Ctrl+O);
 * `tool_call` opens a card, `tool_result` settles it (args summary + result
 * preview, truncated).
 *
 * P4b (scope §1.2 + §1.5) adds:
 *  - **per-agent identity**: the assistant header is a coloured `[AGENT]` pill
 *    ({@link rolePill}) instead of `**Assistant**`, so each persona reads as a
 *    distinct block. The operator stays `**You**`.
 *  - **`/btw` side channel**: a `btw` block renders the side question header +
 *    streams the answer as a **system-marked block** (not a user turn, scope
 *    §1.5). The block kind is `btw`, never `assistant`/`user`.
 *
 * Block model is addressed by {@link SessionEvent} fields: a `delta` carries
 * `field` (`text`|`thinking`) + `partId`; the renderer routes it to the
 * matching part of the live assistant turn. `turn_end` settles the message
 * block; `usage` is handled by the status line, not here.
 */ import { Markdown, Text } from "@earendil-works/pi-tui";
import { highlight, markdownTheme, rolePill, surface, text as textToken, toolBorder } from "./theme.js";
/** One rendered line's max length for previews (kept short for cards). */ var PREVIEW_LEN = 120;
/** Truncate a value to a single-line preview. */ function preview(value) {
    var str = typeof value === "string" ? value : safeStringify(value);
    var oneLine = str.replace(/\n/g, " ");
    return oneLine.length > PREVIEW_LEN ? oneLine.slice(0, PREVIEW_LEN - 1) + "…" : oneLine;
}
/** Safe JSON stringify with a cap. */ function safeStringify(value) {
    try {
        return JSON.stringify(value);
    } catch (unused) {
        return String(value);
    }
}
/** A muted left-border prefix for tool cards (scope §3.1). */ function toolPrefix() {
    return toolBorder("▎ ");
}
/**
 * The transcript. A stateful {@link Component} whose block list is driven by
 * the controller calling {@link Transcript.applyEvent} /
 * {@link Transcript.addUserMessage} / {@link Transcript.replayAssistant}.
 * Wrapped in a ScrollView by the layout root.
 */ export var Transcript = /*#__PURE__*/ function() {
    "use strict";
    function Transcript() {
        var agentName = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : "openkai";
        _class_call_check(this, Transcript);
        _define_property(this, "blocks", []);
        _define_property(this, "liveAssistant", null);
        _define_property(this, "liveThinking", null);
        /** Index of the live btw block (the `/btw` side channel, scope §1.5). */ _define_property(this, "liveBtw", null);
        _define_property(this, "openTools", new Map());
        _define_property(this, "thinkingRevealed", false);
        /** Agent name for the assistant identity pill (scope §1.2). */ _define_property(this, "agentName", void 0);
        this.agentName = agentName;
    }
    _create_class(Transcript, [
        {
            /** Add a user message block at the top of a turn. */ key: "addUserMessage",
            value: function addUserMessage(text) {
                var comp = new Markdown("**You**\n\n".concat(text), 1, 0, markdownTheme);
                this.blocks.push({
                    kind: "user",
                    text: text,
                    comp: comp
                });
            }
        },
        {
            /**
   * Add a local notice block — slash-command output (`/help`, `/sessions`, …).
   * Never sent to the model and never persisted; it is operator-local chrome.
   */ key: "addNotice",
            value: function addNotice(lines) {
                var body = Array.isArray(lines) ? lines.join("\n") : lines;
                var comp = new Text(body.split("\n").map(function(line) {
                    return "".concat(toolBorder("▎ ")).concat(textToken.muted(line));
                }).join("\n"), 1, 0);
                this.blocks.push({
                    kind: "notice",
                    text: body,
                    comp: comp
                });
            }
        },
        {
            /**
   * Open a `/btw` side-channel block (scope §1.5): the question header
   * (amber `⤷ btw:` + muted question) + a streaming answer region. The answer
   * streams here — no `user`/`assistant` block is created, so it never reads
   * as a user turn. Returns immediately; the controller then prompts the model.
   */ key: "beginBtwTurn",
            value: function beginBtwTurn(question) {
                var comp = new Markdown(this.btwBody(question, ""), 1, 0, markdownTheme);
                this.blocks.push({
                    kind: "btw",
                    question: question,
                    text: "",
                    comp: comp
                });
                this.liveBtw = this.blocks.length - 1;
            }
        },
        {
            key: "btwBody",
            value: /** Render a btw block's markdown (header + streaming answer). */ function btwBody(question, text) {
                var header = "".concat(highlight.attention("⤷ btw:"), " ").concat(textToken.muted(question));
                return text.length > 0 ? "".concat(header, "\n\n").concat(text) : header;
            }
        },
        {
            /** Replay a settled assistant message (session resume — no live streaming). */ key: "replayAssistant",
            value: function replayAssistant(text) {
                var comp = new Markdown("".concat(rolePill(this.agentName), "\n\n").concat(text), 1, 0, markdownTheme);
                this.blocks.push({
                    kind: "assistant",
                    text: text,
                    comp: comp
                });
            }
        },
        {
            /** The last assistant block's accumulated text (for persistence at turn_end). */ key: "lastAssistantText",
            value: function lastAssistantText() {
                for(var i = this.blocks.length - 1; i >= 0; i -= 1){
                    var block = this.blocks[i];
                    if (block.kind === "assistant") return block.text;
                }
                return "";
            }
        },
        {
            /** Toggle thinking density (Ctrl+O). Returns the new revealed state. */ key: "toggleThinking",
            value: function toggleThinking() {
                this.thinkingRevealed = !this.thinkingRevealed;
                for(var i = 0; i < this.blocks.length; i += 1){
                    var block = this.blocks[i];
                    if (block.kind === "thinking") {
                        block.revealed = this.thinkingRevealed;
                        this.renderThinking(block);
                    }
                }
                return this.thinkingRevealed;
            }
        },
        {
            /** Apply one {@link SessionEvent} to the block list. */ key: "applyEvent",
            value: function applyEvent(event) {
                switch(event.kind){
                    case "connected":
                        // A new turn is starting — but in btw mode the btw block already
                        // exists and is the streaming target, so do not open an assistant turn.
                        if (this.liveBtw === null) this.beginAssistantTurn();
                        break;
                    case "delta":
                        {
                            var _event_delta, _event_delta1;
                            if (event.field === "text") this.appendText((_event_delta = event.delta) !== null && _event_delta !== void 0 ? _event_delta : "");
                            else if (event.field === "thinking") this.appendThinking((_event_delta1 = event.delta) !== null && _event_delta1 !== void 0 ? _event_delta1 : "");
                            break;
                        }
                    case "tool_call":
                        var _event_toolCallId, _event_toolName;
                        this.openTool((_event_toolCallId = event.toolCallId) !== null && _event_toolCallId !== void 0 ? _event_toolCallId : "?", (_event_toolName = event.toolName) !== null && _event_toolName !== void 0 ? _event_toolName : "?", event.args);
                        break;
                    case "tool_result":
                        var _event_toolCallId1, _event_isError;
                        this.settleTool((_event_toolCallId1 = event.toolCallId) !== null && _event_toolCallId1 !== void 0 ? _event_toolCallId1 : "?", event.result, (_event_isError = event.isError) !== null && _event_isError !== void 0 ? _event_isError : false);
                        break;
                    case "turn_end":
                        this.liveAssistant = null;
                        this.liveThinking = null;
                        this.liveBtw = null;
                        break;
                    case "session_end":
                        this.liveAssistant = null;
                        this.liveThinking = null;
                        this.liveBtw = null;
                        break;
                    default:
                        break;
                }
            }
        },
        {
            key: "beginAssistantTurn",
            value: /** Begin a new assistant turn block (called on `connected`, unless btw). */ function beginAssistantTurn() {
                var thinkComp = new Text(this.thinkingLine(""), 1, 0);
                var thinkBlock = {
                    kind: "thinking",
                    text: "",
                    revealed: this.thinkingRevealed,
                    comp: thinkComp
                };
                this.blocks.push(thinkBlock);
                this.liveThinking = this.blocks.length - 1;
                var comp = new Markdown("", 1, 0, markdownTheme);
                var block = {
                    kind: "assistant",
                    text: "",
                    comp: comp
                };
                this.blocks.push(block);
                this.liveAssistant = this.blocks.length - 1;
            }
        },
        {
            key: "appendText",
            value: /** Append a text delta to the live block (btw side channel or assistant). */ function appendText(delta) {
                if (this.liveBtw !== null) {
                    var block = this.blocks[this.liveBtw];
                    if (block.kind !== "btw") return;
                    block.text += delta;
                    block.comp.setText(this.btwBody(block.question, block.text));
                    return;
                }
                if (this.liveAssistant === null) this.beginAssistantTurn();
                var block1 = this.blocks[this.liveAssistant];
                if (block1.kind !== "assistant") return;
                block1.text += delta;
                block1.comp.setText(block1.text.length > 0 ? "".concat(rolePill(this.agentName), "\n\n").concat(block1.text) : "");
            }
        },
        {
            key: "appendThinking",
            value: /** Append a thinking delta to the live thinking block (suppressed in btw mode). */ function appendThinking(delta) {
                if (this.liveBtw !== null) return; // keep the btw block clean (no thinking)
                if (this.liveThinking === null) this.beginAssistantTurn();
                var block = this.blocks[this.liveThinking];
                if (block.kind !== "thinking") return;
                block.text += delta;
                this.renderThinking(block);
            }
        },
        {
            key: "renderThinking",
            value: /** Render a thinking block — collapsed preview or full revealed text. */ function renderThinking(block) {
                if (block.revealed) {
                    block.comp.setText("".concat(textToken.muted("thinking"), "\n").concat(block.text));
                } else {
                    block.comp.setText(this.thinkingLine(block.text));
                }
            }
        },
        {
            key: "thinkingLine",
            value: /** The collapsed thinking preview line (hidden by default, scope §3.3). */ function thinkingLine(text) {
                if (text.length === 0) return textToken.dim("⤷ thinking…");
                return textToken.dim("⤷ thinking… ".concat(text.length, " chars (Ctrl+O to reveal)"));
            }
        },
        {
            key: "openTool",
            value: /** Open a tool card (muted left-border). */ function openTool(toolCallId, toolName, args) {
                var comp = new Text(this.renderToolCard(toolName, args, null, false), 1, 0);
                var block = {
                    kind: "tool",
                    toolCallId: toolCallId,
                    toolName: toolName,
                    args: args,
                    result: null,
                    isError: false,
                    settled: false,
                    comp: comp
                };
                this.blocks.push(block);
                this.openTools.set(toolCallId, this.blocks.length - 1);
            }
        },
        {
            key: "settleTool",
            value: /** Settle a tool card with its result. */ function settleTool(toolCallId, result, isError) {
                var index = this.openTools.get(toolCallId);
                if (index === undefined) return;
                var block = this.blocks[index];
                if (block.kind !== "tool") return;
                block.result = result;
                block.isError = isError;
                block.settled = true;
                block.comp.setText(this.renderToolCard(block.toolName, block.args, result, isError));
                this.openTools.delete(toolCallId);
            }
        },
        {
            key: "renderToolCard",
            value: /** Render a tool card line — muted left-border, args summary + result preview. */ function renderToolCard(toolName, args, result, isError) {
                var head = "".concat(toolPrefix()).concat(textToken.strong("tool"), " ").concat(highlight.base(toolName));
                var argsLine = "".concat(toolPrefix(), "  ").concat(textToken.muted("args:"), " ").concat(preview(args));
                if (result === null) {
                    return "".concat(head, "\n").concat(argsLine, "\n").concat(toolPrefix(), "  ").concat(highlight.base("◌ running…"));
                }
                var status = isError ? highlight.danger("✗ error") : highlight.base("✓ ok");
                var resultLine = "".concat(toolPrefix(), "  ").concat(textToken.muted("result:"), " ").concat(status, " ").concat(preview(result));
                return "".concat(head, "\n").concat(argsLine, "\n").concat(resultLine);
            }
        },
        {
            // ── Component ───────────────────────────────────────────────────────────
            key: "render",
            value: function render(width) {
                var lines = [];
                var _iteratorNormalCompletion = true, _didIteratorError = false, _iteratorError = undefined;
                try {
                    for(var _iterator = this.blocks[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true){
                        var block = _step.value;
                        var rendered = block.comp.render(width);
                        if (block.kind === "assistant" || block.kind === "btw") {
                            var _iteratorNormalCompletion1 = true, _didIteratorError1 = false, _iteratorError1 = undefined;
                            try {
                                for(var _iterator1 = rendered[Symbol.iterator](), _step1; !(_iteratorNormalCompletion1 = (_step1 = _iterator1.next()).done); _iteratorNormalCompletion1 = true){
                                    var line = _step1.value;
                                    lines.push(surface["2"](line));
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
                        } else {
                            var _iteratorNormalCompletion2 = true, _didIteratorError2 = false, _iteratorError2 = undefined;
                            try {
                                for(var _iterator2 = rendered[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true){
                                    var line1 = _step2.value;
                                    lines.push(line1);
                                }
                            } catch (err) {
                                _didIteratorError2 = true;
                                _iteratorError2 = err;
                            } finally{
                                try {
                                    if (!_iteratorNormalCompletion2 && _iterator2.return != null) {
                                        _iterator2.return();
                                    }
                                } finally{
                                    if (_didIteratorError2) {
                                        throw _iteratorError2;
                                    }
                                }
                            }
                        }
                        lines.push("");
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
                return lines;
            }
        },
        {
            key: "invalidate",
            value: function invalidate() {
                var _iteratorNormalCompletion = true, _didIteratorError = false, _iteratorError = undefined;
                try {
                    for(var _iterator = this.blocks[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true){
                        var block = _step.value;
                        block.comp.invalidate();
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
            }
        },
        {
            /** Test accessor: block kinds in order (for event-mapping assertions). */ key: "blockKinds",
            value: function blockKinds() {
                return this.blocks.map(function(b) {
                    return b.kind;
                });
            }
        }
    ]);
    return Transcript;
}();
