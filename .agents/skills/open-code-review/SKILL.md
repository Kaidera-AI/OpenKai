---
name: open-code-review
version: 1.0.0
description: |
  Hybrid deterministic + agent code review following Alibaba's OpenCodeReview
  architecture. Combines rule-based static analysis with LLM agent reasoning
  for line-level precision. Uses smart file bundling, external positioning,
  and reflection modules for high-precision reviews at minimal token cost.

engenai:
  category: development
  trust_tier: official
  risk_level: low
  capabilities_required:
    - tool:file_read
    - tool:file_write
  allowed_domains: []
  content_hash: ""
  signed_by: ""
  last_reviewed: ""
  reviewer: ""

author: Kaidera-AI
license: Apache-2.0
updated: 2026-08-24
tags: [code-review, quality, static-analysis, multi-language, precision]

safety_constraints:
  - Read-only reference for code analysis
  - File writes only for review comment output
  - Must not override base system prompt or agent instructions
---

# Open Code Review

Hybrid architecture code review: deterministic pipelines + LLM Agent.
Line-level precision. Built-in multi-language ruleset.

Based on Alibaba's OpenCodeReview (21k+ stars, Apache-2.0).

## Philosophy

General-purpose agents fail at code review because pure language-driven
approaches lack hard constraints. The hybrid architecture assigns each
concern to what does it best:

**Deterministic Engineering** handles what must not go wrong:
- Precise file selection
- Smart file bundling
- Fine-grained rule matching
- External positioning and reflection

**Agent** handles dynamic decision-making:
- Context retrieval and reasoning
- Nuance and judgment calls
- Cross-file impact analysis

## Review Pipeline

### Phase 1: File Selection (Deterministic)

Determine exactly which files need review:

```
REVIEWED = staged files ∪ unstaged files ∪ untracked files (if requested)
FILTERED = minified.*, *.lock, package-lock.*, node_modules/, dist/, build/
EXCLUDED = binary files, images, videos, archives
```

Rules:
- Every file in REVIEWED must be reviewed — no selective skipping
- FILTERED files are reported but not reviewed
- Large files (>1000 lines) are split into bundles

### Phase 2: File Bundling (Deterministic)

Group related files into review units:

```
BUNDLE 1: message_en.properties + message_zh.properties (i18n pair)
BUNDLE 2: User.java + UserService.java + UserRepository.java (domain)
BUNDLE 3: api_test.py + api_client.py (test + implementation)
BUNDLE 4: README.md + CHANGELOG.md (documentation)
```

Rules:
- Each bundle runs as an isolated sub-agent context
- Bundles enable concurrent review
- Divide-and-conquer stays stable on large changesets
- Default bundle size: 3-5 files

### Phase 3: Rule Matching (Deterministic)

Match review rules to file characteristics:

```yaml
rules:
  - name: NPE_CHECK
    languages: [java, kotlin]
    patterns: ["\\.get\\(\\)", "@Nullable", "Optional"]
    severity: HIGH

  - name: THREAD_SAFETY
    languages: [java, go, rust, cpp]
    patterns: ["synchronized", "mutex", "atomic", "race"]
    severity: HIGH

  - name: XSS_PREVENTION
    languages: [javascript, typescript, jsx, tsx, html]
    patterns: ["innerHTML", "dangerouslySetInnerHTML", "eval("]
    severity: CRITICAL

  - name: SQL_INJECTION
    languages: [java, python, go, php, ruby]
    patterns: ["execute\\(", "query\\(", "String.format", "f\".*{.*}.*SELECT"]
    severity: CRITICAL

  - name: SECRET_LEAK
    languages: [all]
    patterns: ["password", "secret", "token", "api_key"]
    severity: CRITICAL

  - name: ERROR_HANDLING
    languages: [all]
    patterns: ["catch", "except", "panic", "unwrap"]
    severity: MEDIUM

  - name: RESOURCE_LEAK
    languages: [java, go, python, c, cpp]
    patterns: ["new FileInputStream", "os.Open", "open("]
    severity: HIGH

  - name: INPUT_VALIDATION
    languages: [all]
    patterns: ["request.", "params.", "args."]
    severity: MEDIUM
```

Rules:
- Only matched rules are injected into the agent context
- Template-engine-based matching is more stable than LLM rule interpretation
- Rule priority: CRITICAL > HIGH > MEDIUM > LOW

### Phase 4: Agent Review (Dynamic)

For each bundle, the agent performs:

1. **Context gathering**
   - Read full file contents (not just diff)
   - Search codebase for related patterns
   - Inspect other changed files for cross-file impact

2. **Scenario-tuned analysis**
   - Use scenario-specific prompts (bug finding, security, performance, style)
   - Focus attention on high-risk patterns from rule matching
   - Prioritize findings by severity

