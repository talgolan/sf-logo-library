# Phase 2 scope revision (post-dog-food)

**Date:** 2026-04-25
**Informed by:** `docs/dogfood/2026-04-25-claude-desktop-transcript.md`
**Supersedes:** phase 2 portions of `docs/superpowers/specs/2026-04-24-sf-logos-mcp-design.md` (original spec) — only the changes below apply. Everything not mentioned here remains as the original spec describes.

## TL;DR

Dog-food data from a 9-prompt Claude Desktop session shows three things: (1) `fetch_asset` is the single biggest ergonomic gap, confirmed; (2) the LLM does aspect-ratio math correctly unaided, so server-side dimension computation is over-engineering; (3) nothing in the session needed a diagnostics tool — observability events alone did the job.

Phase 2 is leaner as a result.

## Changes from the original spec

### 1. `fetch_asset` — confirmed. Simplify the input.

**Original spec** (`design.md` §2, `fetch_asset` row):
```
target_width?:  int px — derive height.
target_height?: int px — derive width.
(mutually exclusive; supplying both raises InvalidDimensions.)
```

**Revised:** drop `target_width` and `target_height` entirely. The response always includes `aspect_ratio` and (when the served format is SVG) `svg_intrinsic`; the LLM does the arithmetic. The `InvalidDimensions` error code also drops — nothing produces it.

**Rationale:** Prompt 6 of the dog-food ("MuleSoft at 300px wide") showed the LLM correctly computing heights for three MuleSoft assets with very different proportions (standalone 1.0079, two lockups 2.9809), AND flagging the layout problem of mixing a square and a wordmark in one row. Server-side math would add surface area for a problem that isn't failing.

If real usage later shows the LLM getting it wrong, add these params back. Until then, don't.

### 2. `fetch_asset` — lead with `mode: "path"` + PNG

**Rationale:** The dog-food pptxgenjs build (Prompt 5) downloaded SVGs, rasterized them with `sharp`, then fed local PNGs to pptxgenjs. The middle step (rasterize) vanishes if `fetch_asset` returns a local path and defaults to the PNG variant when the caller hasn't expressed a preference.

**Revised behavior of `fetch_asset`:**
- `mode` default stays `"path"` as spec'd.
- `format` default: if caller omits `format`, return PNG when available (was: SVG). Rationale: the primary consumer (pptxgenjs, Google Slides API, python-pptx) wants PNG. Power users who want SVG pass `format: "svg"` explicitly.
- Bytes and URL modes unchanged.

No server-side rasterization of SVG. The manifest already ships both formats for every asset; we route, not transform.

### 3. Diagnostics tool — out of scope for phase 2

**Original spec** (`design.md` §5.3.7): `diagnostics` MCP tool gated by `SFL_DIAGNOSTICS=1` + `SIGUSR2` snapshot handler.

**Revised:**
- Keep the `SIGUSR2` handler — it's a few lines and costs nothing.
- Remove the `diagnostics` MCP tool from phase 2. Add it to the phase 3 backlog, or delete it if phase 3 never needs it.

**Rationale:** Nothing in the dog-food transcript would have been improved by an in-band diagnostics tool. Observability events + the ring buffer are sufficient; if a user ever needs to inspect counters, `SIGUSR2` is already available.

### 4. `find_brand_logo` — add an `advisories[]` annotation

**New behavior:** when `background` is supplied and every result has `co_branded: true`, the response includes:

```json
{
  "logos": [...],
  "advisories": ["only_co_branded_for_requested_background"]
}
```

**Rationale:** Prompt 3 of the dog-food ("Slack logo for a dark slide") found the data gap (all dark Slack assets are co-branded). Claude handled this gracefully, but a less capable model might not. A structural signal is cheaper than prose.

**Contract:** `advisories` is an optional string array; when present, each entry is a known machine-readable tag. Clients are free to ignore it. v1 has exactly one tag; future additions must be added to an enumerated list so callers can switch on them.

### 5. Cache and fetch implementation — unchanged from original spec

§4.2 (cache) and §4.3 (fetcher) stand. One implementation note worth calling out from phase 1's final review:

- Use `fs.createWriteStream` + buffered writes in the logger before phase 2 lands, so `asset.fetch`/`cache.write` debug events don't block the dispatcher under load.

## Updated phase 2 tool surface

Only one new tool:

### `fetch_asset`

Input (revised):
| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | one-of | From a prior find/list tool. |
| `url` | string | one-of | A `dam.usefulto.me` asset URL. |
| `format` | `"svg" \| "png"` | no | **Default: "png"** (revised from "svg"). |
| `mode` | `"url" \| "path" \| "bytes"` | no | Default `"path"`. |

Errors (revised):
| Condition | Error code |
|---|---|
| Neither `id` nor `url` supplied | `InvalidInput` |
| Both `id` and `url` supplied | `InvalidInput` |
| Unknown `id` | `AssetNotFound` |
| `url` not under `dam.usefulto.me` | `InvalidAssetUrl` |
| Requested `format` not available for this asset | `FormatUnavailable` |
| Live fetch failed and asset not cached | `FetchFailed` |

(`InvalidDimensions` is gone.)

Output (revised): as spec'd, minus `computed_dimensions` and `dimension_source`.

## What the new plan looks like

A phase-2 plan will carry roughly:

1. Async logger (`fs.createWriteStream` + buffered flush)
2. `src/assets/fetch.ts` (HTTP GET w/ timeout)
3. `src/assets/cache.ts` (on-disk, version-keyed)
4. `src/tools/fetch-asset.ts` (handler — simpler than originally planned)
5. Tool registration update in `src/server.ts` (+ test count bumps — the hard-coded "5 tools" in `test/server.test.ts` and `test/server.e2e.test.ts` become 6)
6. `find_brand_logo` advisory annotation (+ test)
7. `SIGUSR2` snapshot handler
8. CI bump + regression-suite additions for `fetch_asset`

Roughly 12 TDD-shaped tasks vs. the ~20 the original spec implied — dropped:
- Dimension-math implementation
- Dimension-math tests
- Diagnostics tool
- Associated error-code coverage

## Decisions log

| # | Question | Decision |
|---|---|---|
| P2.1 | Server-side target_width/target_height | **Drop.** LLM does the math. |
| P2.2 | Default format for fetch_asset | **png** (changed from svg; reflects primary consumers). |
| P2.3 | Diagnostics MCP tool | **Defer to phase 3.** SIGUSR2 snapshot stays. |
| P2.4 | Advisory annotations | **Add** to `find_brand_logo` for the "co-branded only" case. |
| P2.5 | Scope size | **~12 tasks** (down from ~20 implied). |

## Out of scope for phase 2 (manifest / data changes)

Dog-food surfaced three data-level opportunities the server can't solve:

- Add a sanctioned standalone Slack knockout (manifest work).
- Enrich `usage` for renamed products with "formerly X" clauses (manifest work).
- Consider adding `caption` role tags to `colorRoles` swatches (manifest work).

These are worth doing but don't belong in phase 2 of the server. File as issues against the gallery/manifest, not as MCP tasks.

One dog-food observation explicitly **not** acted on:

- Do not encode sub-product accent colors for Agentforce (Sales/Service etc.). That would turn this repo into an unofficial brand authority, which is exactly what the spec disclaimer refuses to do.
