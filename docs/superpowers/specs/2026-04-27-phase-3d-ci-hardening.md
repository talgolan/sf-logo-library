# Phase 3D — CI hardening

**Date:** 2026-04-27
**Supersedes:** nothing. **Extends:** original design ([`2026-04-24-sf-logos-mcp-design.md`](2026-04-24-sf-logos-mcp-design.md)) §5.4.7 ("CI expectations") and §5.4.4 ("Coverage gates").
**Depends on:** phase 3B (tarball + publish workflow exists), phase 3C (docs + headers + TSDoc exist for `docs:check` to verify).
**Authoritative for:** the full CI gate defined in the original spec. Advisory symmetry (phase 3E) is out of scope.

---

## TL;DR

Extend today's 7-step CI workflow (lint, typecheck, build, test, smoke, try:check, plus Pages allowlist) into the full 9-step gate from spec §5.4.7: add a **Node-on-compiled-dist** parity run, an **error-code coverage** lint, a **public-API coverage** lint, a **CLI smoke test** that hits `bin/sf-logos-mcp` over stdio, and a **docs freshness** check that verifies headers, TSDoc, tool-description length, and that `docs/tools.md` matches `src/tools/*.ts`. All implemented as `scripts/*.ts` run via Bun, wired into `package.json` scripts, then called from CI. Coverage gates from §5.4.4 (line ≥ 90%, branch ≥ 85%, per-file floor 70%, error-code 100%, public-API 100%) are enforced.

## Motivation

Today's CI ([.github/workflows/ci.yml](../../../.github/workflows/ci.yml)) runs:

1. `bun install --frozen-lockfile`
2. `bun run lint`
3. `bun run typecheck`
4. `bun run build`
5. `bun test --coverage`
6. `bun run phase2:smoke`
7. `bun run try:check`

The original spec §5.4.7 called for nine steps. Two are missing (Node parity, docs check); three (error-code coverage, public-API coverage, CLI smoke) were folded into nonexistent scripts. Gaps this has produced already:

- **Node parity is not verified.** We ship a package that must run on Node ≥ 20, but CI only exercises `dist/` via `bun test`. A Node-only runtime bug (ESM resolution, top-level await, a `Bun.*` shim leaking into `dist/`) would ship undetected. Phase 3B's post-publish smoke catches it *after* a release; a pre-merge gate catches it *before*.
- **Error-code regressions can land silently.** Adding a new `SfLogosError` code without a test is allowed by current CI. The phase-3A `DestinationExists` code was test-covered by discipline, not gate.
- **Public-API regressions can land silently.** Renaming or removing an exported symbol breaks callers; today nothing enforces that every export has at least one test importing it.
- **`bin/sf-logos-mcp` is never launched in CI.** The smoke scripts import `dist/server.ts` directly or use Bun to run TypeScript. The actual shim that end users run via `npx` is exercised only by post-publish human smoke. Regression surface.
- **Docs can drift immediately.** Phase 3C writes docs by hand. Without `docs:check`, the moment a tool description changes and the docs don't, nothing yells.

A tightened CI gate is cheap insurance against a class of bugs that are expensive to catch in production (a published release with a broken `bin/` or missing TSDoc on a new export is remediated with a patch release, a deprecation notice, or both).

## Non-goals

- **No multi-OS matrix.** Ubuntu only in this phase. macOS / Windows are nice-to-have; cost exceeds benefit until a user reports an OS-specific bug. Revisit with data.
- **No multi-Node matrix.** Node 22 only (the version `actions/setup-node@v6` defaults us to). Node 20 LTS is the `engines.node` floor; we trust `tsc`'s target + the test suite to catch 20 vs 22 differences. Revisit if we see a bug.
- **No auto-generated tool reference as hard gate yet.** Phase 3C writes `docs/tools.md` by hand. Phase 3D's `docs:check` validates structure and cross-references but does not regenerate sections. A future phase may add generation when drift shows up.
- **No network-dependent CI.** The live manifest at `dam.usefulto.me` is never fetched in CI — bundled manifest only. A future phase-3F or phase-4 may add a scheduled "live manifest still matches bundled" job, but that's flakiness we don't want on PR paths.
- **No flaky-test quarantine.** Per spec §5.4.7: failing tests block merge; they are never marked flaky. Honored.
- **No coverage upload to a third-party service (Codecov, etc.).** Coverage runs in CI, artifact is attached to the workflow run. Fetching a UI is out of scope.
- **No "changed-files-only" CI shortcut.** Every PR runs the full gate. CI cost is trivial at this scale; partial-gate discipline costs more in subtle-bug hours than it saves.

