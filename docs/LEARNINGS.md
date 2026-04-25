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

### Bun's `globalThis.fetch` has a non-standard `preconnect` property
Typing a fetch-injector param as `typeof globalThis.fetch` breaks test mocks that don't implement `preconnect`. Use a narrower signature: `(url: string, init?: RequestInit) => Promise<Response>`.
— Found: commit `76dcdda`.

### macOS ships bash 3.2 with no `mapfile`
Scripts using `mapfile -t arr < <(cmd)` work on Linux CI but silently fail locally on a fresh Mac. Use a portable `while IFS= read -r line; do ... done` loop if you need the script to run in both places.
— Found: `scripts/check-pages-allowlist.sh` in the Pages-split work.

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

---

## CI / deployment

### GitHub Pages default serves every file on the branch
With Source = "Deploy from a branch → main / root", every `.ts`, `.json`, and config file at repo root is fetchable at `https://<host>/<path>`. Fix: move Pages source to GitHub Actions + an isolated output directory (`site/`), add an allowlist guard script, and do the one-time Settings change. The MCP server sources are now NOT reachable at `dam.usefulto.me`.
— See: spec §5.8, `.github/workflows/pages.yml`, `scripts/check-pages-allowlist.sh`.

### `set -euo pipefail` + `grep -q` inside a pipeline = false failure
`grep -q` exits 0 as soon as it matches, which closes the pipe. `tee` / `node` upstream then exit with SIGPIPE (non-zero). Under `pipefail`, the whole step fails even though the expected data arrived. Fixes: (a) capture stdout into a variable with command substitution, then grep independently; (b) use `grep -c … > /dev/null` which reads all stdin.
— Found: CI run `24943083770`. Fixed in commit `d276a54` by delegating to `scripts/phase1-smoke.sh`.

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
