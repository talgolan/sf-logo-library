# Phase 3C — full documentation set

**Date:** 2026-04-27
**Supersedes:** the stub `README.md` created in phase 3B.
**Extends:** original design ([`2026-04-24-sf-logos-mcp-design.md`](2026-04-24-sf-logos-mcp-design.md)) §5.7 ("Documentation requirements"). Keeps phase 3D's `docs:check` contract in view so the docs are testable when phase 3D lands.
**Authoritative for:** every user-facing `.md` file shipped with the package and referenced from the npm page. `docs:check` implementation (phase 3D) and advisory-symmetry docs (phase 3E) are out of scope.

---

## TL;DR

Turn the repo's documentation from "SESSION_PRIMER + LEARNINGS + specs" (internal) into a user-shaped set: a polished `README.md` that's the npm landing page; `docs/getting-started.md` for first-use; `docs/tools.md` as the tool reference; `docs/architecture.md` for people reading the source; `docs/metadata-shape.md` + `docs/aspect-ratio.md` for the tricky shared contracts; `docs/contributing.md` for maintainers. Every code file gets the header comment described in §5.7. Nothing that has to be auto-generated is auto-generated in this phase — phase 3D adds the `docs:check` CI step.

## Motivation

Today the `SF_Logos` repo has **no user-facing documentation.** `README.md`, `CHANGELOG.md`, and `LICENSE` are all produced by phase 3B as stubs — enough to publish, not enough to explain anything. Anyone who installs `@usefulto/sf-logos-mcp` from npm today lands on a 60-line stub README with no way to answer:

- How do I point Claude Desktop / Cursor / Cline at this?
- What does `fetch_asset(mode=bytes)` return and how big can it get?
- Why does `find_brand_logo` sometimes return `advisories: ["only_co_branded_for_requested_background"]` and what do I do about it?
- What's in the on-disk cache and when does it get cleaned up?

Docs have been deferred twice (phase 1 plan §14 punts; phase 2 plan defers to phase 3). Phase-2 dog-food (2026-04-27) surfaced real ergonomics questions that the spec already answered — but only because the author was present. Every future user session starts from zero without this phase.

A secondary motivation: **tool descriptions are production-critical LLM copy.** Every tool's `description` string is what the calling LLM sees at `tools/list` time. Phase-2 dog-food showed the LLM choosing `mode="bytes"` then `mode="path"` because the description didn't foreground the tradeoff. Phase 3C rewrites those strings with the same care as the prose docs.

## Non-goals

- **No auto-generated tool reference.** The original spec §5.7 calls for `docs/tools.md` to have an auto-regenerated section. Doing that correctly needs `docs:check` (phase 3D) to enforce freshness. This phase writes the full reference by hand; phase 3D adds the generator + CI gate.
- **No per-client integration guide fork.** Claude Desktop, Cursor, Cline, Zed, continue.dev — they have different config shapes. We write *one* canonical MCP config block and link to each client's own MCP config docs rather than forking.
- **No i18n.** English only.
- **No screencast / animated demo.** Copy-paste-runnable examples only. A GIF in the README is tempting but rots faster than the text.
- **No rewriting of `docs/SESSION_PRIMER.md` or `docs/LEARNINGS.md`.** Those are internal agent-handoff docs, not user docs. They keep their current shape.
- **No `docs/faq.md` yet.** Revisit when we have real repeat-asked questions from users. Writing an FAQ preemptively is cargo-cult.

## Design decisions

