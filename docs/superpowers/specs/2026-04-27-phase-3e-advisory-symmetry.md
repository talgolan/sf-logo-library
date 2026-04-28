# Phase 3E — advisory symmetry

**Date:** 2026-04-27
**Supersedes:** nothing. **Extends:** phase-2 scope revision ([`2026-04-25-phase-2-scope-revision.md`](2026-04-25-phase-2-scope-revision.md)) — which introduced the `advisories` channel on `find_brand_logo` — and the original design ([`2026-04-24-sf-logos-mcp-design.md`](2026-04-24-sf-logos-mcp-design.md)) §2.
**Depends on:** nothing. Independent of 3B/3C/3D; can ship before, after, or between them.
**Authoritative for:** the set of advisory codes emitted by `find_*` tools. No other scope.

---

## TL;DR

Generalize the advisories channel. Today only `find_brand_logo` emits one advisory (`only_co_branded_for_requested_background`). Add symmetric counterpart advisories where the same reasoning applies:

1. `find_brand_logo` — add `only_light_surface_standalone_available` (mirror of the co-brand-only case, for callers that asked for dark but the only non-co-brand assets are light-surface).
2. `find_brand_logo` — add `empty_result_filter_too_narrow` (when filters AND-combine into zero results, explain which filter eliminated candidates).
3. `find_product_icon` — add `empty_result_filter_too_narrow` (same idea, different inputs).
4. `find_product_icon` — add `query_matched_no_scored_results` (when `query` is present, all `score > 0` candidates are filtered out by other constraints, and the result is empty even though the brand has icons).

Promote `advisories` from an ad-hoc string array to a documented, stable, catalogued vocabulary. Every advisory code has a fixed meaning, a documented trigger condition, and a test scenario. Downstream LLMs get machine-readable hints rather than prose-only signals.

## Motivation

Phase-2 dog-food (2026-04-27) surfaced the original advisory when the MCP SDK client searched for a Slack dark-surface standalone wordmark. The server returned only co-brand lockups; the advisory signaled *why* so the LLM could pick a sanctioned fallback (white card, co-brand, or ask the user) without parsing `co_branded` flags.

The pattern generalizes. Every `find_*` tool has input filters that AND-combine; any filter combination can yield zero results or a surprising subset. Without advisories:

- The LLM sees `{icons: []}` and must guess whether to relax the query, category, or background — often relaxes the wrong one first.
- Corrections take extra turns (dog-food Turn 11 showed this: a category filter eliminated an icon the user wanted, and the LLM retried with a different query rather than dropping the category).
- The tool description has to foreshadow every edge case in prose, which bloats the text LLMs see at `tools/list`.

Advisories invert the problem: the server *knows* exactly which filter caused the empty result; it tells the caller directly.

A secondary motivation: **the advisories channel is undertyped today.** It's a `string[]`. Phase 3E adds a typed union so adding a new code requires touching `src/advisories.ts` (the catalogue) and gets enforced by the compiler across every tool handler that might emit it. No more "did I spell it correctly?" bugs.

## Non-goals

- **No advisories for `fetch_asset`.** That tool's errors are terminal failures, not soft signals. No "you asked for PNG but only SVG exists" advisory — that's already `FormatUnavailable`. Advisories are for *successful* responses that carry machine-readable caveats.
- **No advisories for `list_brands`, `get_brand_colors`, `get_color_roles`.** These have single-input shapes with narrow failure modes; there's no informational gap worth filling.
- **No localization.** Codes are English stable identifiers. The prose that clients render is their problem.
- **No severity levels.** All advisories are informational (`info`-tier). If we ever need `warn`-tier, that's a separate spec.
- **No advisories on error responses.** Error shape is defined by §5.2; `advisories` lives on success responses only. Don't cross the streams.
- **No automatic user-prompting from advisories.** The server emits; the client decides what to do. Some advisories are purely diagnostic (`query_matched_no_scored_results` is useful in a log even if the LLM ignores it).
- **No back-compat fallback for unknown advisory codes.** Every code a client might see is listed in `docs/tools.md`. Unknown codes a client sees mean it's older than the server; that's a version skew to surface, not smooth over.

## Design decisions