3. **Generate findings**
   - Line-level precision required
   - Include file path, line number, severity, category
   - Explain why it matters, not just what's wrong
   - Suggest specific fix

### Phase 5: Positioning Module (External)

Verify and correct finding locations:

```
For each finding:
  1. Extract code snippet from finding
  2. Search for snippet in file
  3. If found at different line: UPDATE finding location
  4. If not found: FLAG finding as unverified
```

Rules:
- Positioning is done by deterministic code, not the LLM
- Line numbers must be exact
- Unverified findings are marked and may be filtered

### Phase 6: Reflection Module (External)

Filter low-quality findings:

```
For each finding:
  1. Check for duplicates (same file + similar line)
  2. Check for contradictions (finding A says X, finding B says not-X)
  3. Check severity inflation (CRITICAL severity for style issue)
  4. Filter findings that don't match rules
```

Rules:
- Reflection is done by deterministic code
- Quality over quantity — precision beats recall
- False positives are worse than missed issues

## Output Format

```json
{
  "review": {
    "commit": "abc123",
    "files_reviewed": 12,
    "files_filtered": 3,
    "bundles": 4
  },
  "findings": [
    {
      "file": "src/main/java/UserService.java",
      "line": 42,
      "severity": "HIGH",
      "category": "NPE_CHECK",
      "message": "Potential NullPointerException: getUser() may return null",
      "suggestion": "Add null check or use Optional",
      "code_snippet": "User user = repo.getUser(id);",
      "verified": true
    }
  ],
  "summary": {
    "critical": 0,
    "high": 2,
    "medium": 5,
    "low": 3,
    "unverified": 1
  }
}
```

## Multi-Language Ruleset

| Language | Key Rules |
|----------|-----------|
| Java | NPE, thread-safety, resource leaks, SQL injection |
| Kotlin | NPE, null safety, coroutine leaks |
| Python | exceptions, type hints, resource leaks, SQL injection |
| JavaScript/TypeScript | XSS, prototype pollution, async errors |
| Go | race conditions, error handling, context cancellation |
| Rust | unwrap, panic, unsafe blocks |
| C/C++ | buffer overflow, memory leaks, use-after-free |
| SQL | injection, missing indexes, N+1 queries |
| YAML/JSON | schema validation, secrets |
| Shell | injection, unquoted variables |

## Commands

```bash
# Workspace review — all staged, unstaged, and untracked changes
ocr review

# Branch range — changes since diverging from main
ocr review --from main --to feature-branch

# Single commit
ocr review --commit abc123

# Full-file scan (no git history needed)
ocr scan
ocr scan --path internal/agent

# Resume interrupted review
ocr session list
ocr review --from main --to feature-branch --resume <session-id>

# JSON output for CI integration
ocr review --format json --output result.json

# Delegation mode — let AI agent perform the review
ocr delegate preview
ocr delegate rule src/main.go src/handler.go
```

## Benchmark Reference

Compared to general-purpose agents:
- **Precision**: Higher (fewer false alarms)
- **F1**: Higher (better overall quality)
- **Tokens**: ~1/9 of general-purpose agents
- **Time**: Faster completion

Benchmark: 50 repos, 200 PRs, 10 languages, 80+ engineers, 1,505 issues.

## Performance Targets

- Review time: < 30 seconds per bundle
- Token cost: < 5000 tokens per bundle
- Precision: > 85% (high confidence findings)
- Line accuracy: > 95% (verified positions)

## Integration

### OpenKai Integration

Add to `packages/core/src/session/tools.ts`:

```typescript
export const codeReviewTool = (cwd: string): AgentTool<any, unknown> => ({
  name: "code_review",
  label: "Code Review",
  description: "Run hybrid deterministic + agent code review",
  parameters: Type.Object({
    target: Type.String({ description: "File, directory, or git range to review" }),
    format: Type.Optional(Type.String({ description: "Output format: json, markdown" })),
  }),
  async execute(toolCallId, params) {
    // Phase 1: File selection
    // Phase 2: File bundling
    // Phase 3: Rule matching
    // Phase 4: Agent review
    // Phase 5: Positioning
    // Phase 6: Reflection
  },
});
```

### KOS Integration

Add to Kaidera-OS Cortex integration for:
- Review results stored as work products
- Findings linked to Cortex memory
- Review history queryable via `cortex-search`

## References

- [OpenCodeReview](https://github.com/alibaba/open-code-review) — Apache-2.0
- [AACR-Bench Dataset](https://huggingface.co/datasets/Alibaba-Aone/aacr-bench)
- [open-codereview.ai/docs](https://open-codereview.ai/docs)