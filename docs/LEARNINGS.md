# Project Learnings

A running log of non-obvious findings from building and shipping this repo. Each entry is something that would have cost the next engineer (human or agent) time to rediscover from code or git alone — environment quirks, tooling gotchas, real-world data surprises, process decisions.

**This file outlives individual sessions.** Append new entries as they come up. Keep them terse: what happened, why it mattered, what to do next time. Link to the commit that codified the fix.

**Not for:**
- Architecture or module responsibilities (see the spec / file headers).
- Task-level history (see `docs/superpowers/plans/`).
- Decisions already captured in commit messages alone (those are discoverable via `git log`).

---

## Toolchain

### Bun 1.3+ uses text lockfiles
`bun install` writes `bun.lock` (text), not `bun.lockb` (binary). Early plan versions referenced `bun.lockb`. If a future tooling upgrade changes this again, grep the plan and CI for the current filename before merging.
— Found: commit `1b125ec`. Plan patched in `ab56ea7`.

### ESLint 9 rejects `no-console: ["error", { allow: [] }]`
The empty-`allow` form was valid in ESLint 8. In ESLint 9 it throws a schema error. Use `"no-console": "error"` (or a non-empty allow list).
— Found: commit `b13226e`. Plan patched in `765f901`.

### `no-unused-vars` ignore patterns are separate per binding kind
`argsIgnorePattern: "^_"` only covers function parameters. Destructured locals (`const { type: _t, ...rest } = x`) need `varsIgnorePattern: "^_"` *and* `destructuredArrayIgnorePattern: "^_"`. Set all three in the ESLint config if you use any of them.
— Found: commit `bebb746`.

### `tsc --noEmit` exits 2 with TS18003 on empty input sets
When `include` globs match zero files, TypeScript reports `TS18003: No inputs were found` and exits non-zero. The fix is *not* a placeholder stub — it's to treat the failure as an accepted transient state until the first real source file lands. Document the expectation in the plan; otherwise implementers invent junk files.
— Found: commit `ab56ea7`.

### `exactOptionalPropertyTypes: true` rejects explicit `undefined`
With this flag, `{ foo: undefined }` is a type error for a `foo?: T` field — the field must be absent, not present-but-undefined. Spread conditionally when building optional output: `...(x !== undefined ? { foo: x } : {})`. Do not widen `foo` to `T | undefined` just to make this go away; it changes the contract.

### `noPropertyAccessFromIndexSignature` forces bracket notation
On any type with an index signature (or `Record<string, T>`), dot access (`obj.foo`) is rejected; use `obj["foo"]`. This bites tests that mock event payloads and guards that walk `JSON.parse` output.
— Seen across: commits `a2b7459`, `76dcdda`.

### `@typescript-eslint/require-await` rejects `async` without `await`
An `async` function with no `await` in its body fails lint under strict rules. Two fixes: add a meaningful `await`, or drop `async` and return `Promise.resolve(...)` / `Promise.reject(...)` directly. The latter is correct when the function is synchronous but declared Promise-returning for interface parity.
— Seen across: commits `76dcdda`, `4c57e62`.

### `bun:test`'s `.rejects.toMatchObject()` trips `@typescript-eslint/no-confusing-void-expression`
The chain `await expect(promise).rejects.toMatchObject({code: "X"})` is typed as returning `void` by `bun:test`'s type shims. Strict-type-checked rules reject using the result of a void expression. Rewrite as explicit try/catch with `expect(caught).toMatchObject(...)`. Same semantic coverage, lint-clean.
— Adopted across all five tool tests in phase 1 (commits `76fbe8b` through `f7d9d49`).

### Bun's `globalThis.fetch` has a non-standard `preconnect` property
Typing a fetch-injector param as `typeof globalThis.fetch` breaks test mocks that don't implement `preconnect`. Use a narrower signature: `(url: string, init?: RequestInit) => Promise<Response>`.
— Found: commit `76dcdda`.

### macOS ships bash 3.2 with no `mapfile`
Scripts using `mapfile -t arr < <(cmd)` work on Linux CI but silently fail locally on a fresh Mac. Use a portable `while IFS= read -r line; do ... done` loop if you need the script to run in both places.
— Found: `scripts/check-pages-allowlist.sh` in the Pages-split work.

### `@typescript-eslint/unbound-method` flags destructured Node stdlib functions
`const { resolve } = await import("node:path")` trips the rule because `resolve` is typed as a method. The whole module has no `this`, but ESLint can't know that. Two fixes: (a) use a namespace import (`const nodePath = await import("node:path")` then `nodePath.resolve(...)`), or (b) type-annotate the callsite. Namespace is cleaner and survives re-exports.
— Found: commit `b51cc3e` in phase 2 while wiring the cache root in `main()`.

### `@typescript-eslint/no-unnecessary-condition` rejects exhaustive `if` chains
After `if (mode === "url")` and `if (mode === "path")` return, a trailing `if (mode === "bytes")` is flagged — TS narrows `mode` to the single remaining literal, so the condition is always true. Drop the guard and add a comment naming the narrowing by elimination, or restructure as a `switch (mode)` with an exhaustiveness-checking `never` default.
— Found: commit `61e058d` in phase 2.