## Design decisions

| # | Question | Decision |
|---|---|---|
| Q1 | Where does `test:node` run? | Against `dist/` compiled by `bun run build`. Tests live as `.test.ts` files; the build emits `.test.js` under `dist/test/`. `node --test dist/test/**/*.test.js`. |
| Q2 | Error-code coverage implementation | AST scan of `src/` for every `new SfLogosError("<Code>"...)`. Cross-reference with `test/**/*.ts` for any reference to the same string literal or `code: "<Code>"`. Missing intersection = fail. |
| Q3 | Public-API coverage implementation | AST scan of `src/**/*.ts` for `export` declarations. Cross-reference with `test/**/*.ts` for `import` of the symbol name. Missing intersection = fail. Re-exports count as the canonical export. |
| Q4 | CLI smoke implementation | Spawn `bin/sf-logos-mcp` via `node`, send a `tools/list` JSON-RPC request over stdin, parse response from stdout with a 10-second timeout, assert 6 tool names. |
| Q5 | docs:check scope | Four sub-checks. (a) every `src/**/*.ts` has the §5.7 file header. (b) every exported symbol has a TSDoc block. (c) every `src/tools/*.ts` exports a `description` ≥ 200 chars. (d) `docs/tools.md` has an H2 section for every tool and no extra H2s. |
| Q6 | Coverage enforcement | `bun test --coverage` prints a summary; the new `scripts/coverage-gate.ts` parses `bun test`'s coverage JSON output (via `--coverage-reporter=lcov` or equivalent) and fails if totals fall below §5.4.4 thresholds. |
| Q7 | Per-file coverage floor | 70% line coverage on every `src/**/*.ts` except explicit exemptions (`src/bundled/version.ts` generated, `src/cli/diagnostics.ts` handler). Exemptions live in a checked-in allowlist at `scripts/coverage-exempt.txt`. |
| Q8 | CI step ordering | Cheap → expensive. Lint first (catches style), typecheck second, build third (gate for all downstream), unit tests next, then the integration-ish steps (smoke, try:check, cli, node-parity), then the slow gates last (coverage, public-api, error-code, docs). First failure stops the job. |
| Q9 | What to do when `node --test dist/test/` disagrees with `bun test` | Block merge. Investigate both. Do not suppress one runner's failure. The whole point of parity is to catch that disagreement. |
| Q10 | Scripts implementation language | TypeScript, run via Bun. `scripts/*.ts` already exists for `try-mcp.ts`; keep the convention. CI installs Bun anyway. |
| Q11 | Script shape | Each script exits 0 on pass, 1 on fail. Prints a machine-readable summary line at the end for future log parsing. No JSON-only output; humans read CI logs too. |
| Q12 | Pages allowlist check | Already exists as `scripts/check-pages-allowlist.sh`; add as an explicit CI step. Not new; surfaces a script that's currently invoked only locally. |

## Acceptance criteria

