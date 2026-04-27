# Phase 3A — `fetch_asset(destination_path)` design

**Date:** 2026-04-27
**Supersedes:** nothing. **Extends:** phase-2 spec ([`2026-04-25-phase-2-scope-revision.md`](2026-04-25-phase-2-scope-revision.md)) and the original design ([`2026-04-24-sf-logos-mcp-design.md`](2026-04-24-sf-logos-mcp-design.md)) §2 `fetch_asset`.
**Authoritative for:** the `destination_path` feature only. Other phase-3 items (npm publish, full docs set, CI hardening, advisory symmetry) are out of scope for this spec.

---

## TL;DR

Add a `destination_path` input parameter to `fetch_asset`. When supplied, the server copies the cached asset to the caller's specified absolute path, atomically, without consuming the cache. Fails with `DestinationExists` if the path already exists. Collapses today's four-tool-call download flow (`find_* → fetch_asset(mode=path) → list_allowed_directories → move_file`) to a single `fetch_asset` call.

## Motivation

Phase-2 dog-food (2026-04-27, [transcript](../../dogfood/2026-04-27-dog-food-phase-2.md)) validated every phase-2 feature but surfaced one sharp ergonomic gap:

- **Cache depletion via client `move_file`.** Turns 6 and 9 of the transcript: the first `fetch_asset(mode="path")` wrote to the cache, the caller's `Filesystem:move_file` relocated it, and the second `fetch_asset` had to re-fetch from the CDN because the cache entry was gone. The phase-2 "second hit is free" invariant held in theory but was silently broken by consumers.
- **Four-tool-call dance for a single intent.** "Download the Agentforce icon to my Desktop" required tool calls to `find_product_icon`, `fetch_asset`, `Filesystem:list_allowed_directories`, and `Filesystem:move_file`. Each intermediate call is reasoning surface area where the LLM can pick a wrong path (Turn 6 of the 2026-04-27 transcript shows exactly this — an initial `mode="bytes"` attempt failed on truncated base64 before a retry landed on `mode="path"`).
- **Client-side allowlist gymnastics.** The Filesystem extension needs both `~/Library/Caches/sf-logos-mcp` (source) and `~/Desktop` (destination) allowlisted. Non-obvious configuration that most users won't pre-authorize.

A `destination_path` parameter dissolves all three: one tool call, cache preserved, one destination path the client's filesystem server needs to allowlist.

## Non-goals

- **No URL-input support.** Callers with a raw URL continue to use `curl` or equivalent — the server's value-add is id→URL routing; skipping the id skips the value. See decision Q8 below.
- **No `mode="bytes"` + `destination_path` combo.** The two are redundant ways of delivering the same bytes. Forbidden by the design.
- **No overwrite mode.** Destination-already-exists is a hard failure (`DestinationExists`). No `overwrite: true` flag in v1. Callers that want overwrite can `rm` first or pick a different name.
- **No path magic.** No tilde expansion, no relative paths, no `$HOME` resolution. Absolute paths only. See decision Q3.
- **No cross-filesystem optimization.** `<dest>.tmp` is always written in the destination directory (same filesystem guaranteed) and renamed in-place. See decision Q9.
- **No symlink protection.** The server runs as the user; OS filesystem permissions are the enforcement boundary. See decision Q6.

## Input contract

`fetch_asset` input schema gains one optional field:

```json
{
  "id": "string (required unless url supplied)",
  "url": "string (required unless id supplied)",
  "format": "svg | png (default: png)",
  "mode": "url | path | bytes (default: path)",
  "destination_path": "string (optional; absolute path only)"
}
```

### Interaction rules

- `destination_path` **requires `id` input**. `destination_path` + `url` → `InvalidInput`.
- `destination_path` **implies `mode="path"`**. `destination_path` + explicit `mode="path"` is accepted (redundant). `destination_path` + `mode="url"` or `mode="bytes"` → `InvalidInput`.
- `destination_path` **must be absolute**. Leading `/` on Unix, drive letter on Windows. Tilde (`~`), `.`, `..`, relative paths → `InvalidInput`.
- `destination_path` **must not contain a null byte**. `\0` → `InvalidInput`.
- `destination_path` **must not already exist**. If the path exists (file, directory, symlink, pipe, anything) → `DestinationExists`.

### What we do NOT validate

- Parent directory existence (deferred to the OS — `ENOENT` surfaces as `FetchFailed`).
- Parent directory writability (deferred to the OS — `EACCES` surfaces as `FetchFailed`).
- Path traversal beyond "is absolute." The user can write wherever their OS permissions allow them to write.
- Whitelist against allowed directories. The MCP server is not a sandboxing layer.

## Output contract

When `destination_path` is supplied and succeeds, the `AssetDetail` response carries two path fields:

```json
{
  "...": "all existing AssetDetail fields",
  "format": "png",
  "url": "https://dam.usefulto.me/...",
  "path": "/Users/tal.golan/Desktop/agentforce.png",
  "cached_from": "/Users/tal.golan/Library/Caches/sf-logos-mcp/2026-03-13/icon-agentforce.png"
}
```

- **`path`** — the destination. This is "where the file now lives" from the caller's perspective. Same field name as today's `mode="path"` response; semantics shift from "cache path" to "final path."
- **`cached_from`** — NEW. The cache path. Diagnostic: lets the caller see whether this call was a cache hit (fast) or a cold fetch (slow) without subscribing to observability events.

When `destination_path` is NOT supplied, `cached_from` is absent from the response. The existing `mode="path"` behavior is unchanged.

### `AssetDetail` type addition

```ts
export interface AssetDetail extends AssetSummary {
  format: "svg" | "png";
  url: string;
  path?: string;
  bytes_base64?: string;
  /** Present when mode === "path" AND destination_path was supplied. Diagnostic. */
  cached_from?: string;
}
```

## Error taxonomy

Error union grows from 6 to 7 codes:

```ts
export type SfLogosErrorCode =
  | "AssetNotFound"
  | "InvalidAssetUrl"
  | "FormatUnavailable"
  | "UnknownBrand"
  | "InvalidInput"
  | "FetchFailed"
  | "DestinationExists";   // NEW
```

### Failure mapping

| Condition | Code | `details` payload |
|---|---|---|
| `destination_path` + `url` input | `InvalidInput` | `{}` |
| `destination_path` + `mode="url"` or `mode="bytes"` | `InvalidInput` | `{ mode }` |
| `destination_path` not absolute | `InvalidInput` | `{ destination_path }` |
| `destination_path` contains `\0` | `InvalidInput` | `{}` |
| `destination_path` already exists | `DestinationExists` | `{ destination_path }` |
| Destination parent directory missing | `FetchFailed` | `{ destination_path, reason: "destination_write_failed", cause }` |
| Destination parent not writable | `FetchFailed` | same as above |
| Disk full during write | `FetchFailed` | same as above |
| Any other `copyFileSync` or `renameSync` error | `FetchFailed` | same as above |

### Why `DestinationExists` is its own code

Distinct failure class from `InvalidInput`. Caller retry logic can switch cleanly:

```ts
catch (e) {
  if (e.code === "DestinationExists") return pickNewFilename(e.details.destination_path);
  if (e.code === "InvalidInput")      return fixInput(e);
  throw e;
}
```

Folding into `InvalidInput` would force string-matching on `message`.

## Architecture

### Module layout (diff from phase 2)

```
src/
  assets/
    fetch.ts           # unchanged (phase 2)
    cache.ts           # unchanged (phase 2)
    destination.ts     # NEW: atomic copy from cache to caller-specified path
  errors.ts            # MODIFIED: +DestinationExists
  tools/
    fetch-asset.ts     # MODIFIED: +destination_path branch
  manifest/
    types.ts           # MODIFIED: +cached_from optional field on AssetDetail

test/
  assets/
    destination.test.ts  # NEW (7 scenarios)
  tools/
    fetch-asset.test.ts  # MODIFIED (+8 scenarios)
  errors.test.ts         # MODIFIED (count 6 → 7)

scripts/
  try-mcp.ts             # MODIFIED (+2 regression scenarios)
```

### `src/assets/destination.ts` — interface

```ts
/**
 * assets/destination — Atomic copy from cache to caller-specified path.
 *
 * Responsibility: validate the destination path, reject if it already
 * exists, write via `<dest>.tmp` in the same directory + rename for
 * atomicity. Propagate OS errors as FetchFailed with reason tag.
 * Errors: InvalidInput (bad path shape), DestinationExists, FetchFailed.
 * Dependencies: errors.ts, node:fs, node:path.
 */

export interface CopyToDestinationOptions {
  /** The cache path returned by AssetCache.getPath(). Must exist. */
  source: string;
  /** Caller-specified destination. Must be absolute, no null bytes. */
  destination: string;
}

export function copyToDestination(opts: CopyToDestinationOptions): void;
```

Synchronous. `copyFileSync(source, tmp) → renameSync(tmp, destination)`. On any thrown error from the filesystem calls (other than the pre-checked `DestinationExists`), re-throws as `SfLogosError("FetchFailed", …)` with `details.reason = "destination_write_failed"` and `details.cause` carrying the OS message.