| # | Question | Decision |
|---|---|---|
| Q1 | Where does the code catalogue live? | `src/advisories.ts` — a single file exporting a string-literal union type, a list of all codes, and per-code description metadata. Mirrors `src/errors.ts`. |
| Q2 | Should `advisories` be required on every response? | No. Remains optional: absent when no advisory applies. `exactOptionalPropertyTypes` rules apply. Rationale: backwards compatible with phase-2 behavior; easier for clients not parsing advisories. |
| Q3 | Shape: `string[]` vs `AdvisoryCode[]` vs `{code, detail}[]` | `AdvisoryCode[]` (typed string-literal union). Keep the wire shape simple — a string per entry — but enforce the spelling via TypeScript. No per-entry `detail` payload in v1; add later if a code needs structured data. |
| Q4 | Ordering of advisories in the array | Alphabetical by code. Deterministic output; easy to diff in tests. |
| Q5 | Multiple advisories at once | Allowed. If two apply, emit both. Tests cover the two-concurrent case for `find_brand_logo`. |
| Q6 | `empty_result_filter_too_narrow` — which filter to name? | Emitted only when `logos.length === 0` (or `icons.length === 0`) after filtering but non-zero before filtering, and at least one filter was supplied. No per-filter attribution in v1 — the code name is a category, not a pointer. Revisit if feedback shows it's not actionable enough. |
| Q7 | `query_matched_no_scored_results` — when does it fire? | When `query` is present AND non-empty, the brand has candidates after non-query filters, but every `scoreLogo(...)` returns 0. Distinct from `empty_result_filter_too_narrow` — the user typed a query and it matched nothing; relaxing a category filter won't help. |
| Q8 | Docs impact | `docs/tools.md` advisories appendix per affected tool (phase 3C formalized tool-doc structure; 3E adds content). `description` string in each tool lists the advisories it can emit. Phase 3D's `docs:check` can later enforce that every emitted advisory is documented. |
| Q9 | Backwards compatibility | Pure addition. Existing `find_brand_logo` emits + `find_product_icon` silence continue to work. No caller that ignored `advisories` breaks. |
| Q10 | Should advisories be observable in logs? | Yes — add an `advisory.emitted` event in `src/observability/events.ts`, one event per emission. Makes it debuggable from `SIGUSR2` snapshot and CI log tail. |

## Acceptance criteria

1. `src/advisories.ts` exports an `AdvisoryCode` string-literal union with exactly four members (see §"Advisory catalogue" below).
2. `find_brand_logo` can emit `only_co_branded_for_requested_background`, `only_light_surface_standalone_available`, or `empty_result_filter_too_narrow`.
3. `find_product_icon` can emit `empty_result_filter_too_narrow` or `query_matched_no_scored_results`.
4. Each advisory has at least one unit test that triggers it and at least one unit test that proves it is NOT emitted under an adjacent condition.
5. Emitted advisories are sorted alphabetically.
6. Every advisory emission writes an `advisory.emitted` event with `{ tool, code }` into the observability ring.
7. `docs/tools.md` (once phase 3C lands) has an "Advisories" subsection for both affected tools listing every possible code + trigger.
8. The `description` text for each affected tool enumerates advisories it can emit.
9. Regression: no change to existing phase-2 dog-food Slack-dark-surface scenario (`try:check`). The advisory that was there stays; new advisories are additive.
10. All gates pass: `bun run typecheck`, `bun run lint`, `bun test` (expected 125 → 133, +8 new scenarios), `bun run try:check` (29 → 32, +3 new regression scenarios), `bun run phase2:smoke` (7, unchanged).

## Advisory catalogue

### `only_co_branded_for_requested_background` (existing)

**Tool:** `find_brand_logo`
**When emitted:** `input.background` supplied, at least one result survives filtering, every surviving result has `co_branded: true`.
**Meaning:** No standalone mark exists for the requested background; every option is a Salesforce co-brand lockup. Sanctioned alternatives: place the light-surface mark on a white card, use the co-brand, or ask the user.
**Not emitted when:** `co_branded: true` was explicitly requested (the caller asked for co-brands; the fact that all results are co-brands is what they wanted).

### `only_light_surface_standalone_available` (new)

**Tool:** `find_brand_logo`
**When emitted:** `input.background === "dark"`, at least one non-co-brand mark exists for light background, zero non-co-brand marks exist for dark background. Emitted *in addition to* `only_co_branded_for_requested_background` when both apply.
**Meaning:** A brand standalone exists, but only for light surfaces. Callers that need a dark surface must place the light-surface mark on a contrasting background or use a co-brand.
**Not emitted when:** Dark-surface standalone marks exist.
**Example:** Slack today. Asking for `background: "dark"` on Slack returns only co-brand lockups; a light-surface standalone exists; both `only_co_branded_for_requested_background` AND `only_light_surface_standalone_available` fire.

### `empty_result_filter_too_narrow` (new, shared)

