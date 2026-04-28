# Phase 3E — Advisory Symmetry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalize the `advisories` channel from the single ad-hoc code introduced in phase 2 into a typed catalogue of four codes. Emit `only_light_surface_standalone_available` and `empty_result_filter_too_narrow` from `find_brand_logo`; emit `empty_result_filter_too_narrow` and `query_matched_no_scored_results` from `find_product_icon`. Suppress the existing `only_co_branded_for_requested_background` when the caller explicitly passed `co_branded: true`. Emit an `advisory.emitted` observability event per code per call.

**Architecture:** New `src/advisories.ts` module is the single source of truth for the `AdvisoryCode` string-literal union plus a `sortAdvisories(Set)` helper. The two affected tool handlers build a `Set<AdvisoryCode>`, emit one `advisory.emitted` event per code, then sort and attach as an optional `AdvisoryCode[]` on successful responses. The existing `ctx.logger.emit(ev.*(...))` pattern is extended with one new event constructor; there is no separate "events" service.

**Tech Stack:** TypeScript NodeNext ESM, Node ≥ 20, Bun in dev. `bun:test`. Bundled manifest at `src/bundled/manifest.json` (contains Slack, which hits every brand-logo advisory).

**Reference docs:**
- Authoritative spec: [`docs/superpowers/specs/2026-04-27-phase-3e-advisory-symmetry.md`](../specs/2026-04-27-phase-3e-advisory-symmetry.md)
- Phase-2 revision (introduces the advisory pattern): [`docs/superpowers/specs/2026-04-25-phase-2-scope-revision.md`](../specs/2026-04-25-phase-2-scope-revision.md)
- Original design (overall architecture): [`docs/superpowers/specs/2026-04-24-sf-logos-mcp-design.md`](../specs/2026-04-24-sf-logos-mcp-design.md)
- Session primer (current state, invariants): [`docs/SESSION_PRIMER.md`](../../SESSION_PRIMER.md)
- Learnings log (strict-TS quirks, etc.): [`docs/LEARNINGS.md`](../../LEARNINGS.md)

**Conventions (inherited from phases 1 / 2 / 3A, unchanged):**
- Package name: `@usefulto/sf-logos-mcp`.
- ESM imports use `.js` extensions (TS NodeNext).
- Tests use `bun:test` (`describe`, `it`, `expect`). Test helper: `test/helpers/context.ts` `makeTestContext(manifest, overrides?)`.
- Errors: `new SfLogosError(code, message, details?)` from `src/errors.ts`. Not used in 3E (no new error codes).
- Tool handler signature: `(input, ctx: ToolContext) => Promise<Output>`. Return via `Promise.resolve(x)` when body has no `await` (`require-await` lint).
- Commit style: conventional commits with the Claude co-author trailer via HEREDOC.
- Strict TS: `exactOptionalPropertyTypes` — use spread (`...(x.length > 0 ? { advisories: x } : {})`), never `{ advisories: undefined }`.
- Strict TS: `noPropertyAccessFromIndexSignature` — bracket access on index-signatured types. Not expected to bite in 3E.
- `bun run typecheck`, `bun run lint`, `bun test`, `bun run try:check` must all pass before any commit.
- Working directory for every command: repo root (`/Users/tal.golan/SF_Logos`).

**Branch strategy:** work happens on a new branch `spec/phase-3e-advisory-symmetry` off `main` (current HEAD `94d5623`). The four phase-3 specs are currently untracked on `main`; Task 1 creates the branch and commits the three specs not related to this plan (3B/3C/3D), then commits the 3E spec + this plan together. Implementation commits land on the same branch. One PR at the end.

**Baseline test counts (as of `94d5623`):**
- `bun test` total: **125** pass.
- `scripts/try-mcp.ts` regression scenarios: **29** pass.
- `scripts/phase2-smoke.sh`: **7** JSON-RPC calls pass.

**Target test counts after phase 3E:**
- `bun test` total: **125 → ~136** (+2 catalogue, +1 event, +4 find_brand_logo, +4 find_product_icon). Expected delta is +11. Final verification confirms the exact count; the plan does not promise a specific delta beyond "≥ 125 + added scenarios".
- `scripts/try-mcp.ts`: **29 → 32** (+3 scenarios).
- `scripts/phase2-smoke.sh`: **7** (unchanged).