| # | Question | Decision |
|---|---|---|
| Q1 | Scope of docs shipped in the npm tarball | `README.md`, `CHANGELOG.md`, `LICENSE` only. `docs/*` lives in the repo and is linked from the README but not in the tarball. Keeps tarball small; links resolve on GitHub. |
| Q2 | Tool reference format | One `docs/tools.md` file with one section per tool (6 sections). Tool-level description, input schema, output schema, error codes, example input → example output. |
| Q3 | Metadata-shape doc location | Separate `docs/metadata-shape.md` as the single source of truth for `AssetSummary` / `AssetDetail`. Every other doc that mentions a field links here instead of re-specifying. |
| Q4 | Aspect ratio doc | `docs/aspect-ratio.md` — explains why the manifest omits dimensions and how callers compute them. Referenced from the `fetch_asset` section in `docs/tools.md`. |
| Q5 | MCP client config snippet | One canonical block using `npx -y @usefulto/sf-logos-mcp`. Points at each client's own setup docs for where to put it. No maintained per-client instructions. |
| Q6 | Code-level file headers | Add now, as part of this phase. `docs:check` (phase 3D) will verify them. |
| Q7 | TSDoc on exported symbols | Add now. Phase 3D's `docs:check` enforces. |
| Q8 | Examples in docs use real asset IDs | Yes — `icon-agentforce`, `slack`, `salesforce` are the canonical examples. All IDs used in docs must exist in `src/bundled/manifest.json`. |
| Q9 | Versioned tool reference | No. The tool reference tracks `main`. Users on older versions can consult the repo at their version tag. |
| Q10 | Docs-for-docs (style guide) | A short style note in `docs/contributing.md` (executable examples, no AI-trope sentence patterns, link to upstreams rather than paraphrase). Not a separate doc. |

## Acceptance criteria

1. `npm view @usefulto/sf-logos-mcp` shows a polished README (the stub is replaced).
2. A first-time user can go from `npm install` to a working MCP tool call in under 5 minutes using only `README.md` and `docs/getting-started.md`.
3. Every tool in `src/tools/` has a corresponding section in `docs/tools.md` with matching input/output schemas.
4. Every exported symbol in `src/**/*.ts` has a TSDoc block.
5. Every `src/**/*.ts` file has the §5.7 file-header comment block.
6. Every Markdown link in the new docs resolves (checked manually in this phase; phase 3D automates).
7. The six tool `description` strings in `src/tools/*.ts` each exceed 200 characters and match their `docs/tools.md` sections.
8. All example inputs in the docs actually produce the shown outputs when run against `main` (verified by re-running through `try-mcp.ts` in a one-off pass; phase 3D may automate).
9. Phase-3A gates continue to pass: `bun run typecheck`, `bun run lint`, `bun test` (125), `bun run try:check` (29), `bun run phase2:smoke` (7).

## File inventory

### Docs shipped in the tarball (updated in this phase)

| File | Phase 3B state | Phase 3C state |
|---|---|---|
| `README.md` | 60-line stub | ~250-line polished landing page |
| `CHANGELOG.md` | Keep-a-Changelog, `[Unreleased]` empty | Conventions doc in `docs/contributing.md` references it; format unchanged |
| `LICENSE` | MIT text | Unchanged |

### Docs in the repo (new or rewritten in this phase)

| File | State before | State after |
|---|---|---|
| `docs/getting-started.md` | Does not exist | New (~150 lines). First-use walk-through per client. |
| `docs/tools.md` | Does not exist | New (~400 lines). Full per-tool reference. |
| `docs/architecture.md` | Does not exist | New (~200 lines). Module diagram + request lifecycle + cache layout. |
| `docs/metadata-shape.md` | Does not exist | New (~120 lines). `AssetSummary` / `AssetDetail` canonical reference. |
| `docs/aspect-ratio.md` | Does not exist | New (~80 lines). Why no dimensions, how to compute. |
| `docs/contributing.md` | Does not exist | New (~120 lines). Dev setup, PR flow, publish flow, commit conventions, style notes. |
| `docs/SESSION_PRIMER.md` | Exists (internal) | Unchanged in shape; state row updated when phase 3C ships. |
| `docs/LEARNINGS.md` | Exists (internal) | Unchanged in shape; extended in-place if phase 3C surfaces learnings. |

### Code files (every `src/**/*.ts` touched for headers)

Every module in `src/` gains a §5.7-compliant header comment. Every exported symbol gains a TSDoc block. No runtime-behavior changes.

Rough scope from phase-3A tree:

```
src/assets/cache.ts
src/assets/destination.ts
src/assets/fetch.ts
src/bundled/manifest.json                # no header; it's JSON
src/bundled/version.ts
src/cli/diagnostics.ts
src/errors.ts
src/manifest/loader.ts
src/manifest/types.ts
src/observability/events.ts
src/observability/logger.ts
src/server.ts
src/tools/fetch-asset.ts
src/tools/find-brand-logo.ts
src/tools/find-product-icon.ts
src/tools/get-brand-colors.ts
src/tools/get-color-roles.ts
src/tools/list-brands.ts
```

Some of these already have partial headers from phase 1 and phase 2. The plan task list will audit and fill gaps, not rewrite existing good headers.

## README.md (full spec)

Target length: ~250 lines.

### Sections (in order)

1. **One-line pitch.** "MCP server that gives AI clients structured access to the unofficial Salesforce logo gallery at dam.usefulto.me."
2. **Install + run.** `npx -y @usefulto/sf-logos-mcp` one-liner.
3. **MCP client config.** The canonical JSON block for `mcpServers.sf-logos`. Links to Claude Desktop / Cursor / Cline / Zed setup docs with "drop the block above into X" instruction.
4. **Tools.** Bullet list of all six tools with one-line descriptions. Each bullet links to the matching `docs/tools.md` section.
5. **Example usage.** Three short LLM-style excerpts: "Show me Salesforce's colors," "Find the Agentforce icon," "Download the Slack logo to my Desktop." Each shows the tool call(s) the MCP client made.
6. **What's in the manifest.** One paragraph pointing at the gallery.
7. **Runtime requirements.** Node ≥ 20. MCP client that speaks stdio transport.
8. **Cache.** One paragraph on cache location (mention `SFL_CACHE_ROOT`), versioning, safety. Link to `docs/architecture.md#cache`.
9. **Troubleshooting.** Three bullet list of common failures (bad MCP config, bundled manifest age, cache permission errors). Each points at `docs/getting-started.md#troubleshooting`.
10. **Links.** Gallery, docs index, changelog, issues, license.
11. **Disclaimer.** Verbatim the manifest's disclaimer text (unofficial / not affiliated / trademarks). Legally the most important block; keep it unambiguous and not buried.

### Style constraints

- No emoji.
- No AI-trope sentence patterns (no "Here's the kicker," no "Think of it as," no triple-repeated sentence structures — see global CLAUDE.md writing guide).
- Code blocks are copy-paste-runnable.
- Links use Markdown reference syntax for anything cited more than once.

## docs/getting-started.md (full spec)

Target length: ~150 lines.

Sections:

1. **What you need.** Node ≥ 20, an MCP client.
2. **Install.** `npx` vs `npm install -g`. When to pick which.
3. **Configure your client.** Canonical MCP config JSON + where each supported client stores it (path per OS). Claude Desktop, Cursor, Cline, Zed, continue.dev. One subsection per client, ≤ 15 lines each.
4. **First call.** Walk-through: ask the LLM "List the brands in the Salesforce logo gallery." Show the expected `list_brands` tool call and the brand list that comes back.
5. **Second call.** "Download the Agentforce icon to my Desktop." Show the `fetch_asset(id=..., destination_path=...)` call and response. Mentions the phase-3A single-call ergonomics.
6. **Cache behavior.** One paragraph on cache location (OS default + env var), cache versioning, how to wipe it.
7. **Troubleshooting.**
   - "MCP client can't find the server" → check config path, restart client.
   - "Tool returns `FetchFailed`" → check network; manifest is bundled, but assets are CDN-fetched on demand.
   - "Tool returns `DestinationExists`" → pick a new filename; v1 has no overwrite flag.
   - "I'm on Bun and `bun install` complains" → use Node runtime for the CLI; Bun is dev-only.
8. **Next.** Link to `docs/tools.md` (full reference) and `docs/architecture.md` (internals).

## docs/tools.md (full spec)

Target length: ~400 lines.

Structure: one H2 per tool, six total. Each section:

- **Purpose** — one paragraph.
- **Input schema** — JSON code block.
- **Output schema** — JSON code block.
- **Error codes** — table: code, when it's thrown, `details` payload.
- **Example call** — JSON-RPC request + response.
- **Notes** — selection rules, edge cases, advisories (after phase 3E lands for the tools that get them).

Tools in order: `list_brands`, `get_brand_colors`, `get_color_roles`, `find_brand_logo`, `find_product_icon`, `fetch_asset`. `fetch_asset` is longest (all three modes, `destination_path`, cache semantics).

### Handwritten reference, not auto-generated

This phase writes every section by hand. Phase 3D adds an auto-generator that asserts the file matches `src/tools/*.ts`. Until then, any tool change is a two-file change (code + docs), enforced by code review only.

## docs/architecture.md (full spec)

Target length: ~200 lines.

Sections:

1. **Module tree.** Directory layout with one-line purpose each.
2. **Request lifecycle.** ASCII diagram: stdin → `server.ts` dispatcher → tool handler → manifest/cache/fetch/observability → stdout. One paragraph per hop.
3. **Manifest loading.** Bundled-first strategy, lazy refresh, TTL, fallback. Pointers to `src/manifest/loader.ts`.
4. **Cache layout.** Path resolution (`SFL_CACHE_ROOT` > `XDG_CACHE_HOME` > platform default), versioning by `manifest.lastUpdated`, directory structure, atomic write discipline, the "second hit is free" invariant.
5. **fetch_asset orchestration.** Four branches (url / path / bytes / destination_path), input exclusivity rules, where validation lives. Same structure as phase-3A spec §"Architecture" but leaner.
6. **Error propagation.** SfLogosError taxonomy, how `server.ts` converts to MCP error responses.
7. **Observability.** Log channels, event ring, `SIGUSR2` snapshot. Pointer to `docs/troubleshooting.md` once we have one.
8. **GitHub Pages separation.** Why `site/` is partitioned, allowlist script, never-mix-the-two invariant.

## docs/metadata-shape.md (full spec)

Target length: ~120 lines.

One H2 per type. Each section:

- TypeScript type definition (copied from `src/manifest/types.ts`, kept in sync manually for now).
- Field-by-field rules table. Field | Type | Required | Meaning | Examples.
- Why-notes for the non-obvious fields: `preferred_format`, `brand_colors_hint`, the omission of `type` on product icons, `co_branded`.

## docs/aspect-ratio.md (full spec)

Target length: ~80 lines.

Content:

- Why the manifest omits dimensions (upstream gallery intentionally decouples).
- The "pick one basis" algorithm (width-basis vs height-basis; the caller decides).
- Examples per destination: HTML `<img>` with `width` only, python-pptx `add_picture` with `width=` in EMUs, Google Slides API `pageElement.size`.
- The client-side aspect-ratio-preservation rule: never set both width and height to values that don't match the source ratio.

## docs/contributing.md (full spec)

Target length: ~120 lines.

Sections:

1. **Dev setup.** Bun install, run the gates.
2. **Test layers.** Unit / integration / server / regression. When to add what.
3. **Commit conventions.** Conventional commits, HEREDOC bodies, co-author trailer, one logical change per commit.
4. **PR flow.** Fork-or-branch, `main` is the integration branch, CI gates (from phase 3D once live).
5. **Changelog discipline.** Every `src/` or tool-contract change updates `[Unreleased]`.
6. **Bundled manifest refresh.** When and how (`bun run refresh-manifest`); checksum expectations.
7. **Publish flow.** Link to phase 3B release playbook.
8. **Writing style notes.** Short list of anti-patterns from the global CLAUDE.md: no AI tropes, executable examples, link upstream rather than paraphrase.

## Code-level documentation additions

### File headers

Format (from original spec §5.7):

```ts
/**
 * <module name> — <one-line purpose>
 *
 * Responsibility: what this module owns. What it does NOT own.
 * Inputs: what callers pass in.
 * Outputs: what callers get back.
 * Errors: which SfLogosError codes it can throw.
 * Dependencies: which other src/ modules it imports (names only).
 *
 * See docs/architecture.md for how this fits into the request lifecycle.
 */
```