**Tools:** `find_brand_logo`, `find_product_icon`
**When emitted:**
- `find_brand_logo`: at least one optional filter (`background`, `co_branded`, `variant`, `preferred_only`) is supplied, the brand has logos, and the result is empty.
- `find_product_icon`: at least one filter beyond `query` (`category`, `keywords`, `background`) is supplied, the brand has candidates pre-filter, and the result is empty.
**Meaning:** The AND of filters excluded everything. Relaxing one filter is likely to produce results.
**Not emitted when:** The filtered set is non-empty, OR no filters were supplied at all (an empty result with no filters means the brand itself has no matching assets — that's a data fact, not a filter problem).

### `query_matched_no_scored_results` (new, product-icons-only)

**Tool:** `find_product_icon`
**When emitted:** `input.query` is non-empty-string, at least one candidate passes non-query filters, every candidate's `scoreLogo` returns 0 (no keyword / name / description / use_case match).
**Meaning:** The query itself didn't match anything in the filtered candidate set. Relaxing category/keywords/background won't help unless it lets the query score a new candidate; rewording the query is more likely to work.
**Not emitted when:** Query is absent, or at least one candidate scored above 0 (even if the final list was limited/sliced).

## Architecture

### New module: `src/advisories.ts`

```ts
/**
 * advisories — Catalogue of machine-readable advisory codes emitted
 * on successful responses from find_* tools.
 *
 * Responsibility: single source of truth for the AdvisoryCode union,
 * the list of all codes, and the per-code description metadata used
 * by docs generation and observability.
 * Errors: none — advisories are informational, not failures.
 * Dependencies: none.
 *
 * See docs/tools.md for the authoritative per-code trigger rules.
 */

export type AdvisoryCode =
  | "only_co_branded_for_requested_background"
  | "only_light_surface_standalone_available"
  | "empty_result_filter_too_narrow"
  | "query_matched_no_scored_results";

export const ALL_ADVISORY_CODES: readonly AdvisoryCode[] = [
  "empty_result_filter_too_narrow",
  "only_co_branded_for_requested_background",
  "only_light_surface_standalone_available",
  "query_matched_no_scored_results",
];

/**
 * Sort advisories alphabetically for deterministic output.
 * Handlers collect into a `Set<AdvisoryCode>`, then call this before
 * emitting on the response.
 */
export function sortAdvisories(codes: Set<AdvisoryCode>): AdvisoryCode[] {
  return Array.from(codes).sort();
}
```

### Type additions in `src/manifest/types.ts`

```ts
import type { AdvisoryCode } from "../advisories.js";

// No change to AssetSummary / AssetDetail.
// Tools define their own Output interfaces; only find_brand_logo and
// find_product_icon reference AdvisoryCode[].
```

### `src/tools/find-brand-logo.ts` changes

Replace `advisories?: string[]` with `advisories?: AdvisoryCode[]`.

Extend the advisory-detection block at the end of the handler:

```ts
const advisorySet = new Set<AdvisoryCode>();

if (input.background !== undefined && logos.length > 0 && logos.every((l) => l.co_branded)) {
  if (input.co_branded !== true) {
    advisorySet.add("only_co_branded_for_requested_background");
  }
}

if (input.background === "dark") {
  const darkStandalone = brand.logos.some((l) => l.background === "dark" && !l.co_branded);
  const lightStandalone = brand.logos.some((l) => l.background === "light" && !l.co_branded);
  if (!darkStandalone && lightStandalone) {
    advisorySet.add("only_light_surface_standalone_available");
  }
}

const filterSupplied =
  input.background !== undefined ||
  input.co_branded !== undefined ||
  input.variant !== undefined ||
  input.preferred_only === true;
if (filterSupplied && logos.length === 0 && brand.logos.length > 0) {
  advisorySet.add("empty_result_filter_too_narrow");
}

for (const code of advisorySet) {
  ctx.events.emit("advisory.emitted", { tool: "find_brand_logo", code });
}

const advisories = sortAdvisories(advisorySet);
return Promise.resolve({
  logos: logos.map((l) => toAssetSummary(l, brand)),
  ...(advisories.length > 0 ? { advisories } : {}),
});
```

Note the refinement on the existing advisory: it's now suppressed when `co_branded: true` was explicitly requested (per decision Q1). A behavior change that requires updating one existing test.

### `src/tools/find-product-icon.ts` changes

Add an `advisories?: AdvisoryCode[]` field to the output interface.

Extend the handler to compute and emit:

```ts
const advisorySet = new Set<AdvisoryCode>();

const queryTrimmed = input.query?.trim() ?? "";
const hasQuery = queryTrimmed.length > 0;
const nonQueryFilterSupplied =
  input.category !== undefined ||
  (input.keywords !== undefined && input.keywords.length > 0) ||
  input.background !== undefined;

// Count is the result just before `.slice(0, limit)`:
if (finalCount === 0 && nonQueryFilterSupplied && preFilterCandidateCount > 0) {
  advisorySet.add("empty_result_filter_too_narrow");
}
if (finalCount === 0 && hasQuery && postFilterCandidateCount > 0) {
  advisorySet.add("query_matched_no_scored_results");
}

for (const code of advisorySet) {
  ctx.events.emit("advisory.emitted", { tool: "find_product_icon", code });
}

const advisories = sortAdvisories(advisorySet);
// ...attach to Promise.resolve response, same shape as find_brand_logo.
```

Implementation detail: today's `find_product_icon` branches between scored and non-scored output. Phase 3E refactors the handler to compute `candidates`, `scored`, and `finalResults` in a single flow so advisory logic can see each count. No behavior change for non-empty responses.

### `src/observability/events.ts` changes

Add `advisory.emitted` to the event type union:

```ts
type EventName =
  | "server.boot"
  | "tool.call"
  // ...existing...
  | "advisory.emitted";

interface AdvisoryEmittedPayload {
  tool: "find_brand_logo" | "find_product_icon";
  code: AdvisoryCode;
}
```

Ring capacity and `SIGUSR2` output unchanged.

## Testing strategy

Four test layers.

### Unit: `src/advisories.ts` (new tests)

`test/advisories.test.ts` (new — 2 scenarios)

1. `ALL_ADVISORY_CODES` contains exactly 4 members (regression guard; test updates with each new code).
2. `sortAdvisories(set)` produces alphabetical ordering for a multi-element set.

### Integration: `test/tools/find-brand-logo.test.ts` (extended — 4 scenarios)

1. **`only_co_branded_for_requested_background` still fires** — Slack + `background: "dark"` → advisory present. (Regression, not new.)
2. **New: advisory suppressed when `co_branded: true` was explicitly requested** — Slack + `background: "dark"` + `co_branded: true` → no `only_co_branded_*` advisory (caller got what they asked for). Behavior change test.
3. **New: `only_light_surface_standalone_available` fires for Slack dark** — Slack + `background: "dark"` → advisory present (paired with existing one).
4. **New: `empty_result_filter_too_narrow` fires** — Salesforce + `background: "dark"` + `variant: "NonexistentString"` → empty logos array + advisory present.
5. **New: `empty_result_filter_too_narrow` NOT fired when no filters supplied** — a brand with zero logos (hypothetical fixture) + no filters → empty, no advisory.

### Integration: `test/tools/find-product-icon.test.ts` (extended — 4 scenarios)

1. **`empty_result_filter_too_narrow` fires** — `category: "Data"` + `keywords: ["nonexistent"]` → empty + advisory.
2. **`empty_result_filter_too_narrow` does NOT fire when no filters** — the `{}` input case already raises `InvalidInput`, so this is implicitly covered by the `InvalidInput` path.
3. **`query_matched_no_scored_results` fires** — `query: "xyzzy-plugh-nowhere"` → empty + advisory. Non-query filters left unset (so `empty_result_filter_too_narrow` does NOT fire even though result is empty).
4. **Both advisories fire together** — `query: "xyzzy-plugh-nowhere"` + `category: "AI"` → empty + both advisories.
5. **Advisories absent on success** — `query: "agentforce"` → results found + no advisories.

### Observability: `test/observability/events.test.ts` (extended — 1 scenario)

1. Emitting an advisory writes an `advisory.emitted` event to the ring with matching `tool` and `code`.

### Regression: `scripts/try-mcp.ts` (+3 scenarios)

1. `find_brand_logo({brand:"slack", background:"dark"})` — asserts *both* `only_co_branded_for_requested_background` AND `only_light_surface_standalone_available` present.
2. `find_brand_logo({brand:"salesforce", background:"dark", variant:"__NOPE__"})` — asserts `empty_result_filter_too_narrow` present, `logos: []`.
3. `find_product_icon({query:"xyzzy-plugh-nowhere"})` — asserts `query_matched_no_scored_results` present, `icons: []`.

Regression count: 29 → 32.

### What we deliberately do NOT test

- The prose rendering of advisories by any client (client responsibility).
- Absence of advisories on `fetch_asset` / `list_brands` / `get_brand_colors` / `get_color_roles` (spec-level decision; no tests needed).

### Test counts (phase 3E delta)

| Layer | Before | After | Δ |
|---|---|---|---|
| `test/advisories.test.ts` (new) | 0 | 2 | +2 |
| `test/tools/find-brand-logo.test.ts` (ext) | varies | +4 | +4 |
| `test/tools/find-product-icon.test.ts` (ext) | varies | +4 | +4 |
| `test/observability/events.test.ts` (ext) | varies | +1 | +1 |
| **Unit/integration total** | **125** | **~136** | **+11** (some overlaps with existing; plan confirms) |
| `scripts/try-mcp.ts` scenarios | 29 | 32 | +3 |

*(Delta shown is best-estimate; plan execution may consolidate a scenario if redundant.)*

## Documentation impact

### `docs/tools.md` (once phase 3C lands)

Each affected tool section gains an "Advisories" subsection:

- Code name (H4).
- Trigger condition (prose).
- Recommended caller response (prose).
- Co-emission notes (e.g. Slack dark emits two advisories).

### Tool `description` strings

Both tools' `DESCRIPTION` constants gain a paragraph listing emitted advisory codes. Example for `find_brand_logo`:

> "This tool may emit `advisories` (optional string array) on success. Possible codes: `only_co_branded_for_requested_background`, `only_light_surface_standalone_available`, `empty_result_filter_too_narrow`. See docs/tools.md for trigger rules."

Keeps the LLM informed at tool-discovery time; keeps the doc authoritative for detail.

### `docs/LEARNINGS.md`

Add an entry capturing the design rationale: why advisories are additive to success responses, why we chose a typed union, why no `detail` payload in v1.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Advisory proliferation — every new edge case becomes a new code | Keep the catalogue small; prefer `empty_result_filter_too_narrow` as a general "your filters narrowed to zero" rather than per-filter codes. Add a code only when downstream LLMs consistently pick the wrong recovery. |
| `only_co_branded_*` behavior change (now suppressed when `co_branded: true` asked) breaks an existing caller | Dog-food showed no caller relied on the advisory firing when co-branded was explicitly requested. Low risk; documented in CHANGELOG. |
| Two advisories firing simultaneously is confusing | Documented explicitly in `docs/tools.md` with the Slack example. The test `find-brand-logo.test.ts` scenario 3 locks the co-emission contract. |
| `empty_result_filter_too_narrow` fires on legitimate "this brand has no logos" edge | Guarded by `brand.logos.length > 0` check: we only advise when the brand *had* candidates and filters narrowed them to zero. |
| `query_matched_no_scored_results` and `empty_result_filter_too_narrow` both fire when query + filters both narrow to zero | Intentional: both are true. The caller has two tools for recovery. Tested in scenario 4. |
| A new advisory is added without updating `docs/tools.md` | Phase 3D's `docs:check` (once it lands) can enforce this; meanwhile PR review is the gate. |

## Open questions (resolved during brainstorming)

| # | Question | Decision |
|---|---|---|
| Q-scope | Which advisories in this phase? | Four: the existing one + three new (two on brand-logo, two on product-icon, one shared). |
| Q-shape | Wire shape | `AdvisoryCode[]`, stable strings, sorted alphabetically. |
| Q-suppress | Suppress existing advisory when co-brand explicitly requested? | Yes. Current behavior emits unnecessarily; fix in same phase. |
| Q-details | Per-advisory `details` payload? | No in v1. Revisit if a code proves insufficiently specific. |
| Q-future | Advisory-based client warnings (e.g. tool result badges)? | Out of scope. Clients decide. |

## Out of scope (filed separately)

- **`list_brands` / `get_brand_colors` / `get_color_roles` advisories.** These tools have no informational-gap failure modes today. If one emerges, a separate spec.
- **Advisory i18n.** Codes are English-stable; prose is caller-side.
- **Telemetry aggregation of advisory emissions across a session.** The `advisory.emitted` event is per-call; aggregation is a future observability task, not a tool-surface change.

## Order of operations within the plan

1. **Catalogue first.** Write `src/advisories.ts` + `test/advisories.test.ts`. Commit.
2. **Observability hook.** Add `advisory.emitted` event type + test. Commit.
3. **Refactor `find_brand_logo`** to typed advisories + new codes + behavior change. Commit.
4. **Refactor `find_product_icon`** to typed advisories + new codes. Commit.
5. **Update tool descriptions** (both files). Commit.
6. **Extend `try-mcp.ts`** with three new regression scenarios. Commit.
7. **Update LEARNINGS + SESSION_PRIMER** in the final commit of the series, alongside the last code change per the project's "no primer-only commits" rule.

Each step leaves the tree green. Gate between steps: `bun run typecheck && bun run lint && bun test && bun run try:check`.
