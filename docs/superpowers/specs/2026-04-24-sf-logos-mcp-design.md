# SF Logos MCP Server — Design Specification

**Status:** Draft — awaiting user review
**Author:** Tal Golan (with Claude)
**Date:** 2026-04-24
**Repository:** https://github.com/talgolan/SF_Logos (or wherever this repo lives)
**Working package name:** `@usefulto/sf-logos-mcp`

---

## Purpose

An MCP (Model Context Protocol) server that lets Claude Code and other AI
systems select, fetch, and correctly size Salesforce brand logos and product
icons when building slide decks, documents, and other visual artifacts
(PowerPoint, Google Slides, Keynote, HTML, etc.).

The server sits on top of the existing static gallery at
[dam.usefulto.me](https://dam.usefulto.me) and its embedded
[manifest.json](https://dam.usefulto.me/manifest.json). It exposes the
manifest's metadata, scoring, and asset bytes through a small set of
task-oriented MCP tools so an AI building an artifact can answer three
questions without leaving its workflow:

1. **Which asset do I want?** (search/filter)
2. **How do I reference it?** (URL, filesystem path, or inline bytes)
3. **How do I size it without breaking the brand?** (aspect-ratio math)

---

## Section 1 — System overview

### Runtime and distribution

- **Language / runtime:** TypeScript, Node ≥20.
- **Dev runtime:** Bun (per global preference); published artifact is
  Node-compatible.
- **Transport:** stdio (the standard MCP transport for local clients).
- **Distribution:** npm package. MCP clients invoke via
  `npx -y @usefulto/sf-logos-mcp`.

### Data source

- **Source of truth:** `https://dam.usefulto.me/manifest.json`
  (~115 KB, 6 brands, 112 assets).
- **Freshness strategy:** bundled snapshot + background refresh.
  - A snapshot of `manifest.json` is shipped inside the npm package
    (`src/bundled/manifest.json`).
  - On startup, the server attempts to `GET` the live manifest with a
    2-second timeout. If it succeeds, the live copy is used for the
    session. If it fails (offline, slow, DNS, 5xx), the bundled snapshot
    is used with no error surfaced to the AI.
- **Asset URLs:** always resolved live against `https://dam.usefulto.me/`.
  The snapshot contains relative paths; the server prepends the base URL
  when returning results.

### Delivery model (hybrid)

- **Find/list tools** return URLs and metadata only. No binary traffic.
- **`fetch_asset`** is the on-request escape hatch: given an id or URL, it
  returns one of:
  - `mode: "url"` — no network; just the fully-qualified URL.
  - `mode: "path"` — fetches (if not cached) and returns a filesystem path
    under the on-disk cache directory.
  - `mode: "bytes"` — fetches and returns base64-encoded file content.

### Out of scope (deliberate)

- No write access to the manifest.
- No embedding-based or ML search — weighted substring scoring only.
- No authentication; all assets and the manifest are public.
- No artifact-specific helpers (`get_asset_for_pptx`, etc.). Rendering
  guidance is carried in tool `description` text so it reaches the LLM
  naturally.
- No telemetry.

### Non-goals

- Not a replacement for the static gallery at dam.usefulto.me — the HTML
  gallery stays canonical for human browsing.
- Not a general image search — the server's universe is bounded to the
  112 assets in the manifest.

---

## Section 2 — Tool surface

Six tools. Each tool's `description` carries selection guidance (preferred
flag, background matching, SVG-over-PNG, aspect-ratio rules) so the LLM
doesn't need to consult a separate document.

### `list_brands`

Enumerate the brand groupings.

**Input:** none.

**Output:**
```json
{
  "brands": [
    { "id": "salesforce",    "name": "Salesforce",                    "logo_count": 5 },
    { "id": "mulesoft",      "name": "MuleSoft",                      "logo_count": 3 },
    { "id": "slack",         "name": "Slack",                         "logo_count": 5 },
    { "id": "tableau",       "name": "Tableau",                       "logo_count": 6 },
    { "id": "informatica",   "name": "Informatica",                   "logo_count": 3 },
    { "id": "product-icons", "name": "Salesforce Product Icons",      "logo_count": 90 }
  ],
  "manifest_version": "2026-03-13",
  "disclaimer": "This manifest is an unofficial internal reference tool. It is not affiliated with or endorsed by Salesforce, Inc. ..."
}
```

The `disclaimer` string is passed through verbatim from the manifest's
`_ai_instructions.disclaimer`; downstream LLMs inherit the "unofficial
resource" context without prompt engineering.

### `find_brand_logo`

Find brand-wordmark / lockup assets.

**Input:**
| Field | Type | Required | Notes |
|---|---|---|---|
| `brand` | string | yes | One of the brand ids, **excluding** `product-icons`. |
| `background` | `"light" \| "dark"` | no | Match target surface. |
| `co_branded` | boolean | no | `true` = Salesforce-endorsed lockups only; `false` = exclude lockups. |
| `variant` | string | no | Substring match on the asset's `variant` (e.g. `"Knockout"`, `"White"`, `"Horizontal"`). |
| `preferred_only` | boolean | no | Default `false`. When `true`, returns only `preferred: true` assets. |

**Output:** `{ logos: AssetSummary[] }`. Sorted by: `preferred: true` first,
then `background`-match, then the rest, with stable alphabetical tiebreak.

### `find_product_icon`

Find Salesforce 2D product icons.

**Input:** at least one of `query`, `category`, `keywords`, or `background`
must be provided (`limit` alone does not count). All supplied parameters
are ANDed.
| Field | Type | Required | Notes |
|---|---|---|---|
| `query` | string | at-least-one | Natural-language search string. |
| `category` | string | at-least-one | One of `AI \| CRM \| Platform \| Data \| Industries \| Marketing \| Service \| Security`. |
| `keywords` | `string[]` | at-least-one | All provided keywords must appear in the asset's `keywords`. Match is case-insensitive and exact-token (no substring). |
| `background` | `"light" \| "dark"` | at-least-one | Filter by background. |
| `limit` | int | no | Default 10, min 1, max 90. |

Violating the at-least-one rule raises `InvalidInput`.

**Scoring (when `query` is provided):** per asset,
`score = 3 × exact-keyword-hits + 2 × name-substring-hits + 1 × (product_description substring hits + use_case substring hits)`.
Tokenize `query` on whitespace; lowercase both sides; a token matches a
keyword when the keyword equals the token (exact) or the keyword contains
the token as a word-boundary substring.

Results are returned sorted by score desc; zero-score rows omitted; ties
broken by alphabetical `name`. Without `query`, filtering only, sorted
alphabetically.

**Output:** `{ icons: AssetSummary[] }`. Each entry includes
`match_score` when `query` was provided.

### `get_brand_colors`

Return a brand's palette.

**Input:** `{ brand_id: string }` (required).

**Output:**
```json
{
  "brand_id": "salesforce",
  "brand_name": "Salesforce",
  "colors": {
    "primary": "#0176d3",
    "navy":    "#032d60",
    "cloud":   "#1b96ff",
    "white":   "#ffffff"
  }
}
```

### `get_color_roles`

Return the curated semantic UI-role palette (subset of the 156-swatch
palette).

**Input:** `{ roles?: string[] }`. When provided, return only swatches
whose `roles[]` includes any of the requested role names.

**Output:**
```json
{
  "roles": [
    { "name": "Blue 50", "hex": "#0176D3", "roles": ["primary","action","interactive","brand"] },
    { "name": "Blue 40", "hex": "#0B5CAB", "roles": ["hover","interactive-hover"] }
  ]
}
```

### `fetch_asset`

Return the URL, bytes, or local filesystem path of a known asset, with
optional aspect-ratio-preserving dimension computation.

**Input:** exactly one of `id` OR `url` must be provided.
| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | one-of | Asset id returned from a find/list tool. |
| `url` | string | one-of | A `dam.usefulto.me` asset URL (e.g. resumed from prior context). |
| `format` | `"svg" \| "png"` | no | Defaults to `"svg"` when available, else the other. |
| `mode` | `"url" \| "path" \| "bytes"` | no | Default `"path"`. |
| `target_width` | int px | no | Derive height; mutually exclusive with `target_height`. |
| `target_height` | int px | no | Derive width; mutually exclusive with `target_width`. |

**Output:**
```json
{
  "id": "icon-admin",
  "format": "svg",
  "url": "https://dam.usefulto.me/Icons/extracted/Admin-2D-Product-Icon/Admin-2D-Product-Icon-Full-Color-RGB.svg",
  "path": "/Users/.../Caches/sf-logos-mcp/2026-03-13/icon-admin.svg",
  "bytes_base64": "PHN2ZyB4bWxu...",
  "computed_dimensions": { "width": 128, "height": 128 },
  "source_dimensions":   { "width": 641, "height": 640 },
  "aspect_ratio":        { "decimal": 1.0016, "is_square": true }
}
```

Fields present per `mode`:
- `url` — always present.
- `path` — present when `mode: "path"`.
- `bytes_base64` — present when `mode: "bytes"`.
- `computed_dimensions` — present when `target_width` or `target_height` was set.

**Errors:**
| Condition | Error code |
|---|---|
| Neither `id` nor `url` supplied | `InvalidInput` |
| Both `id` and `url` supplied | `InvalidInput` |
| Unknown `id` | `AssetNotFound` |
| `url` not under `dam.usefulto.me` | `InvalidAssetUrl` |
| Requested `format` not available for this asset | `FormatUnavailable` (message lists available formats) |
| Both `target_width` and `target_height` supplied | `InvalidDimensions` |
| Live fetch failed and asset not cached | `FetchFailed` |

`find_brand_logo` additionally raises:
- `UnknownBrand` — `brand` is not one of the ids returned by `list_brands`.
- `InvalidInput` — `brand` is `"product-icons"` (this tool is for brand
  wordmarks/lockups; product icons are served by `find_product_icon`).

`get_brand_colors` raises `UnknownBrand` when `brand_id` is not one of
the ids returned by `list_brands`.

---

## Section 3 — Metadata shape (shared)

Every asset-returning tool (`find_brand_logo`, `find_product_icon`,
`fetch_asset`) emits objects that conform to one of two closely-related
shapes: **`AssetSummary`** (returned by find/list tools) and
**`AssetDetail`** (returned by `fetch_asset`). `AssetDetail` is a strict
superset of `AssetSummary` — `fetch_asset` additionally returns any
combination of `path`, `bytes_base64`, and `computed_dimensions` depending
on the requested `mode` and target-dimension parameters.

### `AssetSummary` (base)

This is the canonical per-asset object. It is intentionally trimmed
compared to the raw manifest entry: redundant fields are dropped, URLs
are pre-resolved to `https://dam.usefulto.me/`, and a compact
`brand_colors_hint` is inlined so the LLM can style the asset's neighborhood
without a follow-up `get_brand_colors` call in simple cases.

```json
{
  "id": "icon-agentforce",
  "name": "Agentforce",
  "brand_id": "product-icons",
  "type": "product-icon",
  "variant": "Full Color",
  "background": "light",
  "preferred": false,
  "co_branded": false,
  "category": "AI",
  "keywords": ["AI", "agent", "autonomous AI", "agentforce", "LLM", "copilot", "einstein", "automation", "generative AI"],
  "product_description": "Salesforce's autonomous AI agent platform for deploying agents that take action across sales, service, and marketing workflows.",
  "use_cases": ["AI slide", "Agentforce narrative", "capability grid"],
  "usage": "Salesforce Agentforce 2D product icon. Full-color RGB version for digital and web use.",
  "formats": {
    "svg": "https://dam.usefulto.me/Icons/extracted/Agentforce-2D-Product-Icon/Agentforce-2D-Product-Icon-Full-Color-RGB.svg",
    "png": "https://dam.usefulto.me/Icons/extracted/Agentforce-2D-Product-Icon/Agentforce-2D-Product-Icon-Full-Color-RGB.png"
  },
  "preferred_format": "svg",
  "source_dimensions": { "width": 641, "height": 640, "source": "png" },
  "aspect_ratio": { "decimal": 1.0016, "ratio": "641:640", "is_square": true },
  "svg_intrinsic": { "width": 64, "height": 64, "aspect_ratio_decimal": 1.0, "ratio": "1:1" },
  "brand_colors_hint": {
    "primary": "#0176d3",
    "navy": "#032d60"
  },
  "match_score": 7
}
```

#### Field rules

| Field | Presence | Notes |
|---|---|---|
| `id` | always | Stable identifier from the manifest. |
| `name` | always | Human-readable asset name. |
| `brand_id` | always | One of the six brand ids. |
| `type` | always | `"logo" \| "icon-mark" \| "co-brand" \| "product-icon"`. |
| `variant` | always | May be short (`"Color"`, `"Knockout"`) or descriptive. |
| `background` | always | `"light" \| "dark"` — target-surface requirement. |
| `preferred` | always | Default-choice flag at the brand level. |
| `co_branded` | always | Salesforce-endorsed lockup flag. |
| `category` | product-icons only | `"AI" \| "CRM" \| "Platform" \| "Data" \| "Industries" \| "Marketing" \| "Service" \| "Security"`. `null` for brand logos. |
| `keywords` | always | May be empty for some brand wordmarks; always present as an array. |
| `product_description` | product-icons only | `null` for brand logos. |
| `use_cases` | always | Array; may be empty. |
| `usage` | always | Free-text usage guidance copied from the manifest. |
| `formats.svg` | when SVG available | Fully-qualified URL. `null` otherwise. |
| `formats.png` | when PNG available | Fully-qualified URL. `null` otherwise. |
| `preferred_format` | always | `"svg"` when available, else `"png"`. |
| `source_dimensions` | always | `{ width, height, source: "png" \| "svg" }` — pixel size of the hosted file. |
| `aspect_ratio` | always | `{ decimal, ratio, is_square }`. |
| `svg_intrinsic` | when SVG available | Viewbox-based dimensions (no canvas padding). `null` otherwise. |
| `brand_colors_hint` | always | At most 4 key/hex pairs from the brand's palette. For `product-icons`, the Salesforce palette is inlined. |
| `match_score` | `find_product_icon` with `query` | Integer computed by the scoring algorithm. Omitted otherwise. |

#### Why URLs are pre-resolved

The raw manifest stores relative paths (e.g.
`Icons/extracted/Admin-2D-Product-Icon/…svg`). An LLM building a URL from
a relative path must remember the base and must percent-encode spaces —
both are easy to get wrong. The server does the resolution once and
returns fully-qualified, percent-encoded URLs in `formats.svg` /
`formats.png`, removing an entire class of failure.

#### Why `preferred_format` is explicit

The selection rule "prefer SVG over PNG, fall back to PNG if SVG absent"
belongs in the server, not in every LLM prompt. `preferred_format` is
the answer computed once per asset, so callers can route straight to
`formats[summary.preferred_format]` without reimplementing the rule.

#### Why `brand_colors_hint` is inlined

In simple cases (e.g. "place the Tableau logo on a dark slide and tint
the caption with the brand blue") the LLM needs exactly one or two
hex values alongside the asset. Forcing a `get_brand_colors` call
for every such case would be tokens wasted. The hint is small (≤ 4
key/hex pairs) and never a substitute for `get_brand_colors` when the
caller needs the full palette.

### `AssetDetail` (extends `AssetSummary`)

Only returned by `fetch_asset`. Adds one or more of the following fields
per the request's `mode` and target-dimension parameters. All other
`AssetSummary` fields are present unchanged.

```jsonc
{
  // ...all AssetSummary fields...
  "format": "svg",                     // always: the format actually served
  "url":    "https://dam.usefulto.me/...",  // always
  "path":   "/Users/.../sf-logos-mcp/2026-03-13/icon-admin.svg", // when mode="path"
  "bytes_base64": "PHN2ZyB4bWxu...",   // when mode="bytes"
  "computed_dimensions": { "width": 128, "height": 128 },        // when target_* set
  "dimension_source": "svg_intrinsic"  // "svg_intrinsic" | "source_dimensions" — which basis was used for the math
}
```

Notes:

- `format` on `AssetDetail` is the single format served by this call
  (not the `formats` map). It equals the requested `format`, falling
  back to the asset's `preferred_format` when `format` was omitted.
- `dimension_source` exists so the caller can tell whether the computed
  dimensions came from the SVG viewBox (preferred for SVG renderers) or
  the raw pixel dimensions (preferred for PPTX / raster pipelines). The
  server picks `svg_intrinsic` when it exists AND the served format is
  `"svg"`; otherwise `source_dimensions`.

### `BrandSummary` (from `list_brands`)

Already specified in Section 2. Independent of the asset shape.

### `ColorEntry` (from `get_color_roles` and inline within `get_brand_colors`)

```json
{ "name": "Blue 50", "hex": "#0176D3", "roles": ["primary","action","interactive","brand"] }
```

`get_brand_colors` returns a flat `{ key: hex }` map (the shape from the
manifest's `brandColors`) rather than `ColorEntry[]`, because brand
palettes are named slots, not role-tagged swatches.

---

## Section 4 — Manifest loader, asset cache, and dimension math

Three small subsystems live under `src/`. Each has a narrow interface
and no knowledge of MCP plumbing.

### 4.1 Manifest loader (`src/manifest/loader.ts`)

**Responsibility:** produce a validated in-memory `Manifest` object at
server startup. Never fails at the boundary: the server always has a
manifest to serve from.

**Algorithm:**

1. Start a 2-second `AbortController` timer.
2. Issue `GET https://dam.usefulto.me/manifest.json` with the controller
   attached; set `User-Agent: sf-logos-mcp/<version>`.
3. On success (HTTP 200, valid JSON, schema check passes): use the live
   manifest. Log `"manifest: live @ <lastUpdated>"` to stderr.
4. On any failure (timeout, network error, non-200, invalid JSON, schema
   mismatch): fall back to the bundled snapshot. Log
   `"manifest: bundled @ <lastUpdated> (<reason>)"` to stderr.
5. Expose the chosen manifest as a module-level frozen singleton via
   `getManifest(): Manifest`.

**Schema check:** minimal — verify `brands[]` exists and each brand has
`id`, `name`, `logos[]`. Do not attempt full structural validation; the
manifest is trusted upstream.

**Snapshot staleness:** the `Decisions log` records that snapshot updates
are a publish-time concern. The CI pipeline for the npm package
regenerates `src/bundled/manifest.json` from
`https://dam.usefulto.me/manifest.json` before build; stale snapshots
only matter when the user is offline, and the cost of staleness there is
"missing assets added since your last install" — acceptable.

### 4.2 Asset cache (`src/assets/cache.ts`)

**Responsibility:** durably store asset bytes on disk, keyed so that a
manifest version change implicitly invalidates the cache.

**Location:**
- Honor `XDG_CACHE_HOME` if set; otherwise OS default:
  - macOS: `~/Library/Caches/sf-logos-mcp/`
  - Linux: `~/.cache/sf-logos-mcp/`
  - Windows: `%LOCALAPPDATA%\sf-logos-mcp\Cache\`
- Inside that root, files live under a version directory:
  `<root>/<manifest.lastUpdated>/<asset-id>.<ext>` — e.g.
  `.../2026-03-13/icon-admin.svg`.
- A new `lastUpdated` starts a new directory; old versions are left
  on disk and never auto-pruned (manifest is ≤ ~100 MB worst case;
  users who care can `rm -rf` the cache root).

**Write semantics:** writes are atomic — write to `<name>.tmp`, then
`rename()`. Concurrent requests for the same file deduplicate via an
in-process `Map<string, Promise<string>>` of in-flight fetches.

**Read semantics:** `cache.getPath(assetId, format, url)` returns the
cache path. If the file exists, no network. If not, fetch, write,
return.

**Integrity:** no checksum verification. Assets are public and URLs are
version-stable; adding hashing would be overkill here.

**What the cache stores:** raw bytes only. No transcoding, no resizing.
The server never mutates an asset.

### 4.3 Asset fetcher (`src/assets/fetch.ts`)

**Responsibility:** one-liner HTTP GET with the right headers, timeout,
and error taxonomy. Called by the cache.

- 10-second timeout per request (generous; typical fetch is < 200 ms).
- `User-Agent: sf-logos-mcp/<version>`.
- Reject non-200 with `FetchFailed` error carrying status and URL.
- On network error, `FetchFailed` with the underlying cause.

### 4.4 Dimension math (`src/assets/dimensions.ts`)

**Responsibility:** implement the aspect-ratio rule once.

**Basis selection:**

```ts
function basisFor(asset: AssetSummary, servedFormat: "svg" | "png"): Basis {
  if (servedFormat === "svg" && asset.svg_intrinsic) return "svg_intrinsic";
  return "source_dimensions";
}
```

**Computation:**

```ts
// Let `ratio` be the decimal aspect ratio from the chosen basis:
//   basis = "svg_intrinsic"     → ratio = svg_intrinsic.aspect_ratio_decimal
//   basis = "source_dimensions" → ratio = aspect_ratio.decimal
//
// target_width provided:  height = round(target_width  / ratio)
// target_height provided: width  = round(target_height * ratio)
```

Results are integers — PPT, Slides, and HTML all want integer px.

**On `is_square`:** when `aspect_ratio.is_square === true`, callers who
want `width == height` simply pass either `target_width` or
`target_height`; the server returns `{ width: n, height: n }`. The
"exactly one of `target_width` / `target_height`" rule is never relaxed.
`is_square` is informational.

---

## Section 5 — Architecture, error handling, and testing

### 5.1 Module layout (confirmed)

```
src/
  server.ts              # MCP plumbing: register tools, dispatch
  manifest/
    loader.ts            # live fetch w/ timeout, bundled fallback
    types.ts             # TS types for the manifest + tool I/O
    summary.ts           # raw-manifest entry → AssetSummary projection
  tools/
    list-brands.ts
    find-brand-logo.ts
    find-product-icon.ts
    get-brand-colors.ts
    get-color-roles.ts
    fetch-asset.ts
  search/
    score.ts             # weighted scoring for find_product_icon
    tokenize.ts          # lowercase + whitespace split + word-boundary helpers
  assets/
    cache.ts             # on-disk cache keyed by manifest version
    fetch.ts             # HTTP GET w/ timeout
    dimensions.ts        # aspect-ratio math
  bundled/
    manifest.json        # publish-time snapshot

test/
  tools/                 # one spec file per tool
  search/score.test.ts
  search/tokenize.test.ts
  assets/cache.test.ts
  assets/fetch.test.ts
  assets/dimensions.test.ts
  manifest/loader.test.ts
  manifest/summary.test.ts
  fixtures/
    manifest.sample.json
```

Each tool file exports:

```ts
export const tool = {
  name: "find_product_icon",
  description: "…LLM-facing guidance incl. selection rules…",
  inputSchema: { /* JSON Schema */ },
  handler: async (input, ctx) => { /* returns tool output */ },
};
```

`server.ts` imports each, puts them in an array, and registers them with
the MCP SDK. No decorator magic, no implicit registration.

### 5.2 Error taxonomy

All errors thrown from handlers extend a single `SfLogosError`:

```ts
class SfLogosError extends Error {
  constructor(
    public code:
      | "AssetNotFound"
      | "InvalidAssetUrl"
      | "FormatUnavailable"
      | "InvalidDimensions"
      | "UnknownBrand"
      | "InvalidInput"
      | "FetchFailed",
    message: string,
    public details?: Record<string, unknown>,
  ) { super(message); }
}
```

The MCP layer in `server.ts` catches these and converts them into MCP
`TextContent` error responses with a stable shape:

```json
{
  "error": {
    "code": "FormatUnavailable",
    "message": "Asset 'sf-einstein-logomark' does not have a PNG; available: svg.",
    "details": { "id": "sf-einstein-logomark", "available_formats": ["svg"] }
  }
}
```

Any unexpected exception (assertion failure, JSON parse error from the
live manifest) is caught at the top-level dispatcher and returned as
`InvalidInput` with `message: "internal error"` and the stack logged to
stderr — never leaked to the client.

### 5.3 Logging and observability

The server must be observable during development, during local client
use, and in CI. Logs are the primary instrument; a few other affordances
(event log, health tool, request tracing) round it out so the AI caller
and the developer can both see what happened without speculation.

#### 5.3.1 Channels

- **stderr** — all human-readable logs. stdio transport reserves stdout
  for MCP JSON-RPC traffic; nothing else is allowed to write to stdout.
- **Optional log file** — when `SFL_LOG_FILE=<path>` is set, the server
  also appends every log line to that file (same format as stderr,
  never rotated by the server; the caller owns retention).
- **Optional JSONL format** — when `SFL_LOG_FORMAT=json` is set, lines
  are emitted as single-line JSON objects instead of the human format,
  suitable for piping into `jq`, a log aggregator, or a file watcher.

#### 5.3.2 Levels

- Four levels: `debug`, `info`, `warn`, `error`.
- Selectable via `SFL_LOG=debug|info|warn|error` (default `info`).
- `error` always prints regardless of the configured level.
- Every log line records which level emitted it.

#### 5.3.3 Line format (human)

```
[sf-logos-mcp] <ISO-8601-timestamp> <level> <event> <key>=<value> …
```

Example:
```
[sf-logos-mcp] 2026-04-25T09:17:38.608Z info tool.call tool=find_product_icon req_id=7f3a duration_ms=4 result_count=3
```

Constraints:
- One event per line. No multi-line output except full stack traces at
  `error`, which are indented two spaces so log parsers can fold them.
- Keys are snake_case. Values are scalars, strings (quoted if they
  contain whitespace), or compact JSON for arrays/objects.
- No ANSI colors by default. `SFL_LOG_COLOR=1` enables ANSI for TTY
  stderr only.

#### 5.3.4 Line format (JSONL, when `SFL_LOG_FORMAT=json`)

```json
{"ts":"2026-04-25T09:17:38.608Z","level":"info","event":"tool.call","tool":"find_product_icon","req_id":"7f3a","duration_ms":4,"result_count":3}
```

Every log line has the same core keys (`ts`, `level`, `event`); event-
specific keys are documented per event below.

#### 5.3.5 Required events

The server MUST emit at least these events. Each appears exactly once
per occurrence — no duplicates, no silent drops.

| Event | Level | Trigger | Keys |
|---|---|---|---|
| `server.start` | info | process startup, once per lifetime | `version`, `node_version`, `pid` |
| `server.ready` | info | after manifest load + tool registration | `tool_count`, `manifest_source`, `manifest_version`, `startup_ms` |
| `server.shutdown` | info | clean exit path | `reason`, `uptime_ms` |
| `manifest.loaded` | info | after `loader.ts` resolves | `source` (`live\|bundled`), `version`, `latency_ms` |
| `manifest.fallback` | warn | live fetch failed, snapshot used | `reason`, `version` |
| `tool.call` | info | every tool invocation (success or error) | `tool`, `req_id`, `duration_ms`, `result_count` (when applicable), `error_code` (when applicable) |
| `tool.input` | debug | every tool invocation | `tool`, `req_id`, `input` (full input payload) |
| `tool.output` | debug | every tool invocation | `tool`, `req_id`, `output` (full output payload) |
| `asset.fetch` | debug | every outbound HTTP GET | `url`, `req_id`, `status`, `bytes`, `duration_ms` |
| `asset.fetch.failed` | warn | outbound HTTP GET failed | `url`, `req_id`, `reason`, `status?` |
| `cache.hit` | debug | cache served an asset | `asset_id`, `format`, `path` |
| `cache.miss` | debug | cache had to fetch | `asset_id`, `format`, `path` |
| `cache.write` | debug | cache wrote a file | `asset_id`, `format`, `path`, `bytes` |
| `internal.error` | error | unexpected exception caught by top-level dispatcher | `req_id?`, `tool?`, `message`, `stack` |

`req_id` is a 4-byte hex string minted at the top of every tool
dispatch; it threads through every log line emitted during that
invocation so a developer can grep one request end-to-end.

#### 5.3.6 Privacy & redaction

- At `info` level, `tool.call` logs the tool name, req id, duration, and
  result count — **never** the input payload.
- At `debug` level, `tool.input` and `tool.output` log full payloads;
  this level is intended for local troubleshooting only.
- `internal.error` includes the stack trace; it never echoes back tool
  input unless `SFL_LOG=debug`.
- No log event ever includes the asset's binary content.
- URLs are always logged in full (they are public).

#### 5.3.7 In-memory event ring

The server keeps an in-memory ring of the last 200 emitted log events
(regardless of the configured log level — ring capture is unconditional,
printing is level-gated). Two affordances read from it:

- **`diagnostics` MCP tool** (gated by `SFL_DIAGNOSTICS=1`; OFF by
  default). Returns:
  ```json
  {
    "version": "x.y.z",
    "started_at": "2026-04-25T09:17:38.000Z",
    "manifest": { "source": "live", "version": "2026-03-13" },
    "counters": {
      "tool_calls":      { "find_product_icon": 12, "fetch_asset": 4, ... },
      "errors_by_code":  { "FormatUnavailable": 1 },
      "cache":           { "hits": 8, "misses": 4, "bytes_written": 39211 }
    },
    "recent_events": [ /* last 200 log events */ ]
  }
  ```
  Intended for developer/AI introspection during a session. When
  disabled, the tool is not registered and is invisible to clients.
- **`SIGUSR2` handler** — when the server receives `SIGUSR2`, it writes
  a snapshot of the same payload to
  `~/.cache/sf-logos-mcp/diagnostics-<timestamp>.json`. Useful when the
  client can't call tools but the process is still alive.

#### 5.3.8 Dev-mode conveniences (enabled by `SFL_DEV=1`)

- Log level defaults to `debug`.
- `SFL_LOG_COLOR` defaults to `1` when stderr is a TTY.
- Every `tool.call` additionally emits a `tool.trace` event (`debug`)
  with a micro-profile: `manifest_ms`, `search_ms`, `cache_ms`,
  `fetch_ms` — cumulative time spent in each subsystem for that
  request.
- The in-memory event ring grows to 1000 entries instead of 200.
- A `--watch-manifest` CLI flag (dev only) re-runs the manifest loader
  every 30 s and logs `manifest.refresh` with the diff between
  versions. Off by default even in dev.

`SFL_DEV=1` is never set in production. CI sets it only for the test
suite so developers see the same verbose output locally that CI sees.

#### 5.3.9 Counters

Minimal, always-on, in-process counters (exposed via the diagnostics
tool; never external metrics):

- `tool_calls_total{tool=…}`
- `tool_errors_total{tool=…, code=…}`
- `cache_hits_total` / `cache_misses_total` / `cache_bytes_written_total`
- `asset_fetches_total` / `asset_fetch_failures_total`
- `manifest_refreshes_total{source=…}` (dev-mode `--watch-manifest`)

Counters reset on process restart. No Prometheus endpoint, no OTel
exporter, no network egress for telemetry — staying consistent with
the "no telemetry" non-goal.

#### 5.3.10 Testing

Every event in §5.3.5 has a unit test asserting (a) the event fires,
(b) the keys are present, (c) the level is correct, (d) privacy rules
hold (no `input` field on an `info`-level `tool.call`). The existing
test-coverage matrix in §5.4.3 is augmented with an `observability`
row listing these events as must-test behaviors.

### 5.4 Testing strategy

Testing is a first-class deliverable. Every module, every public API, and
every user-visible behavior must be covered by an automated test. The
pipeline must be green before any merge to `main` and before any release.

#### 5.4.1 Testing principles

- **Test behavior, not implementation.** Tests describe what a caller
  observes, not how the code gets there. Refactors must not require
  test changes unless the caller contract changed.
- **Fast, deterministic, hermetic.** No test reaches the live network,
  no test depends on wall-clock time outside its own fixtures, no test
  depends on another test's side effects. Mock `fetch`, inject clocks,
  use `os.tmpdir()` for filesystem tests.
- **Test-driven by default.** For every new behavior: write the failing
  test first, then the code. For every bug fix: write the regression
  test first, then the fix. Exceptions require reviewer sign-off.
- **Failure quality matters.** Assertion messages include both expected
  and actual; table-driven rows include a `name` column so failures
  point to the offending case. Snapshot tests are forbidden except for
  `docs:check` auto-generated output comparisons.
- **Every `SfLogosError` code has at least one test** that provokes it
  and asserts both `code` and the shape of `details`.

#### 5.4.2 Test layers

| Layer | Purpose | Scope | Runtime |
|---|---|---|---|
| Unit | One function / module in isolation | `src/**/*.ts` minus `server.ts` | `bun test`, `node --test` |
| Integration | Multiple modules collaborating | loader → cache → fetch, tool handler → summary projection | `bun test`, `node --test` |
| Server (end-to-end) | Real MCP transport over stdio | `server.ts` + all tools | spawn server subprocess, issue JSON-RPC |
| Contract | Tool I/O against canonical fixtures | every tool input schema + output shape | JSON schema validator + TypeScript type narrowing |
| CLI smoke | `bin/sf-logos-mcp` launches and responds | post-build, on the published artifact | CI only |

#### 5.4.3 Per-module coverage matrix (minimum)

| Module | Behaviors that MUST have tests |
|---|---|
| `search/tokenize.ts` | lowercase; whitespace split; empty input; unicode whitespace; word-boundary matching; no leaking punctuation |
| `search/score.ts` | weighted scoring correctness for every weight band (3/2/1); tie-break by alphabetical name; zero-score rows omitted; empty-query handled by caller (not here); scoring stable across runs |
| `manifest/types.ts` | TypeScript types compile against the fixture manifest (via `tsc --noEmit` in CI) |
| `manifest/summary.ts` | URL resolution with spaces percent-encoded; `preferred_format` rule (svg-only, png-only, both-available); `brand_colors_hint` truncation to ≤4 pairs; `null` fields on brand logos (`category`, `product_description`); passthrough of all other fields |
| `manifest/loader.ts` | live success; 2s timeout → fallback; network error → fallback; invalid JSON → fallback; schema-mismatch → fallback; stderr log content; singleton freezing (mutation attempts throw) |
| `assets/fetch.ts` | 10s timeout enforced; non-200 → `FetchFailed` with status; network error → `FetchFailed` with cause; correct `User-Agent`; correct URL |
| `assets/cache.ts` | first-miss writes; second-call cache hit (no fetch); concurrent identical requests deduplicate; version-dir isolation (`2026-03-13` vs `2026-04-01` don't collide); atomic write (.tmp → rename); XDG_CACHE_HOME honored; path traversal rejection for bad `id` |
| `assets/dimensions.ts` | basis selection (svg+intrinsic → svg_intrinsic; svg-no-intrinsic → source_dimensions; png → source_dimensions); `target_width` → height rounding; `target_height` → width rounding; both-supplied → `InvalidDimensions`; square assets return `{n,n}`; rounding matches spec to the nearest integer |
| `tools/list-brands.ts` | shape matches spec; `manifest_version` present; `disclaimer` pass-through |
| `tools/find-brand-logo.ts` | each filter (`background`, `co_branded`, `variant`, `preferred_only`) individually; filter combinations; sort order (preferred → bg-match → alpha); `brand: "product-icons"` → `InvalidInput`; unknown brand → `UnknownBrand` |
| `tools/find-product-icon.ts` | `query`-only; each filter alone; filter combinations; neither supplied → `InvalidInput`; `limit` default / min / max / clamped; `match_score` present with query, absent without |
| `tools/get-brand-colors.ts` | each brand id; unknown brand → `UnknownBrand` |
| `tools/get-color-roles.ts` | no filter returns all; single-role filter; multi-role filter; unknown role returns empty array (not error) |
| `tools/fetch-asset.ts` | every `mode`; `format` selection and override; `format` unavailable → `FormatUnavailable`; `id` unknown → `AssetNotFound`; `url` off-host → `InvalidAssetUrl`; `target_width` / `target_height` separately; both → `InvalidDimensions`; neither `id` nor `url` → `InvalidInput`; both → `InvalidInput`; cache hit path returned directly |
| `server.ts` | tool discovery lists all six; each tool dispatches to the right handler; `SfLogosError` → JSON-RPC error shape; unexpected throw → `InvalidInput` internal error, stack on stderr; logging level honored |
| observability (§5.3) | every event in §5.3.5 fires with correct level, keys, and redaction rules; `req_id` threads through one invocation's log lines; ring-buffer capture is level-independent; `diagnostics` tool is gated by `SFL_DIAGNOSTICS=1`; counters increment per event |

#### 5.4.4 Coverage gates

- **Line coverage:** ≥ 90 % on `src/**/*.ts`, excluding `bin/` and
  generated code. Measured with `bun test --coverage` and uploaded to
  CI artifacts on every PR.
- **Branch coverage:** ≥ 85 % on the same scope.
- **Per-file floor:** no file under 70 % line coverage, even if the
  project totals pass. Prevents one well-tested module from masking
  an untested one.
- **Error-code coverage:** 100 %. A lint step enumerates every
  `SfLogosError` code in `src/` and asserts at least one test asserts
  that code. Missing coverage fails CI.
- **Public-API coverage:** every exported symbol in `src/` has at least
  one test that imports and exercises it. Enforced by a simple AST
  scan in the `test:public-api` CI step.

#### 5.4.5 Fixtures

- `test/fixtures/manifest.sample.json` — a curated subset of the live
  manifest covering every asset `type`, both `background` values, both
  `preferred` values, `co_branded` true and false, SVG-only, PNG-only,
  and dual-format cases. Used by unit and integration tests.
- `test/fixtures/assets/` — minimum bytes per format (1×1 PNG, trivial
  SVG) served by the mock fetcher. No copyrighted artwork in fixtures.
- Fixtures are regenerated via `bun run test:fixtures:refresh` which
  pulls from the live gallery and writes deterministic output; the
  script is idempotent and its output is committed.

#### 5.4.6 Tooling

- **Runner:** `bun test` in dev. CI runs both `bun test` AND
  `node --test` against the compiled `dist/` to confirm the published
  artifact works on the advertised Node version.
- **Assertions:** Bun's built-in `expect` in dev; a thin portability
  shim for Node's `node:test` assertions. No third-party matchers.
- **Mocking:** `fetch` is mocked via the `undici` mock agent (or the
  Bun equivalent) — never via monkey-patching globals in place.
- **Time:** Any code using `setTimeout` / timers accepts an injected
  clock; tests pass a fake clock. No `jest.useFakeTimers`-style global
  monkeypatch.
- **Temp dirs:** One per test via `fs.mkdtemp`, cleaned in `afterEach`.

#### 5.4.7 CI expectations

Every PR runs:

1. `bun run lint` — ESLint + TypeScript-ESLint strict rules.
2. `bun run typecheck` — `tsc --noEmit` on `src/` and `test/`.
3. `bun run build` — produces `dist/`.
4. `bun test --coverage` — all unit/integration/server tests.
5. `node --test dist/test/**/*.js` — same tests against Node.
6. `bun run test:error-codes` — error-code coverage lint.
7. `bun run test:public-api` — public-API coverage lint.
8. `bun run test:cli` — launches `bin/sf-logos-mcp`, sends a
   `tools/list` JSON-RPC request, asserts the six tools are returned.
9. `bun run docs:check` — see Section 5.7.

All nine steps must pass. No `--skip` flags in CI. No
green-on-failure. Failing tests block merge; they are never marked
as "flaky" and retried without a root cause.

#### 5.4.8 What we don't test

- The MCP SDK itself.
- `dam.usefulto.me` availability (out of our control; covered by the
  loader's fallback path).
- Actual binary content of assets beyond "non-empty" and correct
  content-type — the server never inspects or mutates asset bytes.

#### 5.4.9 Regressions

Every reported bug must land with:

1. A failing test that reproduces it — committed in the same PR that
   fixes it, so the regression test exists even if a future change
   reintroduces the bug.
2. A `CHANGELOG.md` entry under `[Unreleased]` → `Fixed`.
3. If the bug reveals a gap in the coverage matrix, Section 5.4.3 is
   updated in the same PR.

### 5.5 Release & distribution

- **Package name:** `@usefulto/sf-logos-mcp` (working).
- **Entry point:** `bin/sf-logos-mcp` — a small Node shim that imports
  the compiled `dist/server.js`.
- **`package.json` excerpts:**
  ```json
  {
    "bin": { "sf-logos-mcp": "bin/sf-logos-mcp" },
    "engines": { "node": ">=20" },
    "files": ["bin/", "dist/", "src/bundled/manifest.json"]
  }
  ```
- **MCP client config (example, Claude Desktop / Claude Code):**
  ```json
  {
    "mcpServers": {
      "sf-logos": { "command": "npx", "args": ["-y", "@usefulto/sf-logos-mcp"] }
    }
  }
  ```
- **Versioning:** semver. Breaking tool-schema changes are major. New
  tools or new optional fields are minor. Snapshot-only updates are patch.

### 5.6 Security & trust notes

- **No user input is executed.** All input becomes either a manifest
  filter or an HTTP URL. URLs are validated: `fetch_asset({ url })` must
  match `https://dam.usefulto.me/...` exactly (literal host, HTTPS, no
  userinfo, no port). Any deviation → `InvalidAssetUrl`.
- **No path traversal.** Cache keys derive from asset `id` and the
  manifest's `lastUpdated`. `id` is validated against `/^[a-z0-9-]+$/`
  before being used as a path component.
- **No credentials.** The manifest and all assets are public; the
  server never reads env vars for auth.
- **Disclaimer pass-through.** The `_ai_instructions.disclaimer` from
  the manifest is surfaced verbatim in the server's `list_brands` output
  as `disclaimer: "..."`, so downstream LLMs inherit the "unofficial
  resource" context without prompt engineering.

### 5.7 Documentation requirements

Documentation is a first-class deliverable of this project, not an
afterthought. The goal: a new engineer should be able to read the repo
and understand *what* every module does, *why* it exists, and *how* to
change it safely — without reading git history or asking the author.

#### Repository-level docs (all required at v1.0.0)

| File | Required contents |
|---|---|
| `README.md` | One-sentence purpose, install line (`npx -y …`), minimal client config snippet, link to every tool with a one-line description, link to `docs/`, trademark/disclaimer notice. |
| `docs/getting-started.md` | Walk-through: installing, pointing an MCP client at the server, calling each tool with example inputs/outputs, common failure modes and remedies. |
| `docs/tools.md` | Reference: full input schema + output schema + error taxonomy for every tool, copied from or linked to this spec. Kept in sync with the code via an auto-generated section regenerated from `tools/*.ts` on each release. |
| `docs/architecture.md` | Module layout diagram, request lifecycle (stdin → dispatch → tool handler → manifest/cache/fetch → response), manifest-freshness flow, cache layout and invalidation rules. |
| `docs/metadata-shape.md` | `AssetSummary` / `AssetDetail` reference with the field-rules table. One canonical place for the shape; every other doc links here. |
| `docs/aspect-ratio.md` | Why aspect-ratio preservation is a hard rule, the dimension-math algorithm, the basis-selection rule, examples per destination (HTML, python-pptx, Google Slides API). |
| `docs/contributing.md` | Dev setup (Bun install, `bun test`, `bun run build`), publishing flow, how to regenerate the bundled manifest snapshot, commit/PR expectations. |
| `docs/superpowers/specs/` | This spec lives here. Future major redesigns get their own dated spec alongside it. |
| `CHANGELOG.md` | Keep-a-Changelog format. Every published version gets an entry noting breaking changes, new tools, new fields, snapshot updates. |
| `LICENSE` | Open-source license (choice TBD in implementation plan). |

All user-facing Markdown must:
- Lead with a one-sentence purpose.
- Use executable examples (copy-paste-runnable where possible).
- Link to authoritative upstreams (Salesforce Brand Guidelines, MCP spec)
  rather than paraphrasing them.

#### Code-level docs (required on every module)

**File header.** Every `src/**/*.ts` file starts with a comment block:

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

**Exported symbols.** Every exported function, class, type, and constant
carries a TSDoc block with:
- A one-line summary sentence (first line).
- A longer description when the summary is insufficient.
- `@param` for every parameter, naming the unit / format / constraint.
- `@returns` describing the shape.
- `@throws` enumerating error codes (not generic `Error`).
- `@example` with a realistic call site when the function has non-trivial
  input shapes.

**Tool handlers** (`src/tools/*.ts`) carry an additional block just above
the `description` field explaining:
- Selection rules the handler enforces (preferred order, background
  match, etc.).
- Every input parameter with valid ranges and interactions.
- Every error code the handler produces.

This text is duplicated into the MCP `description` string so LLM callers
see it at tool-discovery time.

**Non-obvious internals.** Comment the *why* whenever the code contains:
- A workaround for an upstream bug (link to the bug).
- A performance decision (say what was measured).
- A deliberate deviation from a spec (cite the spec section).
- Security-critical validation (name the threat).

Do NOT comment the *what* when identifiers already convey it — no
comments restating a variable's name or a loop's obvious purpose.

#### Schema documentation

- Every JSON schema for tool input lives inline in the tool module, with
  a `description` field on the schema root and on every property. These
  descriptions are the LLM's only guidance at call time — treat them as
  production-critical copy, not metadata.
- TypeScript types in `manifest/types.ts` mirror the manifest shape and
  `AssetSummary` / `AssetDetail`. Every field has a TSDoc comment. The
  types are the single source of truth; the docs link to them rather
  than re-specifying.

#### Documentation CI

- `bun run docs:check` (runs in CI) verifies:
  - Every exported symbol in `src/` has a TSDoc block.
  - Every `tools/*.ts` exports a `description` string ≥ 200 characters.
  - Every Markdown link resolves (no broken internal or external links).
  - `docs/tools.md` auto-generated section matches `tools/*.ts`.
- Build fails if any check fails. Missing docs are a blocker, not a
  review nit.
- Runs as step 9 of the CI pipeline described in Section 5.4.7.

#### Changelog discipline

Every PR touching `src/` or tool contracts updates `CHANGELOG.md` under
`[Unreleased]` before merge. Release cuts move `[Unreleased]` entries
under a dated version header.

### 5.8 GitHub Pages publishing (monorepo separation)

This repository serves a public gallery at
[dam.usefulto.me](https://dam.usefulto.me) via GitHub Pages. Adding MCP
server sources to the same repo, without changing the Pages config,
would expose those sources publicly at `https://dam.usefulto.me/src/...`
etc. That is noisy (raw TypeScript served with no 404), leaks package
metadata, and keeps the door open for an accidental secret commit to
become a public URL.

**Decision (option A, implemented):** keep one repo. All Pages-served
files live under `site/` at the repo root. The Pages source is
**GitHub Actions**, not a branch path, so only the uploaded artifact is
served — nothing outside `site/` is reachable at `dam.usefulto.me`.

#### What `site/` contains (and only this)

- `site/index.html` — the gallery (moved from the repo root).
- `site/manifest.json` — the manifest (moved from the repo root).
- `site/README.md` — user-facing README for the gallery site.
- `site/llms.txt` — LLM guide (moved from the repo root).
- `site/CNAME` — `dam.usefulto.me` (moved from the repo root).
- `site/Icons/`, `site/Original/`, `site/Slack/`, `site/Mulesoft/`,
  `site/Tableau/`, `site/Informatica/` — asset directories
  (moved from the repo root).
- `site/.nojekyll` — prevents Jekyll from hiding files starting with
  `_` and disables its HTML renaming surprises.

Everything else — `src/`, `test/`, `bin/`, `dist/`, `package.json`,
`tsconfig.json`, `node_modules/` (never committed), this spec under
`docs/`, the `build/` Python helper — lives at the repo root and is
**not** under `site/`, therefore not served.

#### Build workflow

`.github/workflows/pages.yml` runs on push to `main` (restricted to
paths `site/**` and the workflow itself), plus manual
`workflow_dispatch`. It has three sequential jobs:

1. **build** — checkout, run `scripts/check-pages-allowlist.sh`
   (fails if any file under `site/` is outside the allowlist, or if
   public files have reappeared at the repo root, or if a sensitive
   extension appears in `site/`), then `actions/configure-pages@v5`
   and `actions/upload-pages-artifact@v3 path=site`.
2. **deploy** — `actions/deploy-pages@v4`.
3. **smoke** — a set of `curl` assertions against
   `https://dam.usefulto.me`:
   - `/` → 200
   - `/manifest.json` → 200 and contains 6 brands
   - `/llms.txt` → 200
   - `/src/server.ts` → 404
   - `/package.json` → 404
   - `/docs/superpowers/specs/2026-04-24-sf-logos-mcp-design.md` → 404

   Any failing assertion fails the job (deploy is already done, but
   the red check surfaces the regression).

Pages **Settings → Source** is set to **GitHub Actions** (not
"Deploy from a branch"). This is a one-time repo-settings change, not
something the workflow can perform.

#### Repository layout after migration

```
SF_Logos/
  site/                       # SERVED by GitHub Pages
    index.html
    manifest.json
    README.md
    llms.txt
    CNAME
    .nojekyll
    Icons/  Original/  Slack/  Mulesoft/  Tableau/  Informatica/
  src/                        # MCP server sources — NOT served
  test/                       # MCP server tests — NOT served
  bin/                        # MCP server launcher — NOT served
  docs/                       # engineering docs, specs — NOT served
  build/                      # build_deck.py helper — NOT served
  scripts/                    # dev/CI helper scripts — NOT served
  package.json                # NOT served
  tsconfig.json               # NOT served
  .github/workflows/pages.yml # NOT served
```

#### Pages repo-settings changes required

- **Source:** change from "Deploy from a branch → main / root" to
  "GitHub Actions". One-time manual change in repo Settings → Pages.
- **Custom domain:** keep `dam.usefulto.me`. The workflow writes
  `CNAME` into `site/` on every deploy so the binding survives.
- **Enforce HTTPS:** keep enabled.

#### Verification after migration

- `curl -I https://dam.usefulto.me/src/server.ts` → 404.
- `curl -I https://dam.usefulto.me/package.json` → 404.
- `curl -I https://dam.usefulto.me/docs/superpowers/specs/2026-04-24-sf-logos-mcp-design.md` → 404.
- `curl -s https://dam.usefulto.me/manifest.json | jq '.brands | length'` → `6`.
- `curl -I https://dam.usefulto.me/` → 200 (gallery loads).

These four assertions run as a post-deploy smoke job in the same
workflow; failure blocks the deploy.

#### Rollback

If the Actions-based deploy breaks, GitHub's "Revert to previous
deployment" button restores the last good artifact. If the workflow
itself is broken, `git revert` the `pages.yml` change and temporarily
re-point Settings → Pages back to branch/root — but only as a last
resort, since doing so re-exposes the MCP sources until the workflow
is fixed.

#### Tests added to cover this

- `scripts/check-pages-allowlist.sh` (the allowlist itself — runs
  locally and in CI before every upload). Rejects any file in `site/`
  outside the allowlist, any public file reappearing at the repo root,
  and any sensitive extension (`.env`, `.key`, `.pem`, `.p12`, `.pfx`)
  anywhere under `site/`.
- The `smoke` job in `.github/workflows/pages.yml` (the four `curl`
  assertions above) runs after every deploy.
- Local regression test: `touch site/secret.env && bash
  scripts/check-pages-allowlist.sh` must exit non-zero with a clear
  message. Verified once at migration time; re-verified any time
  `check-pages-allowlist.sh` is edited.

### 5.9 Future considerations (explicitly deferred)

Listed here so the next author knows these were considered and
intentionally left out of v1:

- Embedding-based search over icon descriptions.
- Artifact-specific helpers (`render_pptx_slide`, etc.).
- A write API for proposing new assets or metadata fixes.
- Server-side SVG → PNG rasterization at arbitrary sizes.
- Signed-URL access (unnecessary while everything is public).
- A remote HTTP transport variant (`mcp.dam.usefulto.me`).

---

## Appendix A — Decisions log

| # | Question | Decision |
|---|---|---|
| Q1 | Delivery model | **D** — Hybrid: URL + metadata default; bytes/path on request. |
| Q2 | Tool granularity | **B** — Task-oriented (4–6 tools). |
| Q3 | Runtime / distribution | **A** — Node/TypeScript via `npx`. |
| Q4 | Manifest freshness | **C** — Bundled snapshot + 2s live refresh on startup. |
| Q5 | Asset byte caching | **D** — On-disk cache under OS cache dir; `mode: "path"` returns cache path directly. Cache versioned by manifest `lastUpdated`. |
| Q6 | Search semantics | **B+D** — Weighted scoring on `query`, filters via `category`/`keywords`/`background`, AI filters the rest. |
| Q7 | Aspect-ratio help | **B** — `fetch_asset` accepts `target_width`/`target_height` and returns the computed other dimension. |
| Q8 | Colors API | **C** — Separate `get_brand_colors` and `get_color_roles` tools. |
| Q9a | Tool surface complete? | Yes. |
| Q9b | `fetch_asset` accepts URL alt input | Yes. |
| Arch | Module layout | **Approach 2** — Layered by concern. |
