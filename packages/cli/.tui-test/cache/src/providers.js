//# hash=7c15d73f3aa78fc8bfe84db281f980fc
//# sourceMappingURL=providers.js.map

/**
 * Provider registry — how OpenKai connects to model providers (pi-ai substrate).
 *
 * The env-var names are pi-ai's conventions (its internal env-api-keys module
 * is not on the package exports map, so the table lives here — the names are
 * stable industry conventions). OAuth subscription lanes carry no raw key.
 */ export var PROVIDERS = {
    openrouter: {
        label: "OpenRouter (aggregator)",
        envKeys: [
            "OPENROUTER_API_KEY"
        ]
    },
    anthropic: {
        label: "Anthropic (Claude)",
        envKeys: [
            "ANTHROPIC_API_KEY",
            "ANTHROPIC_OAUTH_TOKEN",
            "ANTHROPIC_AUTH_TOKEN"
        ]
    },
    openai: {
        label: "OpenAI",
        envKeys: [
            "OPENAI_API_KEY"
        ]
    },
    "openai-codex": {
        label: "OpenAI Codex (subscription)",
        envKeys: [],
        oauth: true
    },
    google: {
        label: "Google (Gemini)",
        envKeys: [
            "GEMINI_API_KEY"
        ]
    },
    "github-copilot": {
        label: "GitHub Copilot (subscription)",
        envKeys: [],
        oauth: true
    },
    deepseek: {
        label: "DeepSeek",
        envKeys: [
            "DEEPSEEK_API_KEY"
        ]
    },
    "kimi-coding": {
        label: "Kimi Code",
        envKeys: [
            "KIMI_API_KEY"
        ]
    },
    moonshotai: {
        label: "Moonshot AI",
        envKeys: [
            "MOONSHOT_API_KEY"
        ]
    },
    "qwen-token-plan": {
        label: "Alibaba Qwen (subscription)",
        envKeys: [
            "QWEN_TOKEN_PLAN_API_KEY"
        ]
    },
    xai: {
        label: "xAI (Grok)",
        envKeys: [
            "XAI_API_KEY"
        ]
    },
    mistral: {
        label: "Mistral",
        envKeys: [
            "MISTRAL_API_KEY"
        ]
    },
    groq: {
        label: "Groq",
        envKeys: [
            "GROQ_API_KEY"
        ]
    },
    cerebras: {
        label: "Cerebras",
        envKeys: [
            "CEREBRAS_API_KEY"
        ]
    },
    together: {
        label: "Together",
        envKeys: [
            "TOGETHER_API_KEY"
        ]
    },
    fireworks: {
        label: "Fireworks",
        envKeys: [
            "FIREWORKS_API_KEY"
        ]
    },
    nvidia: {
        label: "NVIDIA",
        envKeys: [
            "NVIDIA_API_KEY"
        ]
    },
    minimax: {
        label: "MiniMax",
        envKeys: [
            "MINIMAX_API_KEY"
        ]
    },
    zai: {
        label: "Z.ai",
        envKeys: [
            "ZAI_API_KEY"
        ]
    },
    "vercel-ai-gateway": {
        label: "Vercel AI Gateway",
        envKeys: [
            "AI_GATEWAY_API_KEY"
        ]
    }
};
export var DEFAULT_PROVIDER = "openrouter";
/** Resolve the active provider id: flag > env > default. */ export function resolveProvider(flag) {
    var _ref;
    return (_ref = flag !== null && flag !== void 0 ? flag : process.env.OPENKAI_PROVIDER) !== null && _ref !== void 0 ? _ref : DEFAULT_PROVIDER;
}
/** Key/auth status for one provider against the live environment. */ export function providerKeyStatus(provider) {
    var info = PROVIDERS[provider];
    if (!info) {
        // Unknown to our table — pi-ai may still support it; require the
        // conventional <PROVIDER>_API_KEY and say so.
        var conventional = "".concat(provider.replace(/-/g, "_").toUpperCase(), "_API_KEY");
        return {
            provider: provider,
            configured: process.env[conventional] !== undefined,
            needsKey: conventional
        };
    }
    var _iteratorNormalCompletion = true, _didIteratorError = false, _iteratorError = undefined;
    try {
        for(var _iterator = info.envKeys[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true){
            var key = _step.value;
            if (process.env[key] !== undefined) {
                return {
                    provider: provider,
                    configured: true,
                    via: key,
                    oauth: info.oauth
                };
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
    return {
        provider: provider,
        configured: info.oauth === true,
        needsKey: info.envKeys[0],
        oauth: info.oauth
    };
}
