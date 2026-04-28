# Session Primer

**Read this first.** This file is the entry point for a fresh session context. It tells you what the project is, where it stands today, where to find detail, and what will bite you if you skip the rest of the docs. It is short on purpose — five minutes of reading should be enough to orient.

---

## What this project is

`SF_Logos` hosts two things in one repo:

1. **A static Salesforce logo gallery** published to GitHub Pages at
   [dam.usefulto.me](https://dam.usefulto.me). All served files live under `site/`.
2. **`@usefulto/sf-logos-mcp`** — a TypeScript Node stdio MCP server that
   lets AI clients query the manifest and fetch logo/icon URLs.

The gallery is the source of truth for the assets. The MCP server is a
structured API on top of the same manifest.

## Current state (update when this changes)

*Last updated: 2026-04-27 (phase-3E shipped)*

| Thing | State |
|---|---|
| `main` branch | Phases 1, 2, 3A, and 3E shipped; CI green. |
| MCP server phase 1 | **Shipped.** 5 read-only tools. |
| MCP server phase 2 | **Shipped.** 6th tool `fetch_asset` (url / path / bytes; default path + png), on-disk cache under `<OS cache>/sf-logos-mcp/<manifest.lastUpdated>/<id>.<ext>`, `find_brand_logo` advisories (co-brand-only), `SIGUSR2` diagnostics snapshot. |
| MCP server phase 3A | **Shipped.** `fetch_asset(destination_path=…)` — single-call atomic download to absolute path, cache preserved (server copies, not moves). New `DestinationExists` error code. Response adds `cached_from` diagnostic field. 125 tests, 29 regression scenarios (`bun run try:check`), 7-call smoke (`bun run phase2:smoke`). |
| MCP server phase 3E | **Shipped.** Typed `AdvisoryCode` catalogue (4 codes). `find_brand_logo` adds `only_light_surface_standalone_available` and `empty_result_filter_too_narrow`; existing `only_co_branded_for_requested_background` suppressed when `co_branded: true` is explicit. `find_product_icon` adds `empty_result_filter_too_narrow` and `query_matched_no_scored_results`. New `advisory.emitted` observability event per emission. 143 tests, 31 regression scenarios, 7-call smoke. |
| MCP server phase 3 (remaining) | In scope: npm publish pipeline (3B), full docs set (3C, per §5.7), CI hardening (3D, per §5.4.7). All four phase-3 specs exist on `main`; 3B/3C/3D plans not yet written. |
| GitHub Pages | Served from `site/` via `.github/workflows/pages.yml`. Source = "GitHub Actions". |
| Dog-food | Phase-2 done 2026-04-27. Transcript: [`docs/dogfood/2026-04-27-dog-food-phase-2.md`](dogfood/2026-04-27-dog-food-phase-2.md). Findings folded into LEARNINGS.md. |

## Where to look for detail

- **Design spec:** [docs/superpowers/specs/2026-04-24-sf-logos-mcp-design.md](superpowers/specs/2026-04-24-sf-logos-mcp-design.md) — the full MCP server design across all three phases (phase-2 parts superseded; see next bullet).
- **Phase-2 scope revision:** [docs/superpowers/specs/2026-04-25-phase-2-scope-revision.md](superpowers/specs/2026-04-25-phase-2-scope-revision.md) — authoritative for phase 2. Supersedes the phase-2 portions of the original spec.
- **Phase 1 plan (executed):** [docs/superpowers/plans/2026-04-25-phase-1-foundation.md](superpowers/plans/2026-04-25-phase-1-foundation.md) — 29 TDD-shaped tasks.
- **Phase 2 plan (executed):** [docs/superpowers/plans/2026-04-25-phase-2-fetch-asset.md](superpowers/plans/2026-04-25-phase-2-fetch-asset.md) — 16 TDD-shaped tasks.
- **Phase 3A spec (executed):** [docs/superpowers/specs/2026-04-27-phase-3a-destination-path.md](superpowers/specs/2026-04-27-phase-3a-destination-path.md) — `fetch_asset(destination_path=…)` single-feature design.
- **Phase 3A plan (executed):** [docs/superpowers/plans/2026-04-27-phase-3a-destination-path.md](superpowers/plans/2026-04-27-phase-3a-destination-path.md) — 10 TDD-shaped tasks.
- **Learnings log:** [docs/LEARNINGS.md](LEARNINGS.md) — every non-obvious finding across every session. Read this before writing code.
- **Dog-food transcripts:** [docs/dogfood/](dogfood/) — verbatim records of real MCP-client sessions against the live server.
- **Project conventions:** [CLAUDE.md](../CLAUDE.md) — runtime, commit style, scope discipline, the Pages→`site/` invariant.
- **Architecture at a glance:** spec §5.1. Module tree under `src/`.

## Invariants that will bite you if you forget

1. **Pages serves only `site/`.** Anything else in the repo is private. Never move MCP source into `site/`, never move gallery assets out of it. Enforced by `scripts/check-pages-allowlist.sh`.
2. **`dist/` is never committed.** CI, tests, and smoke scripts build it on demand.
3. **`node_modules/` is never committed.** `bun install --frozen-lockfile` restores it from `bun.lock`.
4. **Strict TS flags are on.** `exactOptionalPropertyTypes` rejects explicit `undefined`, `noPropertyAccessFromIndexSignature` forces bracket access on index-signatured types. See LEARNINGS.md.
5. **Bundled manifest ≠ handwritten fixture.** Always exercise manifest-shape assertions against `src/bundled/manifest.json`. Product-icon entries omit `type`, `co_branded`, and `use_cases`; `toAssetSummary` defaults them. See LEARNINGS.md.
6. **MCP tool output is JSON-encoded text on the wire.** A tool returning `{"brands":[...]}` appears in the raw stdio bytes as `"\"brands\""`. Grep accordingly.
7. **`fetch_asset` defaults: `mode=path`, `format=png`.** Callers that want a raw URL must pass `mode: "url"` explicitly (revised from phase-1 spec). URL input only supports `mode: "url"` — path/bytes from a raw URL would need a non-id cache key.
8. **Cache root resolution order: `SFL_CACHE_ROOT` > `XDG_CACHE_HOME` > platform default.** Versioned by `manifest.lastUpdated`; a new manifest version starts a new directory and implicitly invalidates stale bytes.

## How to start real work in a new session

```bash
cd /Users/tal.golan/SF_Logos

# Confirm the tree is healthy before changing anything.
bun install
bun run typecheck && bun run lint && bun test

# Confirm the built server still boots and serves every tool end-to-end.
# 29 assertive scenarios hit the server via the real MCP SDK client.
bun run try:check

# (Also works: `bun run phase2:smoke` — 7 raw JSON-RPC calls.)

# Then read the user's request and the relevant docs above.
```

If any of those three steps fail, **stop and investigate** — don't start new work on top of a broken baseline.

## Commit discipline

- Conventional commits: `feat:`, `fix:`, `test:`, `chore:`, `docs:`, `ci:`.
- HEREDOC messages ending with `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
- One logical change per commit. Never amend a merged commit.
- If you change something that would have belonged in this primer, update this primer in the same commit.

---

## Maintenance rules for this file

This file earns its keep only if it stays current. When you finish work that changes any of the following, update this file **in the same commit**:

- **Phase state** (any row in the state table).
- **New invariant** discovered (add to the "Invariants" section if it would bite a fresh agent in their first 15 minutes; anything subtler goes in LEARNINGS.md only).
- **New authoritative doc** worth reading first (add a pointer).
- **"Last updated" line** — bump the date when you change any row in the state table.

**Do NOT** do any of the following in this file:

- Mirror long sections from the spec, plan, or LEARNINGS.md. Pointers, not copies.
- Record task-level detail (that's the plan's job).
- Record anything discoverable by reading recent code or `git log`.

**When removing content:** if a piece of advice here is no longer true, delete it immediately — stale guidance is worse than no guidance. Same rule as LEARNINGS.md.

If this file grows past ~150 lines, it's drifting from its purpose. Trim it.
