//# hash=24979aec09d600d2e6656354f0e0101d
//# sourceMappingURL=env.js.map

/**
 * .env autoload — dependency-free, CLI-bootstrap only.
 *
 * Reads `<cwd>/.env` if present and exports every KEY=VALUE into
 * process.env WITHOUT overriding variables that are already set (the real
 * environment always wins over the file). Supports comments (#), blank
 * lines, optional `export ` prefix, and single/double-quoted values.
 */ import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
export function loadDotEnv() {
    var cwd = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : process.cwd();
    var file = path.join(cwd, ".env");
    if (!existsSync(file)) return;
    var text;
    try {
        text = readFileSync(file, "utf-8");
    } catch (unused) {
        return; // unreadable .env must not kill the CLI
    }
    var _iteratorNormalCompletion = true, _didIteratorError = false, _iteratorError = undefined;
    try {
        for(var _iterator = text.split("\n")[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true){
            var rawLine = _step.value;
            var line = rawLine.trim();
            if (line === "" || line.startsWith("#")) continue;
            var body = line.startsWith("export ") ? line.slice(7).trimStart() : line;
            var equals = body.indexOf("=");
            if (equals <= 0) continue;
            var key = body.slice(0, equals).trim();
            if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
            var value = body.slice(equals + 1).trim();
            if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
                value = value.slice(1, -1);
            } else if (value.includes(" ")) {
                var _value_split_;
                // Unquoted values: strip trailing ` # comment` text and pasted labels
                // (keys never contain spaces; the first token is the value).
                value = (_value_split_ = value.split(/\s+/)[0]) !== null && _value_split_ !== void 0 ? _value_split_ : "";
            }
            if (process.env[key] === undefined) {
                process.env[key] = value;
            }
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