### `.claude/settings.json` gets auto-created by Claude Code and sneaks in via `git add -A`
The Claude Code harness writes `.claude/settings.json` when the user approves permissions. If `.claude/` isn't in `.gitignore`, a `git add -A` (or `git add --all` from an agent prompt) commits local personal settings. Add `.claude/` to `.gitignore` on day one.
— Found: commit `e89889c` in phase 2 (caught by `git status` after a `git add -A` in the smoke-script rename commit).

---

## MCP SDK

### The SDK pins zod as a direct dep with a narrow range
`@modelcontextprotocol/sdk@1.x` declares `zod: "^3.25 || ^4.0"` as a peer. A downstream `"zod": "^3.23.0"` installs successfully but puts the declared floor below the SDK's contract. Match the SDK's floor.
— Found: commit `ef424b1`.

### Tool output is wrapped as JSON-encoded text on the wire
An MCP `tools/call` response puts `JSON.stringify(result)` into `content[0].text`. On the stdio wire that JSON lives inside an outer JSON-RPC envelope, so the inner JSON's double-quotes are escaped: a tool returning `{ "brands": [...] }` appears in the raw bytes as `\"brands\"`. Smoke scripts that grep for `"brands"` (with quotes) miss; grep for `brands` (unquoted) or parse the envelope.
— Found: commit `a33311a`.

---

## Data shape surprises

### Product-icon entries in the manifest omit `type`, `co_branded`, and `use_cases`
Every brand-logo entry has these fields; every product-icon entry does not. Task 6 declared all three as required on `ManifestLogo` and every test with brand-logo fixtures passed — the real bundled data was simply missing them at runtime. `toAssetSummary` is the single source of truth for defaulting them (`type = "product-icon"` when `brand.id === "product-icons"`, else `"logo"`; `co_branded = false`; `use_cases = []`). Regression tests in `test/manifest/summary.test.ts` lock this in.
— Found: commit `bebb746`.

**General rule:** a type file and a JSON fixture both asserting "this shape matches" proves nothing if the fixture is synthetic. For every manifest-shape assertion, exercise it against `src/bundled/manifest.json`, not a handwritten minimal.

### Product-icon `use_cases` is empty across all 90 entries
The scoring rule gives +1 for a query token matching a `use_case` substring, but every product-icon entry in the bundled manifest ships with `use_cases: []` (or the field absent — defaulted to `[]` by `toAssetSummary`). The use-case band therefore contributes 0 to every product-icon search result, only brand-logo queries benefit. Not a code bug — it's a data gap. Before tuning phase 2's scoring weights, either (a) enrich the manifest with real `use_cases` for product icons, or (b) drop the band for this brand entirely.
— Surfaced while running `bun run try` on 2026-04-25.

### "Data Cloud" rebrand to "Data 360" — name updated, URL slug retained
The manifest carries the new display name, but the `Data-Cloud-*` path fragments and URL slug still use the old name. The ID `icon-data-cloud` is stable on purpose. Consumers who grep the URL for "data 360" will miss. Rule: `name` is authoritative for display, `keywords` cover both names, URLs retain the original slug.
— Surfaced during 2026-04-25 Claude Desktop dog-food session.

### No standalone Slack mark for dark surfaces
Every dark-background Slack asset in the manifest is a co-branded "Slack from Salesforce" lockup. A request for "Slack logo on a dark slide" gets co-brand by default. Either add a sanctioned standalone Slack knockout to the manifest, or make `find_brand_logo` annotate results when only co-brand options exist for the requested background.
— Surfaced during 2026-04-25 Claude Desktop dog-food session.

### Agentforce — one icon, sub-products differentiate via accent color only
The manifest has a single `icon-agentforce`. "Agentforce Sales" / "Agentforce Service" do not get dedicated icons — by design they share the parent mark with an accent-color tint (Sales = `#06A59A`, Service family = `#D4145A`). Tool descriptions don't say this, so sub-product queries silently return the generic mark with no explanation. Future tool descriptions should name this explicitly.
— Surfaced during 2026-04-25 Claude Desktop dog-food session.

---

## CI / deployment

### GitHub Pages default serves every file on the branch
With Source = "Deploy from a branch → main / root", every `.ts`, `.json`, and config file at repo root is fetchable at `https://<host>/<path>`. Fix: move Pages source to GitHub Actions + an isolated output directory (`site/`), add an allowlist guard script, and do the one-time Settings change. The MCP server sources are now NOT reachable at `dam.usefulto.me`.
— See: spec §5.8, `.github/workflows/pages.yml`, `scripts/check-pages-allowlist.sh`.

### `set -euo pipefail` + `grep -q` inside a pipeline = false failure
`grep -q` exits 0 as soon as it matches, which closes the pipe. `tee` / `node` upstream then exit with SIGPIPE (non-zero). Under `pipefail`, the whole step fails even though the expected data arrived. Fixes: (a) capture stdout into a variable with command substitution, then grep independently; (b) use `grep -c … > /dev/null` which reads all stdin.
— Found: CI run `24943083770`. Fixed in commit `d276a54` by delegating to `scripts/phase1-smoke.sh`.