The module owns:
- Absolute-path + null-byte validation.
- Existence check → `DestinationExists`.
- Atomic write (`.tmp` in the destination's own directory, same filesystem guaranteed).
- OS-error relay.

The module does NOT own:
- Fetching from the CDN.
- Cache management.
- Format selection or id resolution.
- Tool-level input validation (e.g. mode/url/destination combinations).

### `src/tools/fetch-asset.ts` — handler changes

**Input-exclusivity block** gains a `destination_path` branch after the existing `haveId`/`haveUrl` checks:

```ts
const haveDestination = typeof input.destination_path === "string";

if (haveDestination) {
  if (haveUrl) {
    throw new SfLogosError(
      "InvalidInput",
      "destination_path requires id input. URL input only supports mode='url'; use find_* to resolve a URL to an id first.",
      {},
    );
  }
  if (input.mode !== undefined && input.mode !== "path") {
    throw new SfLogosError(
      "InvalidInput",
      `destination_path implies mode='path'; got mode='${input.mode}'.`,
      { mode: input.mode },
    );
  }
}
```

**`mode === "path"` branch** on the id-input code path gains a destination sub-branch:

```ts
if (mode === "path") {
  const cachePath = await ctx.cache.getPath(id, format, url);
  if (haveDestination) {
    const destination = input.destination_path as string;
    const { copyToDestination } = await import("../assets/destination.js");
    copyToDestination({ source: cachePath, destination });
    return {
      ...summary,
      format,
      url,
      path: destination,
      cached_from: cachePath,
    } satisfies AssetDetail;
  }
  return { ...summary, format, url, path: cachePath } satisfies AssetDetail;
}
```

**Input schema** gains a `destination_path` property with a description matching the tool-level description addition.

**Tool description** gains a paragraph:

> "Optional `destination_path` (absolute path only) writes the asset to that exact location. Fails with `DestinationExists` if the file already exists (callers must delete or pick a new name). Combined with `id` only — URL input does not accept `destination_path`. When used, `path` in the response is the destination and `cached_from` is the cache path."

## Data flow

### Cache hit + `destination_path`

```
caller → fetch_asset({ id, destination_path })
      → ctx.cache.getPath(id, format, url)     # cache hit → immediate path return
      → copyToDestination({ source: cachePath, destination })
          → validate absolute + no null byte
          → existsSync(destination) → false
          → copyFileSync(cachePath, destination + ".tmp")
          → renameSync(destination + ".tmp", destination)
      → return AssetDetail { path: destination, cached_from: cachePath }
```

Cost: one `copyFileSync`, one `renameSync`. Zero network I/O.

### Cache miss + `destination_path`

```
caller → fetch_asset({ id, destination_path })
      → ctx.cache.getPath(id, format, url)
          → existsSync(cachePath) → false
          → mkdirSync(versionDir, { recursive: true })
          → await fetcher(url)                  # network fetch
          → writeFileSync(cachePath + ".tmp", bytes)
          → renameSync(cachePath + ".tmp", cachePath)
      → copyToDestination(...)                  # same as cache-hit path
      → return AssetDetail { path: destination, cached_from: cachePath }
```

Cost: one network fetch, two `writeFile` + `rename` pairs (cache, then destination). Cache populated for the next call.

### The cache invariant, preserved

No `fetch_asset` call path deletes or moves cache entries. `copyToDestination` uses `copyFileSync`, not `renameSync` or link operations against the cache. "Second hit is free" holds unconditionally.

## Testing strategy

Four test layers.

### Unit: `test/assets/destination.test.ts` (new — 7 scenarios)

Isolates `copyToDestination`. Uses a tmpdir. No cache, no tool handler.

1. **Happy path** — destination absent → after call, destination exists, byte-identical to source.
2. **Atomicity** — no `<dest>.tmp` remains after success.
3. **Destination already exists** → `DestinationExists`, source unchanged, destination unchanged.
4. **Non-absolute path** → `InvalidInput`.
5. **Path with null byte** → `InvalidInput`.
6. **Destination directory missing** → `FetchFailed` with `reason: "destination_write_failed"`.
7. **Destination parent read-only** (`chmod 0o555`) → `FetchFailed` with `reason: "destination_write_failed"`.

Setup: `mkdtempSync(tmpdir(), "sf-logos-dest-")` in `beforeEach`, `rmSync(..., { recursive: true, force: true })` in `afterEach`. Sub-case 7 may need to restore permissions before rmSync.

### Integration: `test/tools/fetch-asset.test.ts` (extended — 8 scenarios)

Exercises the handler's composition logic. Mocks the cache with the existing test helper.

1. **Happy path** — `destination_path` supplied → response has `path = destinationPath`, `cached_from = <cache path>`, both files exist, byte-identical.
2. **`cached_from` reports the cache path** — regression guard.
3. **URL input + `destination_path`** → `InvalidInput`, message mentions `find_*`.
4. **`destination_path` + `mode="url"`** → `InvalidInput`.
5. **`destination_path` + `mode="bytes"`** → `InvalidInput`.
6. **`destination_path` + `mode="path"` (redundant)** → same as scenario 1.
7. **`destination_path` + unknown id** → `AssetNotFound` (cache/destination never touched).
8. **`destination_path` pointing to existing file** → `DestinationExists` (integration: exercises cache write then destination failure).

### Error union: `test/errors.test.ts` (modified)

Single assertion updated. Union-member array grows from 6 to 7; `expect(codes).toHaveLength(6)` → `.toHaveLength(7)`.

### Regression: `scripts/try-mcp.ts` (+2 scenarios)

Against the live server.

1. **`fetch_asset(id="icon-agentforce", destination_path="/tmp/try-mcp-<pid>-<ts>.png")`** — asserts `path === destination`, `cached_from` starts with `<OS cache>/sf-logos-mcp/`, file exists at destination. Cleanup at end.
2. **Retry with the same destination** → `DestinationExists`.

Regression count: 27 → 29.

### What we deliberately do NOT test

- Node `copyFileSync` / `renameSync` themselves — stdlib.
- Windows-specific path behavior — Node ≥ 20 POSIX-like behavior is the documented baseline.
- TOCTOU race between `existsSync` and `renameSync` — acknowledged; atomicity contract holds either way (lost race → `DestinationExists`, won race → success; both are fine).

### Test counts (phase 3A delta)

| Layer | Before | After | Δ |
|---|---|---|---|
| `test/assets/destination.test.ts` (new) | 0 | 7 | +7 |
| `test/tools/fetch-asset.test.ts` (ext) | 10 | 18 | +8 |
| `test/errors.test.ts` (mod) | 3 | 3 | 0 (assertion updated) |
| **`bun test` total** | **110** | **125** | **+15** |
| `scripts/try-mcp.ts` scenarios | 27 | 29 | +2 |
| `scripts/phase2-smoke.sh` | 7 | 7 | 0 (no change) |

Primer, LEARNINGS, and smoke script are all updated via the plan's task list.

## Open questions (resolved during brainstorming)

| # | Question | Decision |
|---|---|---|
| Q1 | Phase-3 scope | `fetch_asset(destination_path)` only. Other items deferred. |
| Q2 | Destination-already-exists behavior | Fail with new `DestinationExists` error code. Transparency over forgiveness. |
| Q3 | Path form accepted | Absolute only. No tilde expansion, no relative paths. |
| Q4 | Cache interaction | Always write to cache first, then copy to destination. Cache preserved unconditionally. |
| Q5 | Response shape | `path` = destination, `cached_from` = cache path (new diagnostic field). |
| Q6 | Input validation depth | Minimal: absolute + no null byte. OS permissions are the enforcement boundary. |
| Q7 | `mode` + `destination_path` | `destination_path` implies `mode="path"`. Other modes + `destination_path` = `InvalidInput`. |
| Q8 | URL input + `destination_path` | Rejected. URL input remains `mode="url"`-only. |
| Q9 | Write atomicity | `.tmp` in the destination's own directory → `rename` in place. Same filesystem guaranteed. |
| A-approach | Code structure | Approach B — new `src/assets/destination.ts` module, orthogonal to fetch/cache. |

## Out of scope (filed as phase 3B/3C/…)

- **npm publish pipeline** — CHANGELOG, publish workflow, release tagging.
- **Full documentation set** — README, docs/getting-started.md, docs/tools.md, docs/architecture.md, docs/metadata-shape.md, docs/aspect-ratio.md, docs/contributing.md, LICENSE, CHANGELOG.md. Per original spec §5.7.
- **CI hardening** — node-test parity, `test:error-codes`, `test:public-api`, `test:cli`, `docs:check`. Per original spec §5.4.7.
- **Symmetric advisory for `find_brand_logo`** — `only_light_surface_standalone_available` when `co_branded: false` eliminates all dark-surface options. Small polish; mirrors existing pattern.

Each is a separate spec when its turn comes.

## Acceptance criteria

1. `fetch_asset(id, destination_path)` writes the asset to the destination atomically, returns `path + cached_from`, and preserves the cache entry.
2. `fetch_asset(id, destination_path)` on an existing file fails with `DestinationExists`.
3. All existing phase-2 contracts hold: no regression in the other five tools, `mode="url"` and `mode="bytes"` behavior unchanged, cache invariants preserved.
4. Gates: `bun run typecheck`, `bun run lint`, `bun test` (125 pass), `bun run try:check` (29/29), `bun run phase2:smoke` (7 pass).
5. 2026-04-27 dog-food Turn 9's observation ("MCP will re-fetch from CDN on next use") no longer applies when callers use `destination_path`.