1. `.github/workflows/ci.yml` runs 9+ explicit steps matching the spec §5.4.7 expectation, plus the Pages allowlist check.
2. Every CI step has a script invocation in `package.json` — no inline `node` / `find` invocations in the workflow YAML (`uses:` steps excepted).
3. On `main`, all gates green.
4. Adding a new `SfLogosError` code without a test fails `test:error-codes`.
5. Adding a new `export` in `src/` without a test import fails `test:public-api`.
6. Removing a file header from any `src/**/*.ts` fails `docs:check`.
7. Changing a tool `description` to under 200 chars fails `docs:check`.
8. Deleting the corresponding section from `docs/tools.md` fails `docs:check`.
9. Introducing a top-level-await or a `Bun.*` call in `src/` that works under `bun test` but fails under `node --test dist/` is caught by `test:node`.
10. `bin/sf-logos-mcp` responds to a `tools/list` request via `test:cli`.
11. Coverage drop on any file below 70% lines blocks merge, even if total coverage is above 90%.
12. All phase-3A, 3B, and 3C gates continue to pass: `bun run typecheck`, `bun run lint`, `bun test` (125), `bun run try:check` (29), `bun run phase2:smoke` (7), `bun run build`, the full publish dry-run chain.

## New scripts

All written in TypeScript, run via Bun. One file per responsibility.

### `scripts/test-error-codes.ts`

Purpose: assert every `SfLogosError` code in `src/` has at least one test referencing it.

Approach:

1. Walk `src/errors.ts` and extract the union members of `SfLogosErrorCode` (literal string types). Source of truth.
2. Walk `src/**/*.ts` and collect every `new SfLogosError("<Code>"` instantiation's first argument. Cross-reference with (1); unused union members emit a warning (not a hard fail — forward-declared codes are allowed).
3. Walk `test/**/*.ts` and collect every string literal matching a member of (1). Lenient match: direct `"<Code>"` or `code: "<Code>"` both count.
4. Set-difference: codes in (1) not in (3) → fail with a list.
5. Print: `[test:error-codes] OK  codes=7  covered=7` or `FAIL  codes=7  covered=6  missing=["NewCode"]`.

No AST library dependency — regex + file read. Accept false positives in a way that fails safe (a string literal matching a code name counts as coverage; worst case a test claims coverage it doesn't have, but the test won't exist by accident).

### `scripts/test-public-api.ts`

Purpose: assert every exported symbol in `src/**/*.ts` is imported by at least one test.

Approach:

1. Walk `src/**/*.ts`. Regex-extract `export (async )?(function|class|const|let|type|interface|enum) <Name>` and `export { <Name>, ... }` forms. Collect `(filepath, symbolName)`.
2. Walk `test/**/*.ts`. Regex-extract `import ... from "<path>"` with destructuring; track imported names per source file.
3. Path-normalize `src/foo/bar.ts` imports to match `from "../../src/foo/bar.js"` (ESM) in test files.
4. Set-difference per file: exports not imported → fail with list.
5. Print summary.

Exemptions: an allowlist at `scripts/public-api-exempt.txt` for legitimate unreachable exports (generated types, types intended only for downstream consumers). Empty at start.

Known limitation: re-exports via `export * from "./x.js"` are treated as canonical exports of both files; the checker prefers the originating file. This is good enough for today's shape; revisit if we start using barrel files.

### `scripts/test-cli.ts`

Purpose: spawn `bin/sf-logos-mcp` as end users will via `node`, send one JSON-RPC request, assert response.

Approach:

1. `spawn("node", ["bin/sf-logos-mcp"], { stdio: ["pipe", "pipe", "pipe"] })`.
2. Write `{"jsonrpc":"2.0","id":1,"method":"tools/list"}\n` to stdin (plus headers if the SDK requires LSP-style framing; check SDK behavior during plan execution).
3. Read stdout with a 10-second timeout.
4. Parse JSON-RPC response. Assert `result.tools` is an array of length 6 with names matching `["list_brands", "get_brand_colors", "get_color_roles", "find_brand_logo", "find_product_icon", "fetch_asset"]`.
5. Kill the child on success or failure; exit 0/1.

This is the *only* gate that exercises the actual `bin/` entry point. It's also the only gate that catches "someone forgot to run `bun run build` before CI" class of error (caught indirectly — the CLI test runs after the build step, so if `dist/` is missing, the script fails loudly).