**Order rationale:** catalogue first (everything imports it), then the `find_brand_logo` refactor in three behavior-preserving slices (structural rename → suppression refinement → new codes), then `find_product_icon` in two slices, then observability wiring (handlers already have logger access; adding emit late means the handler-logic tests don't need to stub an extra collaborator), then descriptions, then regression, then docs + PR.

---

## Scope check

Single subsystem — one new module (`src/advisories.ts`), two tool handlers modified (`find_brand_logo`, `find_product_icon`), one event constructor added, two tool descriptions rewritten, three regression scenarios added. No data-model changes beyond typing `advisories`. Single plan is correct.

## File structure

```
src/
  advisories.ts                # NEW — Task 2: AdvisoryCode union, sortAdvisories
  observability/
    events.ts                  # MODIFIED — Task 3: +advisoryEmitted constructor
  tools/
    find-brand-logo.ts         # MODIFIED — Tasks 4–7: typed advisories + 3 codes
    find-product-icon.ts       # MODIFIED — Tasks 8–9: typed advisories + 2 codes

test/
  advisories.test.ts           # NEW — Task 2 (2 scenarios)
  observability/
    events.test.ts             # MODIFIED — Task 3 (+1 scenario)
  tools/
    find-brand-logo.test.ts    # MODIFIED — Tasks 4–7, 10 (+4 scenarios)
    find-product-icon.test.ts  # MODIFIED — Tasks 8–9, 10 (+4 scenarios)

scripts/
  try-mcp.ts                   # MODIFIED — Task 12 (+3 regression scenarios)

docs/
  SESSION_PRIMER.md            # MODIFIED — Task 13 (phase-3E shipped, counts bumped)
  LEARNINGS.md                 # MODIFIED — Task 13 (any findings that surface)
```

---

## Task 1: Branch setup + baseline gate + untracked specs committed

**Goal:** Branch off `main`, land the four phase-3 specs (3B/3C/3D/3E) + this plan as the initial commits on the branch, verify baseline is green.

**Files:**
- Modify (add via git): `docs/superpowers/specs/2026-04-27-phase-3b-npm-publish.md`
- Modify (add via git): `docs/superpowers/specs/2026-04-27-phase-3c-documentation.md`
- Modify (add via git): `docs/superpowers/specs/2026-04-27-phase-3d-ci-hardening.md`
- Modify (add via git): `docs/superpowers/specs/2026-04-27-phase-3e-advisory-symmetry.md`
- Modify (add via git): `docs/superpowers/plans/2026-04-27-phase-3e-advisory-symmetry.md` (this file)

- [ ] **Step 1: Confirm starting state**

Run: `git status --short && git branch --show-current`

Expected: branch `main`, five untracked files: the four specs above plus this plan.

If anything else is modified or untracked, stop and investigate.

- [ ] **Step 2: Baseline gates on `main`**

Run:
```bash
bun install
bun run typecheck && bun run lint && bun test
```

Expected: typecheck + lint exit 0. Tests: `125 pass / 0 fail`. If anything fails, stop — do not start implementation on a broken baseline.

- [ ] **Step 3: Regression baseline**

Run: `bun run try:check`

Expected: `regression: 29/29 pass / 0 fail`.

- [ ] **Step 4: Create the branch**

Run: `git checkout -b spec/phase-3e-advisory-symmetry`

- [ ] **Step 5: Commit the three specs unrelated to this plan**

These specs were authored in the same session but will be executed by separate future plans. Land them on the branch first so the git history reads cleanly: spec → spec → spec → spec+plan → implementation.

```bash
git add docs/superpowers/specs/2026-04-27-phase-3b-npm-publish.md
git commit -m "$(cat <<'EOF'
docs: spec — phase 3B npm publish pipeline

Tag-triggered GitHub Actions publish with OIDC provenance. Tarball
allowlist + scripts/prepublish-check.sh. Out-of-scope for this branch;
executed by its own future plan.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

git add docs/superpowers/specs/2026-04-27-phase-3c-documentation.md
git commit -m "$(cat <<'EOF'
docs: spec — phase 3C full documentation set

README + six docs/ files + file headers + TSDoc on every export.
Shaped so phase 3D's docs:check can ratify structure. Executed by
its own future plan.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

git add docs/superpowers/specs/2026-04-27-phase-3d-ci-hardening.md
git commit -m "$(cat <<'EOF'
docs: spec — phase 3D CI hardening

Expands CI from 7 to 14 steps: test:node, test:error-codes,
test:public-api, test:cli, docs:check, coverage:gate, check:pages.
Executed by its own future plan.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: three commits land. `git log --oneline -3` shows the three spec commits.

- [ ] **Step 6: Commit the 3E spec and this plan together**

The 3E spec and plan land in one commit because they're the bundle this branch will execute.

```bash
git add docs/superpowers/specs/2026-04-27-phase-3e-advisory-symmetry.md \
        docs/superpowers/plans/2026-04-27-phase-3e-advisory-symmetry.md
git commit -m "$(cat <<'EOF'
docs: spec + plan — phase 3E advisory symmetry

Typed AdvisoryCode union (4 codes: 1 existing + 3 new). Extends
find_brand_logo and find_product_icon. Suppresses existing advisory
when co_branded: true is explicit. Plan follows 13-task TDD shape.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: commit lands. `git status --short` is empty.

---

## Task 2: Advisory catalogue module

**Goal:** Create `src/advisories.ts` as the single source of truth for the `AdvisoryCode` union, the alphabetized codes list, and the `sortAdvisories` helper. Write tests first (TDD).

**Files:**
- Create: `src/advisories.ts`
- Create: `test/advisories.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `test/advisories.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { ALL_ADVISORY_CODES, sortAdvisories, type AdvisoryCode } from "../src/advisories.js";

describe("advisories — catalogue", () => {
  it("ALL_ADVISORY_CODES contains exactly 4 members, alphabetically sorted", () => {
    expect(ALL_ADVISORY_CODES).toHaveLength(4);
    const sorted = [...ALL_ADVISORY_CODES].sort();
    expect(ALL_ADVISORY_CODES).toEqual(sorted);
    expect(ALL_ADVISORY_CODES).toEqual([
      "empty_result_filter_too_narrow",
      "only_co_branded_for_requested_background",
      "only_light_surface_standalone_available",
      "query_matched_no_scored_results",
    ]);
  });

  it("sortAdvisories produces alphabetical ordering for a multi-element set", () => {
    const set: Set<AdvisoryCode> = new Set([
      "query_matched_no_scored_results",
      "empty_result_filter_too_narrow",
      "only_co_branded_for_requested_background",
    ]);
    expect(sortAdvisories(set)).toEqual([
      "empty_result_filter_too_narrow",
      "only_co_branded_for_requested_background",
      "query_matched_no_scored_results",
    ]);
  });
});
```

- [ ] **Step 2: Run the tests; confirm they fail**

Run: `bun test test/advisories.test.ts`

Expected: failure, `Cannot find module '../src/advisories.js'` or similar. If the failure looks different, stop and investigate — you may be resolving an unexpected module.

- [ ] **Step 3: Write the minimal implementation**

Create `src/advisories.ts`:

```ts
/**
 * advisories — Catalogue of machine-readable advisory codes emitted on
 * successful responses from find_* tools.
 *
 * Responsibility: single source of truth for the AdvisoryCode union,
 * the alphabetized list of all codes, and the sortAdvisories helper.
 * What this module does NOT own: which tools emit which codes (lives in
 * src/tools/*.ts), the trigger conditions (lives in docs/tools.md once
 * phase 3C lands and inline in the tool descriptions), nor the
 * observability event that records emissions (lives in
 * src/observability/events.ts).
 * Inputs: none (pure type + data module).
 * Outputs: the AdvisoryCode type and helpers.
 * Errors: none — advisories are informational, not failures.
 * Dependencies: none.
 *
 * See docs/superpowers/specs/2026-04-27-phase-3e-advisory-symmetry.md
 * for the authoritative per-code trigger rules.
 */

/** Every stable advisory code the server may emit on success responses. */
export type AdvisoryCode =
  | "empty_result_filter_too_narrow"
  | "only_co_branded_for_requested_background"
  | "only_light_surface_standalone_available"
  | "query_matched_no_scored_results";

/** Alphabetized list of every member of the AdvisoryCode union. */
export const ALL_ADVISORY_CODES: readonly AdvisoryCode[] = [
  "empty_result_filter_too_narrow",
  "only_co_branded_for_requested_background",
  "only_light_surface_standalone_available",
  "query_matched_no_scored_results",
];

/**
 * Sort a set of advisory codes alphabetically.
 *
 * Handlers accumulate codes into a `Set<AdvisoryCode>` during dispatch,
 * then call this before attaching the list to the response. Deterministic
 * ordering keeps test expectations and client parsing simple.
 *
 * @param codes Set of advisory codes to emit on a response.
 * @returns The codes as an alphabetically sorted array (stable).
 * @example
 *   const set = new Set<AdvisoryCode>([...]);
 *   const advisories = sortAdvisories(set);
 */
export function sortAdvisories(codes: Set<AdvisoryCode>): AdvisoryCode[] {
  return Array.from(codes).sort();
}
```

- [ ] **Step 4: Run tests; confirm they pass**

Run: `bun test test/advisories.test.ts`

Expected: `2 pass / 0 fail`.

- [ ] **Step 5: Full-suite gate**

Run: `bun run typecheck && bun run lint && bun test`

Expected: typecheck + lint exit 0. Tests: `127 pass / 0 fail` (baseline 125 + 2 new).

- [ ] **Step 6: Commit**

```bash
git add src/advisories.ts test/advisories.test.ts
git commit -m "$(cat <<'EOF'
feat: advisories — typed catalogue of advisory codes

New src/advisories.ts exports the AdvisoryCode string-literal union
(4 codes), ALL_ADVISORY_CODES alphabetized list, and sortAdvisories
helper. No handler yet uses these — this commit is the catalogue
module in isolation; subsequent commits wire it into find_brand_logo
and find_product_icon.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `advisory.emitted` event constructor

**Goal:** Add the `advisoryEmitted` constructor to `src/observability/events.ts` so handlers can record each advisory emission through the existing logger channel.

**Files:**
- Modify: `src/observability/events.ts`
- Modify: `test/observability/events.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `test/observability/events.test.ts` (inside the `describe("Event constructors", …)` block — before the closing `});`):

```ts
  it("advisoryEmitted is debug-level with tool and code", () => {
    const e = ev.advisoryEmitted({
      tool: "find_brand_logo",
      code: "only_co_branded_for_requested_background",
    });
    expect(e.event).toBe("advisory.emitted");
    expect(e.level).toBe("debug");
    expect(e["tool"]).toBe("find_brand_logo");
    expect(e["code"]).toBe("only_co_branded_for_requested_background");
  });