Phase-3A `src/assets/destination.ts` already has this header. Phase 3C audits every other file; adds where missing, edits where stale.

### TSDoc on exports

Every `export function` / `export const` / `export type` / `export interface` / `export class` in `src/` gets a TSDoc block:

- One-line summary (first line).
- Longer description when the summary isn't enough.
- `@param` per parameter, naming unit / format / constraint.
- `@returns` describing shape.
- `@throws` listing SfLogosError codes (not generic `Error`).
- `@example` when input shape is non-trivial.

### Tool-description parity

The `description` string in every `src/tools/*.ts` file is rewritten to:

- Exceed 200 characters (enforced by phase 3D).
- Match the corresponding `docs/tools.md` section's summary.
- State selection rules, input interactions, and every error code.

This is the single text the LLM sees at tool-discovery time; phase-2 dog-food showed it matters.

## Testing strategy

This phase is primarily prose. Three kinds of verification:

### Gate 1: the usual

`bun run typecheck`, `bun run lint`, `bun test`, `bun run try:check`, `bun run phase2:smoke`. No new test scenarios; existing ones must not regress.

### Gate 2: link check

Every Markdown link in the new docs is manually followed once during plan execution. Broken internal links block the phase. External links (to Salesforce, MCP spec, Keep-a-Changelog) are checked once, accepted to rot. Phase 3D automates this with `docs:check`.

### Gate 3: example-call fidelity

Every example JSON-RPC request in `docs/tools.md` and `docs/getting-started.md` is run through the live server once during plan execution; the actual output is diffed against the documented output. If they differ, the doc is wrong and gets fixed (or the code, if the example reveals a bug). Not automated in this phase.

### Gate 4: new engineer smoke (informal)

Ask a fresh agent (or a human who hasn't seen this codebase): "Install and configure `@usefulto/sf-logos-mcp`, then tell me what brands are in the gallery." They should succeed using only the docs. Record any friction in LEARNINGS.md.

## Architecture impact

No runtime changes. No test changes. `src/**/*.ts` gets header comments and TSDoc; behavior is unchanged.

Build output is unaffected: TSDoc blocks compile to JSDoc in `dist/` and are part of the declaration files — an improvement for IDE hover on installed users, at zero runtime cost.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Docs drift from code between phase 3C and phase 3D's automation | Phase 3D's `docs:check` is the long-term answer. Until then, PR reviewers explicitly check docs for any code change touching a public contract. Plan commits the specific line "tool contract change → update docs/tools.md in same PR" to `docs/contributing.md`. |
| README bloats every subsequent phase | Keep a hard length target (~250 lines). When adding, remove something first. |
| Example JSON in docs goes stale silently | Gate 3 catches it once. Phase 3D's plan includes automating a subset of example checks. |
| Writing style drifts back toward AI tropes | `docs/contributing.md` style section is the written standard. Use it during review. |
| Tool descriptions and `docs/tools.md` sections diverge | Both rewritten in the same task of the plan; phase 3D enforces. |

## Out of scope (other phase-3 specs)

- **Phase 3D** — CI hardening, including `docs:check` and auto-generated tool reference.
- **Phase 3E** — advisory symmetry; once it ships, `docs/tools.md` sections for affected tools are updated in that spec's plan.

## Acceptance preview for phase 3D

Phase 3D will add `docs:check` as CI step 9 (per original spec §5.4.7). To minimize churn later, phase 3C writes docs in a shape 3D's checker can ratify:

- All file headers follow the §5.7 template exactly.
- All tool descriptions exceed 200 characters.
- All Markdown links use Markdown syntax (no bare URLs where links are expected).
- `docs/tools.md` per-tool section order matches `src/tools/*.ts` export order.
- Example inputs are literal JSON (parseable), not prose.

If 3D surfaces a structural mismatch, 3C's spec is the first place to revisit.