### `scripts/docs-check.ts`

Purpose: enforce four doc-hygiene properties.

Approach:

**(a) File headers.** Every `src/**/*.ts` file's first non-blank, non-shebang line starts with `/**`. Within the first 30 lines, the comment block contains the strings `Responsibility:`, `Dependencies:`. Missing = fail.

**(b) TSDoc on exports.** For every `(filepath, symbolName)` from `test-public-api.ts`'s extraction pass, assert the line immediately before the export declaration (allowing blank lines + a comment block) is a `/**` block opener.

**(c) Tool-description length.** `src/tools/*.ts` exports a `description` constant or literal string. Assert `.length > 200`.

**(d) `docs/tools.md` structure.** Parse H2 headers. Assert the six tool names (in export order from `src/tools/`) each appear as `## <name>`. No extra H2 sections. Each section contains `### Input schema`, `### Output schema`, `### Errors` H3s.

Fails with a numbered list of every violation, grouped by check.

Future (explicitly not in this phase): link-resolution, broken-link detection, example-round-trip check. `docs-check` can grow into those; ship the high-value parts first.

### `scripts/coverage-gate.ts`

Purpose: enforce §5.4.4 coverage thresholds.

Approach:

1. Run `bun test --coverage --coverage-reporter=lcov` (or `--coverage-reporter=text-summary`, whichever emits parseable output — verify during plan).
2. Parse the output; compute per-file and total line/branch coverage.
3. Apply thresholds:
   - Total lines ≥ 90%.
   - Total branches ≥ 85%.
   - Each `src/**/*.ts` file ≥ 70% lines (unless listed in `scripts/coverage-exempt.txt`).
   - Sum of `SfLogosError` constructor calls covered by at least one test-path line ≥ 100% (this duplicates `test:error-codes` but from a runtime-coverage angle).
4. Exit 0 with a summary table on pass; exit 1 with the violating files on fail.

Considered but rejected: `nyc`, `c8`, `istanbul`. Bun's built-in coverage is lighter and hits our needs.

## `package.json` script additions

```jsonc
{
  "scripts": {
    // ...existing...
    "test:node": "node --test \"dist/test/**/*.test.js\"",
    "test:error-codes": "bun run scripts/test-error-codes.ts",
    "test:public-api": "bun run scripts/test-public-api.ts",
    "test:cli": "bun run scripts/test-cli.ts",
    "docs:check": "bun run scripts/docs-check.ts",
    "coverage:gate": "bun run scripts/coverage-gate.ts",
    "check:pages": "bash scripts/check-pages-allowlist.sh",
    "ci": "bun run lint && bun run typecheck && bun run build && bun test && bun run test:node && bun run phase2:smoke && bun run try:check && bun run test:cli && bun run test:error-codes && bun run test:public-api && bun run docs:check && bun run coverage:gate && bun run check:pages"
  }
}
```

The `ci` script exists so local full-gate runs match CI behavior exactly. CI's YAML still runs each step individually for better log granularity.

## `.github/workflows/ci.yml` changes

Replace the current job with the expanded gate:

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6

      - uses: oven-sh/setup-bun@v2
        with: { bun-version: latest }

      - uses: actions/setup-node@v6
        with: { node-version: "22" }

      - run: bun install --frozen-lockfile

      - name: Lint
        run: bun run lint

      - name: Typecheck
        run: bun run typecheck

      - name: Build
        run: bun run build

      - name: Unit & integration tests (Bun)
        run: bun test --coverage

      - name: Tests against compiled dist/ (Node parity)
        run: bun run test:node

      - name: Server stdio smoke (7 JSON-RPC calls)
        run: bun run phase2:smoke

      - name: MCP regression suite (SDK client, 29 scenarios)
        run: bun run try:check

      - name: CLI smoke (spawn bin/sf-logos-mcp)
        run: bun run test:cli

      - name: Error-code coverage
        run: bun run test:error-codes

      - name: Public-API coverage
        run: bun run test:public-api

      - name: Docs freshness
        run: bun run docs:check

      - name: Coverage thresholds
        run: bun run coverage:gate

      - name: Pages allowlist
        run: bun run check:pages

      - name: Upload coverage artifact
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: coverage
          path: coverage/