```

- [ ] **Step 2: Run the test; confirm failure**

Run: `bun test test/observability/events.test.ts`

Expected: failure with `ev.advisoryEmitted is not a function` or TypeScript error. If instead the test passes, something is wrong — do not continue until the failure is the expected one.

- [ ] **Step 3: Add the constructor**

Edit `src/observability/events.ts`. At the top, add an import:

```ts
import type { AdvisoryCode } from "../advisories.js";
```

Then extend the `ev` object by appending one more constructor just before the closing `};`. Insert right after `internalError`:

```ts
  advisoryEmitted: (a: {
    tool: "find_brand_logo" | "find_product_icon";
    code: AdvisoryCode;
  }): LogEvent => ({ event: "advisory.emitted", level: "debug", ...a }),
```

- [ ] **Step 4: Run the test; confirm pass**

Run: `bun test test/observability/events.test.ts`

Expected: all scenarios pass (6 total — the 5 pre-existing + 1 new).

- [ ] **Step 5: Full-suite gate**

Run: `bun run typecheck && bun run lint && bun test`

Expected: tests `128 pass / 0 fail`.

- [ ] **Step 6: Commit**

```bash
git add src/observability/events.ts test/observability/events.test.ts
git commit -m "$(cat <<'EOF'
feat: observability — advisory.emitted event constructor

ev.advisoryEmitted({tool, code}) at debug level. Not yet wired into
any handler; Task 10 hooks it up. Typed with AdvisoryCode so unknown
codes fail at compile time.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `find_brand_logo` — structural rename to `AdvisoryCode[]`

**Goal:** Swap `advisories?: string[]` on the output interface for `AdvisoryCode[]` so the compiler enforces spelling. No behavior change. Existing tests must still pass without modification.

**Files:**
- Modify: `src/tools/find-brand-logo.ts`

- [ ] **Step 1: Baseline confirmation (no new test — structural change)**

Run: `bun test test/tools/find-brand-logo.test.ts`

Expected: `10 pass / 0 fail` (7 core + 3 advisory scenarios from phase 2).

This establishes the behavior we must preserve.

- [ ] **Step 2: Rewrite the output type and the advisory accumulator**

Edit `src/tools/find-brand-logo.ts`.

Add this import near the top (after the `../manifest/types.js` import):

```ts
import { sortAdvisories, type AdvisoryCode } from "../advisories.js";
```

Change the `Output` interface (line 36–39 today) from:

```ts
interface Output {
  logos: AssetSummary[];
  advisories?: string[];
}
```

to:

```ts
interface Output {
  logos: AssetSummary[];
  advisories?: AdvisoryCode[];
}
```

Change the end-of-handler block (lines 138–146 today) from:

```ts
    const advisories: string[] = [];
    if (input.background !== undefined && logos.length > 0 && logos.every((l) => l.co_branded)) {
      advisories.push("only_co_branded_for_requested_background");
    }

    return Promise.resolve({
      logos: logos.map((l) => toAssetSummary(l, brand)),
      ...(advisories.length > 0 ? { advisories } : {}),
    });
```

to:

```ts
    const advisorySet = new Set<AdvisoryCode>();
    if (input.background !== undefined && logos.length > 0 && logos.every((l) => l.co_branded)) {
      advisorySet.add("only_co_branded_for_requested_background");
    }

    const advisories = sortAdvisories(advisorySet);
    return Promise.resolve({
      logos: logos.map((l) => toAssetSummary(l, brand)),
      ...(advisories.length > 0 ? { advisories } : {}),
    });
```

- [ ] **Step 3: Run the existing tests; confirm still passing**

Run: `bun test test/tools/find-brand-logo.test.ts`

Expected: `10 pass / 0 fail` (unchanged count — this is a structural-only commit).

- [ ] **Step 4: Full-suite gate**

Run: `bun run typecheck && bun run lint && bun test`

Expected: `128 pass / 0 fail`.

- [ ] **Step 5: Commit**

```bash
git add src/tools/find-brand-logo.ts
git commit -m "$(cat <<'EOF'
refactor: find_brand_logo — type advisories as AdvisoryCode[]

Switch from string[] to the new AdvisoryCode union. Handler now uses
a Set + sortAdvisories helper so future codes land in a deterministic
order. No behavior change — existing tests pass unmodified.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `find_brand_logo` — suppress existing advisory when `co_branded: true` was explicit

**Goal:** The `only_co_branded_for_requested_background` advisory is not useful when the caller explicitly requested `co_branded: true` — they asked for co-brands; receiving only co-brands is the answer, not a caveat. Refine the trigger to suppress in that case. Test first.

**Files:**
- Modify: `src/tools/find-brand-logo.ts`
- Modify: `test/tools/find-brand-logo.test.ts`

- [ ] **Step 1: Write the failing test**

Append a new `it(...)` inside the existing `describe("find_brand_logo — advisories", …)` block in `test/tools/find-brand-logo.test.ts` (just before the closing `});`):

```ts
  it("does NOT emit the advisory when co_branded: true was explicitly requested", async () => {
    const result = (await findBrandLogoTool.handler(
      { brand: "slack", background: "dark", co_branded: true },
      ctx(),
    )) as { logos: Array<{ co_branded: boolean }>; advisories?: string[] };
    expect(result.logos.length).toBeGreaterThan(0);
    expect(result.logos.every((l) => l.co_branded)).toBe(true);
    expect(result.advisories ?? []).not.toContain("only_co_branded_for_requested_background");
  });
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun test test/tools/find-brand-logo.test.ts`

Expected: the new scenario fails — `expect(...).not.toContain(...)` is violated because the advisory is still emitted. All other scenarios still pass.

- [ ] **Step 3: Implement the suppression**

Edit `src/tools/find-brand-logo.ts`. Change the advisory-detection block from:

```ts
    const advisorySet = new Set<AdvisoryCode>();
    if (input.background !== undefined && logos.length > 0 && logos.every((l) => l.co_branded)) {
      advisorySet.add("only_co_branded_for_requested_background");
    }
```

to:

```ts
    const advisorySet = new Set<AdvisoryCode>();
    if (
      input.background !== undefined &&
      input.co_branded !== true &&
      logos.length > 0 &&
      logos.every((l) => l.co_branded)
    ) {
      advisorySet.add("only_co_branded_for_requested_background");
    }
```

- [ ] **Step 4: Run tests; confirm pass**

Run: `bun test test/tools/find-brand-logo.test.ts`

Expected: `11 pass / 0 fail` (10 existing + 1 new).

- [ ] **Step 5: Full-suite gate**

Run: `bun run typecheck && bun run lint && bun test`

Expected: `129 pass / 0 fail`.

- [ ] **Step 6: Commit**

```bash
git add src/tools/find-brand-logo.ts test/tools/find-brand-logo.test.ts
git commit -m "$(cat <<'EOF'
fix: find_brand_logo — suppress advisory when co_branded:true is explicit

The only_co_branded_for_requested_background advisory is intended to
flag an unexpected constraint to callers. When the caller explicitly
asked for co-branded results, receiving only co-branded is the answer,
not a caveat. Suppress the advisory in that case.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `find_brand_logo` — emit `only_light_surface_standalone_available`