---

## Dog-food findings (2026-04-25 Claude Desktop session)

Full transcript preserved at `docs/dogfood/2026-04-25-claude-desktop-transcript.md`. Data-gap findings (Data Cloud rename, Slack dark-surface, Agentforce sub-products) live under "Data shape surprises" above. The YAGNI decision on `target_width`/`target_height` is captured authoritatively in `docs/superpowers/specs/2026-04-25-phase-2-scope-revision.md`. The remaining durable findings:

### `fetch_asset` gap → users get `curl` commands, not downloads
Prompt 6 ("Download the Agentforce icon to my Desktop") did the obvious thing — the LLM handed back a URL plus a `curl` invocation. Reasonable fallback, but it is phase 2's single biggest ergonomic gap. Acceptance bar for `fetch_asset`: the same prompt produces a file the user can open, not a command they have to run.

### Tool descriptions' brand enumerations prevent hallucinated URLs
Prompt 8 ("Acme Corp logo"). The LLM said the library only carries the six real brands, did not call a tool with `{brand: "acme"}` to trigger `UnknownBrand`, did not hallucinate a URL. Worth preserving when tool descriptions are rewritten for phase 2 — don't drop the explicit brand lists.

---

## Process

### Batch closely-related TDD tasks, not unrelated ones
Batching Tasks 10–13 (four observability modules, spec §5.3), 15–17 (summary + tokenize + score), and 19–23 (five tools) each into a single implementer dispatch saved 8–12 subagent round-trips without losing review rigor. The Tasks 19–23 batch uncovered the product-icon missing-fields bug precisely because the implementer touched all five tools in one pass and noticed the inconsistent output shape.

**What makes a good batch:**
- All tasks are spec-complete (no design decisions left).
- Modules are independent or have strict one-way dependencies (later tasks consume earlier ones in the same batch).
- Each module is ≤ ~100 LOC of implementation.

**What doesn't batch:**
- Tasks that require design judgment (e.g. Task 24, the MCP dispatcher, did not batch).
- Tasks with unclear contracts.

### Patching the plan during execution is legitimate
Four plan patches landed during phase 1 execution, each triggered by a real discovery (Bun lockfile format, zod peer range, TS18003 transient, ESLint `no-console` schema, ESLint unused-vars pattern). Patch in the same commit or an adjacent commit so future replays of the plan produce the working form. The commit message should explain the "why" for the future reader.
— See commits `ab56ea7`, `ef424b1`, `765f901`, `bebb746`.

### Self-review that catches real issues beats theater
Two effective self-review moments:
- Task 17 score test math: my original plan expected `scoreLogo(base, ["agentforce"]) === 3`; the implementation produces 5 (`kw:3 + name:2`). Caught by re-reading my own test before writing the plan — would have been a red test with a wrong "right answer".
- The `rejects.toMatchObject` → try/catch pivot in the five-tool batch: the implementer noticed the strict-type-checked ESLint rules mark `.rejects.toMatchObject(...)` as returning `void` (triggers `no-confusing-void-expression`) and rewrote every error-assertion test to explicit try/catch. Spec compliance preserved; lint passes.

### Keep `dist/` out of git and out of PRs
`dist/` is built on demand; shipping it would bloat diffs and desync over time. CI, the e2e test, and `phase1:smoke` all build before asserting. Never commit `dist/`. `.gitignore` covers it; `files: ["bin/", "dist/", …]` in `package.json` ships it at publish time only.

### Revise the spec when dog-food data contradicts it — don't just implement the spec anyway
Phase 2's original spec called for server-side `target_width`/`target_height` dimension computation. The phase-1 dog-food session showed the LLM doing that math correctly unaided. Rather than build the feature and carry the complexity, the phase-2 spec was revised (see `docs/superpowers/specs/2026-04-25-phase-2-scope-revision.md`) to drop those params entirely; if real usage later shows the LLM getting dimensions wrong, revisit.

This only works when the original spec is explicit enough that "did we build what the spec says" and "did the spec reflect reality" are separable questions. YAGNI applies to spec items too, not just code — but the discipline is to *amend the spec in writing*, not silently skip a section.
— Process adopted 2026-04-25 across the phase-2 scope revision and plan.

---

## How to add to this file

When something here would have saved you an hour:

1. Append a new entry under the most appropriate section (or create a new section if nothing fits).
2. Lead with a one-line title that could stand alone in a search.
3. Explain the *why* and the *what-to-do*, not just the symptom.
4. Link to the commit that implements the fix if there is one.
5. Keep it short. If a learning needs more than ~10 lines, it's probably a doc / comment / spec issue — fix it there instead.

Do not:
- Record things derivable from reading the current code.
- Copy-paste commit messages (the `git log` is already there).
- Keep entries that are no longer true — delete or correct them when the toolchain moves.