```

Order: cheap → expensive, high-signal-early. Any early failure stops the job.

## Architecture impact

No `src/` changes (other than whatever headers and TSDoc phase 3C added). New scripts live in `scripts/`. `package.json` grows by 7 script entries. CI workflow expands from 7 steps to 14.

Coverage artifact is new — attached to every workflow run. Useful for triaging a "coverage dropped" failure without re-running locally.

## Test counts (phase 3D delta)

| Layer | Before | After | Δ |
|---|---|---|---|
| `bun test` total | 125 | 125 | 0 (no new unit/integration tests) |
| `scripts/try-mcp.ts` scenarios | 29 | 29 | 0 |
| `scripts/phase2-smoke.sh` | 7 | 7 | 0 |
| CI steps (gates) | 7 | 14 | +7 |
| `node --test dist/` | not run | runs 125 tests | N/A |

Phase 3D is about *asserting* what phases 1–3C already wrote, not adding new code or tests. One exception: phase 3D may surface coverage gaps that need new unit tests to close. Those count as phase-3D work and land in the plan's task list.

## Known risks and mitigations

| Risk | Mitigation |
|---|---|
| `bun test --coverage` output format changes between Bun versions | `scripts/coverage-gate.ts` is tolerant of multiple reporter formats; test under current Bun version during plan execution; pin Bun in CI if churn bites. |
| Regex-based AST parsing in `test-error-codes.ts` / `test-public-api.ts` misses edge cases | False-positives fail safe (over-report coverage); false-negatives are the risk. Accept the risk at this scale; migrate to `@typescript-eslint/parser` if the scripts start reporting noisy false failures. |
| Node parity flags a genuine incompat that's hard to fix | Block merge and fix. That's the point of the gate. If it blocks too often, revisit the `engines` floor and the dev-Bun-prod-Node split. |
| CLI smoke test timeouts on slow CI runners | 10-second timeout is generous; if flaky, raise to 30. Never retry without root-causing. |
| `docs:check` rejects a legitimate pattern (unusual export shape, generated file) | Explicit allowlist files: `scripts/public-api-exempt.txt`, `scripts/coverage-exempt.txt`. New exemptions require a PR that touches the allowlist, making the exemption reviewable. |
| CI runtime grows past PR-reviewer patience | Each step is cheap; full gate is well under 2 minutes on the current codebase. Revisit if we grow past 5 minutes; parallelize with job matrix at that point. |

## Out of scope (other phase-3 specs)

- **Phase 3B** (done or in-flight) — npm publish pipeline. Phase 3D depends on the publish workflow existing so the release path can adopt the same gates.
- **Phase 3C** (done or in-flight) — documentation set. Phase 3D's `docs:check` depends on headers and TSDoc existing.
- **Phase 3E** — advisory symmetry. Once it lands, `docs:check` may grow a check that advisories are documented in their tool's `docs/tools.md` section.

## Acceptance criteria — detail on coverage gate

Because §5.4.4's thresholds are strict, the plan's first step is to measure current coverage against each threshold, build a baseline report, and close any gap with targeted tests before enabling the gate. Enabling it on `main` while below threshold causes immediate red; we measure → close gaps → enable.

Expected baseline (to be confirmed during plan execution):

- Total line coverage: > 90% (the codebase has strong test discipline).
- Total branch coverage: > 85% (likely).
- Per-file floor: probably 1–2 files below 70% (logger, diagnostics) — close with new tests or add to exempt list with a reason.
- Error-code coverage: 100% (phase-3A added `DestinationExists` with tests).
- Public-API coverage: unknown; measure first.

If baseline is below threshold on any metric, the plan's first task is a **coverage-gap closure** task that writes the missing tests. Only after baseline is at or above threshold do we flip the gate on.