**Goal:** When `background === "dark"` is requested and the brand has no dark-surface standalone marks but does have light-surface standalone marks, emit the new code. Co-emits with `only_co_branded_for_requested_background` for Slack. Test first.

**Files:**
- Modify: `src/tools/find-brand-logo.ts`
- Modify: `test/tools/find-brand-logo.test.ts`

- [ ] **Step 1: Write the failing tests**

Append two `it(...)` scenarios to the existing `describe("find_brand_logo — advisories", …)` block (before the closing `});`):

```ts
  it("emits 'only_light_surface_standalone_available' for dark Slack (co-emits with co-brand advisory)", async () => {
    const result = (await findBrandLogoTool.handler(
      { brand: "slack", background: "dark" },
      ctx(),
    )) as { advisories?: string[] };
    expect(result.advisories ?? []).toContain("only_light_surface_standalone_available");
    expect(result.advisories ?? []).toContain("only_co_branded_for_requested_background");
  });

  it("does NOT emit 'only_light_surface_standalone_available' for dark Salesforce (standalone dark mark exists)", async () => {
    const result = (await findBrandLogoTool.handler(
      { brand: "salesforce", background: "dark" },
      ctx(),
    )) as { advisories?: string[] };
    expect(result.advisories ?? []).not.toContain("only_light_surface_standalone_available");
  });
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun test test/tools/find-brand-logo.test.ts`

Expected: the two new scenarios fail because the advisory is never emitted. All previous scenarios still pass.

- [ ] **Step 3: Implement**

Edit `src/tools/find-brand-logo.ts`. After the existing `only_co_branded_for_requested_background` block, add:

```ts
    if (input.background === "dark") {
      const darkStandalone = brand.logos.some((l) => l.background === "dark" && !l.co_branded);
      const lightStandalone = brand.logos.some((l) => l.background === "light" && !l.co_branded);
      if (!darkStandalone && lightStandalone) {
        advisorySet.add("only_light_surface_standalone_available");
      }
    }
```

The full advisory block now reads:

```ts
    const advisorySet = new Set<AdvisoryCode>();
    if (
      input.background !== undefined &&
      input.co_branded !== true &&
      logos.length > 0 &&
      logos.every((l) => l.co_branded)
    ) {
      advisorySet.add("only_co_branded_for_requested_background");
    }

    if (input.background === "dark") {
      const darkStandalone = brand.logos.some((l) => l.background === "dark" && !l.co_branded);
      const lightStandalone = brand.logos.some((l) => l.background === "light" && !l.co_branded);
      if (!darkStandalone && lightStandalone) {
        advisorySet.add("only_light_surface_standalone_available");
      }
    }
```

- [ ] **Step 4: Run tests; confirm pass**

Run: `bun test test/tools/find-brand-logo.test.ts`

Expected: `13 pass / 0 fail`.

- [ ] **Step 5: Full-suite gate**

Run: `bun run typecheck && bun run lint && bun test`

Expected: `131 pass / 0 fail`.

- [ ] **Step 6: Commit**

```bash
git add src/tools/find-brand-logo.ts test/tools/find-brand-logo.test.ts
git commit -m "$(cat <<'EOF'
feat: find_brand_logo — emit only_light_surface_standalone_available

For brands like Slack whose dark-surface lineup is co-brand-only but
whose light-surface lineup includes a standalone mark, signal that the
sanctioned recovery is placing the light-surface mark on a contrasting
card (rather than retrying with a relaxed background filter).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `find_brand_logo` — emit `empty_result_filter_too_narrow`

**Goal:** When the caller supplied at least one filter, the brand has logos pre-filter, but every candidate was filtered out, emit the code. Test first.

**Files:**
- Modify: `src/tools/find-brand-logo.ts`
- Modify: `test/tools/find-brand-logo.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `describe("find_brand_logo — advisories", …)`:

```ts
  it("emits 'empty_result_filter_too_narrow' when filters eliminate every candidate", async () => {
    const result = (await findBrandLogoTool.handler(
      { brand: "salesforce", background: "dark", variant: "__nonexistent_xyz__" },
      ctx(),
    )) as { logos: unknown[]; advisories?: string[] };
    expect(result.logos).toHaveLength(0);
    expect(result.advisories ?? []).toContain("empty_result_filter_too_narrow");
  });

  it("does NOT emit 'empty_result_filter_too_narrow' when no filters are supplied", async () => {
    const result = (await findBrandLogoTool.handler({ brand: "salesforce" }, ctx())) as {
      logos: unknown[];
      advisories?: string[];
    };
    expect(result.logos.length).toBeGreaterThan(0);
    expect(result.advisories ?? []).not.toContain("empty_result_filter_too_narrow");
  });
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun test test/tools/find-brand-logo.test.ts`

Expected: new "emits" scenario fails (advisory absent). "does NOT emit" passes already (vacuously — `advisories` is undefined).

- [ ] **Step 3: Implement**

Edit `src/tools/find-brand-logo.ts`. Append to the advisory block (after the `only_light_surface_standalone_available` block):

```ts
    const filterSupplied =
      input.background !== undefined ||
      input.co_branded !== undefined ||
      input.variant !== undefined ||
      input.preferred_only === true;
    if (filterSupplied && logos.length === 0 && brand.logos.length > 0) {
      advisorySet.add("empty_result_filter_too_narrow");
    }
```

- [ ] **Step 4: Run tests; confirm pass**

Run: `bun test test/tools/find-brand-logo.test.ts`

Expected: `15 pass / 0 fail`.

- [ ] **Step 5: Full-suite gate**

Run: `bun run typecheck && bun run lint && bun test`

Expected: `133 pass / 0 fail`.

- [ ] **Step 6: Commit**

```bash
git add src/tools/find-brand-logo.ts test/tools/find-brand-logo.test.ts
git commit -m "$(cat <<'EOF'
feat: find_brand_logo — emit empty_result_filter_too_narrow

When the caller supplied filters and nothing survived the AND, signal
that relaxing a filter is the likely recovery. Guarded by the brand
having candidates pre-filter so we do not fire on a data gap
(that is a different problem, and there is no filter to relax).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `find_product_icon` — structural rename + emit `empty_result_filter_too_narrow`

**Goal:** Add `advisories?: AdvisoryCode[]` to `find_product_icon`'s output and emit `empty_result_filter_too_narrow` when non-query filters eliminated everything. This task refactors the handler so advisory counts are visible in one control flow path (today, the handler has two return sites — query and non-query).

**Files:**
- Modify: `src/tools/find-product-icon.ts`
- Modify: `test/tools/find-product-icon.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `test/tools/find-product-icon.test.ts` (append a new `describe` block at the bottom, after the existing `});`):

```ts
describe("find_product_icon — advisories", () => {
  const ctx = () => makeTestContext(bundled as unknown as Manifest);

  it("emits 'empty_result_filter_too_narrow' when category + keywords filter eliminates everything", async () => {
    const result = (await findProductIconTool.handler(
      { category: "Data", keywords: ["__nonexistent_xyz__"] },
      ctx(),
    )) as { icons: unknown[]; advisories?: string[] };
    expect(result.icons).toHaveLength(0);
    expect(result.advisories ?? []).toContain("empty_result_filter_too_narrow");
  });

  it("does NOT emit 'empty_result_filter_too_narrow' when results exist", async () => {
    const result = (await findProductIconTool.handler({ category: "AI" }, ctx())) as {
      icons: unknown[];
      advisories?: string[];
    };
    expect(result.icons.length).toBeGreaterThan(0);
    expect(result.advisories ?? []).not.toContain("empty_result_filter_too_narrow");
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun test test/tools/find-product-icon.test.ts`

Expected: the first new scenario fails. The "does NOT emit" scenario passes trivially.

- [ ] **Step 3: Implement — refactor handler to a single flow + add advisory**

Edit `src/tools/find-product-icon.ts`.

Add imports at the top (after `../manifest/types.js`):

```ts
import { sortAdvisories, type AdvisoryCode } from "../advisories.js";
```

Update the `Output` interface (currently lines 33–35):

```ts
interface Output {
  icons: AssetSummary[];
  advisories?: AdvisoryCode[];
}
```

Replace the `handler` body (currently lines 85–141) with a single-flow version. Full replacement:

```ts
  handler: (input, ctx) => {
    if (
      input.query === undefined &&
      input.category === undefined &&
      input.keywords === undefined &&
      input.background === undefined
    ) {
      return Promise.reject(
        new SfLogosError(
          "InvalidInput",
          "find_product_icon requires at least one of query, category, keywords, or background.",
          {},
        ),
      );
    }
    const brand = ctx.manifest.brands.find((b) => b.id === "product-icons");
    if (!brand) return Promise.resolve({ icons: [] });

    const preFilterCount = brand.logos.length;

    let candidates = brand.logos.slice();
    if (input.category !== undefined) {
      candidates = candidates.filter((l) => l.category === input.category);
    }
    if (input.background !== undefined) {
      candidates = candidates.filter((l) => l.background === input.background);
    }
    if (input.keywords !== undefined && input.keywords.length > 0) {
      const wanted = input.keywords.map((k) => k.toLowerCase());
      candidates = candidates.filter((l) => {
        const lower = l.keywords.map((k) => k.toLowerCase());
        return wanted.every((w) => lower.includes(w));
      });
    }

    const postFilterCount = candidates.length;
    const limit = clamp(input.limit ?? DEFAULT_LIMIT, 1, MAX_LIMIT);

    const queryTrimmed = input.query?.trim() ?? "";
    const hasQuery = queryTrimmed.length > 0;

    let finalIcons: AssetSummary[];
    if (hasQuery) {
      const tokens = tokenize(input.query as string);
      const scored = candidates
        .map((l) => ({ logo: l, score: scoreLogo(l, tokens) }))
        .filter((s) => s.score > 0)
        .sort((a, b) =>
          b.score !== a.score ? b.score - a.score : a.logo.name.localeCompare(b.logo.name),
        )
        .slice(0, limit);
      finalIcons = scored.map((s) => ({
        ...toAssetSummary(s.logo, brand),
        match_score: s.score,
      }));
    } else {
      candidates.sort((a, b) => a.name.localeCompare(b.name));
      finalIcons = candidates.slice(0, limit).map((l) => toAssetSummary(l, brand));
    }

    const advisorySet = new Set<AdvisoryCode>();
    const nonQueryFilterSupplied =
      input.category !== undefined ||
      (input.keywords !== undefined && input.keywords.length > 0) ||
      input.background !== undefined;
    if (finalIcons.length === 0 && nonQueryFilterSupplied && preFilterCount > 0) {
      advisorySet.add("empty_result_filter_too_narrow");
    }

    const advisories = sortAdvisories(advisorySet);
    return Promise.resolve({
      icons: finalIcons,
      ...(advisories.length > 0 ? { advisories } : {}),
    });
  },
```

Note: `postFilterCount` is declared but not yet used in this task. Task 9 uses it for `query_matched_no_scored_results`. Leaving it computed here avoids a second refactor. If lint flags it as unused in this task, prefix with `void postFilterCount;` to silence — the next task consumes it. (Verify: run `bun run lint` in Step 5; if it complains, add the `void` suppression and recommit in the next task.)

- [ ] **Step 4: Run tests; confirm pass**

Run: `bun test test/tools/find-product-icon.test.ts`

Expected: `10 pass / 0 fail` (8 existing + 2 new).

- [ ] **Step 5: Full-suite gate**

Run: `bun run typecheck && bun run lint && bun test`

Expected: typecheck + lint clean. Tests: `135 pass / 0 fail`.

If lint complains about `postFilterCount` being unused, add `void postFilterCount;` right after its declaration (it will be consumed in Task 9), rerun, confirm clean.

- [ ] **Step 6: Commit**

```bash
git add src/tools/find-product-icon.ts test/tools/find-product-icon.test.ts
git commit -m "$(cat <<'EOF'
feat: find_product_icon — typed advisories + empty_result_filter_too_narrow

Collapse the handler's two return sites into one flow so advisory
detection has visibility into both the scored and non-scored paths.
Output interface now declares advisories?: AdvisoryCode[]. Emit
empty_result_filter_too_narrow when non-query filters narrowed
the candidate set to zero.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: `find_product_icon` — emit `query_matched_no_scored_results`

**Goal:** When `query` is supplied and every post-non-query-filter candidate scored 0, signal that rewording the query — not relaxing filters — is the likely recovery.

**Files:**
- Modify: `src/tools/find-product-icon.ts`
- Modify: `test/tools/find-product-icon.test.ts`

- [ ] **Step 1: Write the failing tests**

Append two `it(...)` scenarios to the existing `describe("find_product_icon — advisories", …)` block:

```ts
  it("emits 'query_matched_no_scored_results' when query matches zero candidates (no other filters)", async () => {
    const result = (await findProductIconTool.handler(
      { query: "xyzzy-plugh-nowhere" },
      ctx(),
    )) as { icons: unknown[]; advisories?: string[] };
    expect(result.icons).toHaveLength(0);
    expect(result.advisories ?? []).toContain("query_matched_no_scored_results");
    expect(result.advisories ?? []).not.toContain("empty_result_filter_too_narrow");
  });

  it("emits BOTH advisories when query misses AND filters narrowed the pool", async () => {
    const result = (await findProductIconTool.handler(
      { query: "xyzzy-plugh-nowhere", category: "AI" },
      ctx(),
    )) as { icons: unknown[]; advisories?: string[] };
    expect(result.icons).toHaveLength(0);
    expect(result.advisories ?? []).toContain("query_matched_no_scored_results");
    expect(result.advisories ?? []).toContain("empty_result_filter_too_narrow");
  });

  it("does NOT emit 'query_matched_no_scored_results' when results are found", async () => {
    const result = (await findProductIconTool.handler({ query: "agentforce" }, ctx())) as {
      icons: unknown[];
      advisories?: string[];
    };
    expect(result.icons.length).toBeGreaterThan(0);
    expect(result.advisories ?? []).not.toContain("query_matched_no_scored_results");
  });
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun test test/tools/find-product-icon.test.ts`

Expected: the two "emits" scenarios fail. The "does NOT emit" scenario passes trivially.

- [ ] **Step 3: Implement**

Edit `src/tools/find-product-icon.ts`. In the handler, right after the existing `empty_result_filter_too_narrow` detection block, add:

```ts
    if (finalIcons.length === 0 && hasQuery && postFilterCount > 0) {
      advisorySet.add("query_matched_no_scored_results");
    }
```

The full advisory detection block now reads:

```ts
    const advisorySet = new Set<AdvisoryCode>();
    const nonQueryFilterSupplied =
      input.category !== undefined ||
      (input.keywords !== undefined && input.keywords.length > 0) ||
      input.background !== undefined;
    if (finalIcons.length === 0 && nonQueryFilterSupplied && preFilterCount > 0) {
      advisorySet.add("empty_result_filter_too_narrow");
    }
    if (finalIcons.length === 0 && hasQuery && postFilterCount > 0) {
      advisorySet.add("query_matched_no_scored_results");
    }
```

If you added `void postFilterCount;` in Task 8 to silence unused-variable lint, remove it now — it's consumed.

- [ ] **Step 4: Run tests; confirm pass**

Run: `bun test test/tools/find-product-icon.test.ts`

Expected: `13 pass / 0 fail` (10 after Task 8 + 3 new).

- [ ] **Step 5: Full-suite gate**

Run: `bun run typecheck && bun run lint && bun test`

Expected: `138 pass / 0 fail`.

- [ ] **Step 6: Commit**

```bash
git add src/tools/find-product-icon.ts test/tools/find-product-icon.test.ts
git commit -m "$(cat <<'EOF'
feat: find_product_icon — emit query_matched_no_scored_results

When query is non-empty and every post-non-query-filter candidate
scored 0, signal that rewording the query is the likely recovery.
Can co-emit with empty_result_filter_too_narrow when filters ALSO
narrowed the pool; the two codes together mean both relaxations
are available to the caller.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Wire `advisory.emitted` observability events from both handlers

**Goal:** Each advisory emission writes one `ev.advisoryEmitted({tool, code})` event through `ctx.logger.emit`. Test first.

**Files:**
- Modify: `src/tools/find-brand-logo.ts`
- Modify: `src/tools/find-product-icon.ts`
- Modify: `test/tools/find-brand-logo.test.ts`
- Modify: `test/tools/find-product-icon.test.ts`

- [ ] **Step 1: Write the failing tests**

Tests collect events by installing a capturing logger via the test helper. The helper today accepts a logger via... it doesn't, actually — it creates one internally. We'll assert against `ctx.logger.ringSnapshot()` instead, which is already exposed by the `Logger` interface.

The `makeTestContext` helper returns a `ToolContext` whose `logger.ringSnapshot()` preserves every emitted event. Tests can call `ringSnapshot()` after the handler resolves and filter for `event === "advisory.emitted"`.

Append to the `describe("find_brand_logo — advisories", …)` block in `test/tools/find-brand-logo.test.ts`:

```ts
  it("writes an advisory.emitted event per code to the observability ring", async () => {
    const c = ctx();
    await findBrandLogoTool.handler({ brand: "slack", background: "dark" }, c);
    const snapshot = c.logger.ringSnapshot();
    const events = snapshot.filter((e) => e.event === "advisory.emitted");
    const codes = events.map((e) => e["code"]).sort();
    expect(codes).toEqual([
      "only_co_branded_for_requested_background",
      "only_light_surface_standalone_available",
    ]);
    for (const e of events) {
      expect(e["tool"]).toBe("find_brand_logo");
    }
  });
```

Append to the `describe("find_product_icon — advisories", …)` block in `test/tools/find-product-icon.test.ts`:

```ts
  it("writes an advisory.emitted event per code to the observability ring", async () => {
    const c = ctx();
    await findProductIconTool.handler({ query: "xyzzy-plugh-nowhere", category: "AI" }, c);
    const snapshot = c.logger.ringSnapshot();
    const events = snapshot.filter((e) => e.event === "advisory.emitted");
    const codes = events.map((e) => e["code"]).sort();
    expect(codes).toEqual(["empty_result_filter_too_narrow", "query_matched_no_scored_results"]);
    for (const e of events) {
      expect(e["tool"]).toBe("find_product_icon");
    }
  });
```

Because `ctx()` in both test files is defined as `() => makeTestContext(bundled as unknown as Manifest)`, and the tests now call `ctx()` once and reuse the instance, they implicitly depend on `ToolContext.logger.ringSnapshot()`. That interface exists today (see `src/observability/logger.ts` lines 27–34).

- [ ] **Step 2: Run and confirm failure**

Run: `bun test test/tools/find-brand-logo.test.ts test/tools/find-product-icon.test.ts`

Expected: both new scenarios fail — `events` array is empty.

- [ ] **Step 3: Wire emission in `find_brand_logo`**

Edit `src/tools/find-brand-logo.ts`. Add an import at the top (after the existing observability-free imports):

```ts
import { ev } from "../observability/events.js";
```

In the handler, right before the `const advisories = sortAdvisories(advisorySet);` line, add:

```ts
    for (const code of advisorySet) {
      ctx.logger.emit(ev.advisoryEmitted({ tool: "find_brand_logo", code }));
    }
```

- [ ] **Step 4: Wire emission in `find_product_icon`**

Edit `src/tools/find-product-icon.ts`. Add the same import:

```ts
import { ev } from "../observability/events.js";
```

In the handler, right before `const advisories = sortAdvisories(advisorySet);`, add:

```ts
    for (const code of advisorySet) {
      ctx.logger.emit(ev.advisoryEmitted({ tool: "find_product_icon", code }));
    }
```

- [ ] **Step 5: Run tests; confirm pass**

Run: `bun test test/tools/find-brand-logo.test.ts test/tools/find-product-icon.test.ts`

Expected: both files' advisory-events scenarios pass. `find-brand-logo.test.ts: 16 pass / 0 fail`. `find-product-icon.test.ts: 14 pass / 0 fail`.

- [ ] **Step 6: Full-suite gate**

Run: `bun run typecheck && bun run lint && bun test`

Expected: `140 pass / 0 fail`.

- [ ] **Step 7: Commit**

```bash
git add src/tools/find-brand-logo.ts src/tools/find-product-icon.ts \
        test/tools/find-brand-logo.test.ts test/tools/find-product-icon.test.ts
git commit -m "$(cat <<'EOF'
feat: advisory emissions write advisory.emitted observability events

Both find_* handlers loop the advisorySet and emit one
ev.advisoryEmitted({tool, code}) via ctx.logger per code. Tests assert
the ring captures every emission with the correct tool and code.
This makes advisory behavior debuggable from SIGUSR2 diagnostics
snapshots and CI log tails.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Rewrite tool `DESCRIPTION` strings

**Goal:** Both tool descriptions enumerate the advisory codes they can emit so the LLM sees them at `tools/list` time. Existing "≥ 200 chars" test scenarios already enforce a floor; the rewrite stays above it.

**Files:**
- Modify: `src/tools/find-brand-logo.ts`
- Modify: `src/tools/find-product-icon.ts`

- [ ] **Step 1: Rewrite `find_brand_logo` description**

Edit `src/tools/find-brand-logo.ts`. Replace the `DESCRIPTION` constant (currently lines 41–56) with:

```ts
const DESCRIPTION = [
  "Find brand wordmark or lockup assets for Salesforce, MuleSoft, Slack, Tableau,",
  "or Informatica. Required: `brand` (NOT 'product-icons' — use find_product_icon).",
  "Optional filters: `background` ('light'/'dark' — match the target slide surface),",
  "`co_branded` (true = Salesforce-endorsed lockups only), `variant` (substring on",
  "the asset's variant, e.g. 'Knockout'), `preferred_only` (only the default-choice",
  "asset). Results sorted preferred-first. Always prefer SVG (summary.preferred_format).",
  "Never recolor or distort — preserve the aspect_ratio supplied on each result.",
  "On success, the response may include `advisories` (optional string array) with one",
  "or more of: `only_co_branded_for_requested_background` (every result is a",
  "Salesforce-endorsed lockup when a specific background was requested — suppressed",
  "when co_branded: true was the caller's explicit ask), `only_light_surface_standalone_available`",
  "(dark background requested but only light-surface standalone marks exist for this brand —",
  "place the light mark on a contrasting card), `empty_result_filter_too_narrow` (the",
  "AND of filters eliminated every candidate — relaxing a filter is the likely recovery).",
].join(" ");
```

- [ ] **Step 2: Rewrite `find_product_icon` description**

Edit `src/tools/find-product-icon.ts`. Replace the `DESCRIPTION` constant (currently lines 40–51) with:

```ts
const DESCRIPTION = [
  "Search Salesforce 2D product icons. You MUST provide at least one of:",
  "`query` (natural language — scored across keywords, name, description, use_cases),",
  "`category` (one of AI | CRM | Platform | Data | Industries | Marketing | Service | Security),",
  "`keywords` (list — ALL must appear as keywords on the asset, case-insensitive),",
  "`background` ('light'/'dark'). Filters are ANDed. `limit` defaults to 10, max 90.",
  "Prefer SVG (summary.preferred_format). All 90 icons are square (is_square=true).",
  "Passing no filters raises InvalidInput.",
  "Name drift: some products have been renamed (e.g. 'Data Cloud' → 'Data 360');",
  "keywords cover former names, but `name` is always the current canonical label —",
  "surface `name` to the user rather than the query string.",
  "On success, the response may include `advisories` (optional string array) with one",
  "or more of: `empty_result_filter_too_narrow` (non-query filters narrowed the pool to",
  "zero — relax a filter), `query_matched_no_scored_results` (query matched no candidate",
  "in the filtered pool — reword the query rather than relaxing filters).",
].join(" ");
```

- [ ] **Step 3: Run the description-length tests; confirm pass**

Run: `bun test test/tools/find-brand-logo.test.ts test/tools/find-product-icon.test.ts`

Expected: `16 pass / 0 fail` for brand-logo, `14 pass / 0 fail` for product-icon — in particular the `has a description >= 200 chars` scenarios still pass.

- [ ] **Step 4: Full-suite gate**

Run: `bun run typecheck && bun run lint && bun test`

Expected: `140 pass / 0 fail`.

- [ ] **Step 5: Commit**

```bash
git add src/tools/find-brand-logo.ts src/tools/find-product-icon.ts
git commit -m "$(cat <<'EOF'
docs: enumerate advisory codes in tool descriptions

Both find_* tool descriptions now name every advisory code they can
emit and summarize the trigger in one clause each. This is the text
the LLM sees at tools/list time; keeping it current keeps caller
behavior correct without forcing a docs round-trip.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Extend `try-mcp.ts` with three regression scenarios (+ primer refresh)

**Goal:** The live-server regression suite gains three assertions covering the new advisories: both-at-once for Slack dark, `empty_result_filter_too_narrow` on `find_brand_logo`, and `query_matched_no_scored_results` on `find_product_icon`. Also refresh `docs/SESSION_PRIMER.md` in the same commit so it rides along with a real change (per the project's "no primer-only commits" rule — see [CLAUDE.md](../../../CLAUDE.md)).

**Files:**
- Modify: `scripts/try-mcp.ts`
- Modify: `docs/SESSION_PRIMER.md`

- [ ] **Step 1: Locate the Slack dark-surface scenario**

The existing scenario at `scripts/try-mcp.ts` around line 529 asserts all dark Slack results are `co_branded: true`. We extend its `expect` to also assert both advisories, rather than adding a fourth Slack scenario.

Edit `scripts/try-mcp.ts`. Replace the Slack dark-surface scenario (currently around lines 528–547) with:

```ts
  {
    label:
      "Slack dark-surface: all dark Slack results are co_branded=true + both advisories emitted",
    tool: "find_brand_logo",
    input: { brand: "slack", background: "dark" },
    expect: (out) => {
      const obj = asObject(out);
      const logos = asArray<{ co_branded: boolean }>(obj["logos"]);
      if (logos.length === 0) {
        throw new Error(`expected at least one dark Slack asset`);
      }
      for (const l of logos) {
        if (!l.co_branded) {
          throw new Error(
            `dark Slack result has co_branded=false — if a standalone dark Slack mark was added, ` +
              `update LEARNINGS.md and the find_brand_logo description.`,
          );
        }
      }
      const advisories = asArray<string>(obj["advisories"] ?? []);
      if (!advisories.includes("only_co_branded_for_requested_background")) {
        throw new Error(`expected advisory only_co_branded_for_requested_background`);
      }
      if (!advisories.includes("only_light_surface_standalone_available")) {
        throw new Error(`expected advisory only_light_surface_standalone_available`);
      }
    },
  },
```

- [ ] **Step 2: Add two new scenarios**

In `scripts/try-mcp.ts`, inside the `SCENARIOS` array, append two new scenarios immediately after the phase 3A `fetch_asset(destination_path...)` block (which currently ends around line 671). The outer pattern is the `...(() => { ... return [ ... ]; })(),` IIFE. Place the new scenarios as top-level entries right after that IIFE:

```ts
  // --------------------------------------------- Phase 3E advisory scenarios
  {
    label:
      "find_brand_logo(salesforce, background=dark, variant=__nope__) — advisory empty_result_filter_too_narrow",
    tool: "find_brand_logo",
    input: { brand: "salesforce", background: "dark", variant: "__nope__" },
    expect: (out) => {
      const obj = asObject(out);
      const logos = asArray(obj["logos"]);
      if (logos.length !== 0) throw new Error(`expected empty result, got ${logos.length}`);
      const advisories = asArray<string>(obj["advisories"] ?? []);
      if (!advisories.includes("empty_result_filter_too_narrow")) {
        throw new Error(`expected advisory empty_result_filter_too_narrow, got ${JSON.stringify(advisories)}`);
      }
    },
  },
  {
    label:
      "find_product_icon(query='xyzzy-plugh-nowhere') — advisory query_matched_no_scored_results",
    tool: "find_product_icon",
    input: { query: "xyzzy-plugh-nowhere" },
    expect: (out) => {
      const obj = asObject(out);
      const icons = asArray(obj["icons"]);
      if (icons.length !== 0) throw new Error(`expected empty icons, got ${icons.length}`);
      const advisories = asArray<string>(obj["advisories"] ?? []);
      if (!advisories.includes("query_matched_no_scored_results")) {
        throw new Error(
          `expected advisory query_matched_no_scored_results, got ${JSON.stringify(advisories)}`,
        );
      }
    },
  },
```

- [ ] **Step 3: Rebuild and run the regression suite**

Run: `bun run try:check`

Expected: `regression: 31/31 pass / 0 fail` (29 existing with the Slack one strengthened + 2 new top-level scenarios = 31 scenarios; the Slack scenario did not change count, only its `expect`). If the terminal reports a different count (e.g. 32), adjust the expected number in the commit message accordingly; do not adjust the test count by adding filler scenarios.

Note: the try-mcp harness auto-rebuilds `dist/` if missing, but after the source changes in Tasks 4–11 a stale `dist/` will give false passes. If you're unsure, run `bun run build` first, then `bun run try:check`.

- [ ] **Step 4: Full-suite gate**

Run: `bun run typecheck && bun run lint && bun test`

Expected: typecheck + lint exit 0. `bun test`: `140 pass / 0 fail` (unchanged — `scripts/try-mcp.ts` is not part of `bun test`).

- [ ] **Step 5: Update `docs/SESSION_PRIMER.md`**

The primer has a state table. Update these pieces:

Change the `*Last updated:*` line near the top of the "Current state" section from:

```
*Last updated: 2026-04-27 (phase-3A shipped)*
```

to:

```
*Last updated: 2026-04-27 (phase-3E shipped)*
```

In the state table, change the row for `main` from:

```
| `main` branch | Phases 1, 2, and 3A shipped; CI green. |
```

to:

```
| `main` branch | Phases 1, 2, 3A, and 3E shipped; CI green. |
```

Add a new row after the phase-3A row. The current phase-3A row looks like:

```
| MCP server phase 3A | **Shipped.** `fetch_asset(destination_path=…)` — single-call atomic download to absolute path, cache preserved (server copies, not moves). New `DestinationExists` error code. Response adds `cached_from` diagnostic field. 125 tests, 29 regression scenarios (`bun run try:check`), 7-call smoke (`bun run phase2:smoke`). |
```

Insert a new row immediately after it:

```
| MCP server phase 3E | **Shipped.** Typed `AdvisoryCode` catalogue (4 codes). `find_brand_logo` adds `only_light_surface_standalone_available` and `empty_result_filter_too_narrow`; existing `only_co_branded_for_requested_background` suppressed when `co_branded: true` is explicit. `find_product_icon` adds `empty_result_filter_too_narrow` and `query_matched_no_scored_results`. New `advisory.emitted` observability event per emission. 140 tests, 31 regression scenarios, 7-call smoke. |
```

Update the remaining-phase-3 row from:

```
| MCP server phase 3 (remaining) | In scope. npm publish pipeline, full docs set (per original spec §5.7), CI hardening (per §5.4.7), advisory symmetry. Separate specs when each turn comes. |
```

to:

```
| MCP server phase 3 (remaining) | In scope: npm publish pipeline (3B), full docs set (3C, per §5.7), CI hardening (3D, per §5.4.7). All four phase-3 specs exist on `main`; 3B/3C/3D plans not yet written. |
```

- [ ] **Step 6: Commit try-mcp + primer together**

```bash
git add scripts/try-mcp.ts docs/SESSION_PRIMER.md
git commit -m "$(cat <<'EOF'
test: try-mcp — 3 new advisory regression scenarios + primer refresh

- Slack dark-surface scenario (existing) now asserts BOTH advisories.
- New: find_brand_logo with impossible filter emits empty_result_filter_too_narrow.
- New: find_product_icon with nonsense query emits query_matched_no_scored_results.
- SESSION_PRIMER state table: row added for phase 3E, test counts bumped,
  remaining-phase-3 row narrowed to 3B/3C/3D.

Regression count: 29 → 31. bun test count: 125 → 140.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: commit lands, `git status --short` empty.

---

## Task 13: Final verification, optional LEARNINGS entry, open PR

**Goal:** Run every gate one more time, optionally capture any non-obvious findings in LEARNINGS.md, push the branch, open a PR.

**Files:**
- Modify (optional): `docs/LEARNINGS.md`

- [ ] **Step 1: Append a LEARNINGS entry (only if phase-3E surfaced a non-obvious finding)**

Add an entry only if something during this plan surprised you enough to cost real time. If nothing new came up, leave `LEARNINGS.md` alone — the file's worth is in its signal-to-noise ratio.

Candidate entries to consider writing if they apply:
- If `Set` + `sortAdvisories` vs. plain-array `.push` had a subtle ordering bug that cost you a test cycle, record it.
- If the `find_product_icon` handler refactor bit you with a strict-TS quirk (`exactOptionalPropertyTypes` on `match_score`?), record the workaround.
- If wiring `ctx.logger.emit` surfaced a ring-capacity issue or event-ordering surprise, record it.

If you add an entry, include a commit SHA pointer once the work is pushed. If you add nothing, skip straight to Step 2 — LEARNINGS's worth is signal-to-noise; silence is fine.

- [ ] **Step 2: Final full-suite verification**

Run all gates:

```bash
bun run typecheck && bun run lint && bun test && bun run try:check && bun run phase2:smoke
```

Expected:
- Typecheck: clean.
- Lint: clean.
- `bun test`: `140 pass / 0 fail` (125 baseline + 2 catalogue + 1 event + 5 find-brand-logo [tasks 5,6×2,7×2] + 5 find-product-icon [tasks 8×2, 9×3] + 2 emission events [task 10] = 140 — **verify empirically; if the count differs, note it in the PR body**).
- `try:check`: `31/31 pass / 0 fail`.
- `phase2:smoke`: 7 calls pass.

If any gate fails, stop and investigate. Do not push.

- [ ] **Step 3: Commit the LEARNINGS entry (only if you wrote one in Step 1)**

If Step 1 added content, commit it on its own:

```bash
git add docs/LEARNINGS.md
git commit -m "$(cat <<'EOF'
docs: LEARNINGS — <one-line summary of the finding>

<2–4 line detail>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

If Step 1 added nothing, skip this step entirely — the primer update already rode along with Task 12's try-mcp commit.

- [ ] **Step 4: Push the branch**

Run:

```bash
git push -u origin spec/phase-3e-advisory-symmetry
```

Expected: branch created on `origin`.

- [ ] **Step 5: Open the PR**

Run:

```bash
gh pr create --title "feat: phase 3E — advisory symmetry across find_* tools" --body "$(cat <<'EOF'
## Summary

- New typed `AdvisoryCode` catalogue (4 codes) in `src/advisories.ts`.
- `find_brand_logo` now emits `only_light_surface_standalone_available` and `empty_result_filter_too_narrow`, plus the existing `only_co_branded_for_requested_background` (now suppressed when `co_branded: true` is the caller's explicit ask).
- `find_product_icon` now emits `empty_result_filter_too_narrow` and `query_matched_no_scored_results`.
- New `advisory.emitted` observability event fired once per code per call.
- Tool descriptions updated to enumerate every code callers may see.

Bundled with this PR are the three other phase-3 specs (3B/3C/3D) as documentation-only commits ahead of the 3E implementation — each has its own future plan/PR.

## Test plan

- [x] `bun run typecheck` clean.
- [x] `bun run lint` clean.
- [x] `bun test` — 140 pass / 0 fail (baseline 125 + 15 new scenarios across catalogue, events, both find_* tools).
- [x] `bun run try:check` — 31 regression scenarios pass (Slack dark strengthened + 2 new top-level).
- [x] `bun run phase2:smoke` — 7 calls pass (unchanged).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Return the PR URL when done.

---

## Notes for the executor

- **Do not amend already-committed tasks.** If review feedback lands after Task N, add a new commit fixing it; do not rewrite history on a pushed branch.
- **If a test count in this plan disagrees with observed reality, trust the observed count and update the PR body.** The plan's counts are best-estimate at authoring time; the only count that matters is the one Bun prints.
- **If you add to LEARNINGS.md mid-plan** (e.g. Task 8's postFilterCount lint quirk bit you), fold the entry into Task 13's commit, not a separate commit.
- **If a task's "write the failing test" step passes on first run**, stop. Either the test is not actually covering the behavior you think (and you need to tighten it), or the implementation already exists and this task is redundant. Do not continue until the expected-failure is observed.
- **If the `advisory.emitted` event assertion in Task 10 produces different ordering** than expected (the order the handlers push codes into the Set), sort before comparing. The spec requires *emitted codes* be present; order within the ring buffer is handler-implementation-detail.
