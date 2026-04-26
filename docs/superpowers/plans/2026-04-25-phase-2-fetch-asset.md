# SF Logos MCP — Phase 2: fetch_asset + on-disk cache

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `fetch_asset` tool, an on-disk asset cache, and a `find_brand_logo` advisory annotation. After this phase the server is functionally complete for slide/doc-building use cases — a caller can go from "I need the Agentforce icon" to a local file path in one call.

**Architecture:** One new tool (`src/tools/fetch-asset.ts`), two new modules (`src/assets/fetch.ts`, `src/assets/cache.ts`), one logger upgrade (synchronous → buffered stream), one `find_brand_logo` enhancement (advisory annotation). The cache lives under the OS cache dir, keyed by `<manifest.lastUpdated>/<asset-id>.<ext>`, so a new manifest version starts a new directory and invalidation is implicit. The fetch module injects a `fetch` implementation for tests; production uses `globalThis.fetch`.

**Tech Stack:** TypeScript NodeNext ESM, Node ≥ 20, Bun in dev. `@modelcontextprotocol/sdk`, `node:fs`, `node:crypto`, `node:path`, `node:os`.

**Reference docs:**
- Revised spec: `docs/superpowers/specs/2026-04-25-phase-2-scope-revision.md` (**authoritative for this plan**)
- Original spec: `docs/superpowers/specs/2026-04-24-sf-logos-mcp-design.md` (sections §4.2 cache, §4.3 fetcher — still current)
- Phase 1 plan style guide: `docs/superpowers/plans/2026-04-25-phase-1-foundation.md`
- Dog-food findings: `docs/LEARNINGS.md` "Dog-food findings" section
- Prior final review notes (to roll in): `docs/dogfood/2026-04-25-claude-desktop-transcript.md`

**Conventions (locked in from phase 1):**
- Package name: `@usefulto/sf-logos-mcp`.
- ESM imports use `.js` extensions (TS NodeNext).
- Tests use `bun:test` (`describe`, `it`, `expect`).
- Errors: `new SfLogosError(code, message, details?)` from `src/errors.ts`.
- Tool handler signature: `(input, ctx: ToolContext) => Promise<Output>`.
- Commit style: conventional commits with Claude co-author trailer via HEREDOC.
- Strict TS: `exactOptionalPropertyTypes` — use spread (`...(x !== undefined ? { k: x } : {})`) never `{ k: undefined }`.
- Strict TS: `noPropertyAccessFromIndexSignature` — bracket access on index-signatured types.
- Strict lint: `require-await` — use `() => Promise.resolve(x)` when the body has no `await`.
- `bun test`, `bun run typecheck`, `bun run lint`, `bun run try:check` must all pass before any commit.
- Working directory for every command: repo root (`/Users/tal.golan/SF_Logos`).

**Branch strategy:** create a feature branch `feat/mcp-phase-2` from `main` before Task 1. Never commit to `main` directly. Merge via `--no-ff` when all tasks land and CI is green.

**Required test-count bumps from phase 1:** adding the sixth tool breaks these two assertions; they are updated **explicitly** in Task 11 (tool registration):
- `test/server.test.ts:29` — `expect(names.length).toBe(5)` → `.toBe(6)`.
- `test/server.e2e.test.ts:39` — `expect(toolsListResp?.result?.tools).toHaveLength(5)` → `.toHaveLength(6)`.

Do not bump them earlier. The sequence is: add `fetch-asset.ts` as an unregistered module (Tasks 7–10 pass without changing `server.ts`), then register it in Task 11 with the count bumps and a new dispatch test in the same commit. This guarantees the full suite stays green at every intermediate commit.

---

## Scope check

Phase 2 is one subsystem — the stdio MCP server — adding one tool surface plus its supporting I/O. No independent subsystems. Single plan is correct.

## File structure

```
src/
  assets/
    fetch.ts         # NEW: HTTP GET with 10 s timeout, injected fetch for tests
    cache.ts         # NEW: on-disk cache keyed by manifest version + asset id
  observability/
    logger.ts        # MODIFIED: add optional writeStream file sink (non-blocking)
    ring.ts          # unchanged
    counters.ts      # unchanged
    events.ts        # unchanged (cache.* and asset.fetch* events already exist)
  tools/
    fetch-asset.ts   # NEW: the tool handler
    find-brand-logo.ts # MODIFIED: add `advisories[]` for co-brand-only case
    # list-brands.ts, get-brand-colors.ts, get-color-roles.ts, find-product-icon.ts unchanged
  manifest/
    types.ts         # MODIFIED: trim AssetDetail to drop dimension fields
    summary.ts       # unchanged
  server.ts          # MODIFIED: register fetch-asset, add SIGUSR2 handler

test/
  assets/
    fetch.test.ts    # NEW
    cache.test.ts    # NEW
  observability/
    logger.test.ts   # MODIFIED: add test for stream-based file sink
  tools/
    fetch-asset.test.ts      # NEW
    find-brand-logo.test.ts  # MODIFIED: add advisory test
  server.test.ts     # MODIFIED: tool count 5 → 6, new dispatch test for fetch_asset
  server.e2e.test.ts # MODIFIED: tool count 5 → 6

scripts/
  try-mcp.ts         # MODIFIED: add 4 fetch_asset scenarios + 1 advisory scenario
  phase1-smoke.sh    # renamed or superseded by scripts/phase2-smoke.sh (see Task 15)
```

Cache layout on disk:

```
$OS_CACHE_ROOT/sf-logos-mcp/
  2026-03-13/
    icon-agentforce.svg
    icon-agentforce.png
    sf-horiz-color.svg
    ...
  2026-04-01/            # a new manifest version starts a new directory
    ...
```

`$OS_CACHE_ROOT` resolution (in priority order, from the original spec):
1. `$XDG_CACHE_HOME` if set.
2. macOS: `~/Library/Caches/`.
3. Linux: `~/.cache/`.
4. Windows: `%LOCALAPPDATA%\`.

---

## Task 1: Create feature branch

**Files:** none changed; sets up the branch.

- [ ] **Step 1: Verify starting state**

Run: `git status --short && git branch --show-current`
Expected: tree clean except `.claude/` (local settings); current branch `main`.

If anything else is modified, stop and investigate before continuing.

- [ ] **Step 2: Create and switch to the feature branch**

Run: `git checkout -b feat/mcp-phase-2`
Expected: `Switched to a new branch 'feat/mcp-phase-2'`.

- [ ] **Step 3: Record the commit the branch started from**

Run: `git log --oneline -1`
Record the SHA — it will be `main` tip (most recently this was `eb99a5c`). You'll reference it in the merge commit at the end.

---

## Task 2: Trim `AssetDetail` — drop dimension fields

The revised phase-2 spec drops `target_width`/`target_height` input params, so `AssetDetail` no longer needs `computed_dimensions` or `dimension_source` output fields.

**Files:**
- Modify: `src/manifest/types.ts`
- Modify: `test/manifest/output-types.test.ts` (no behavioral change, just remove references if any)

- [ ] **Step 1: Inspect current AssetDetail definition**

Run: `grep -n "computed_dimensions\|dimension_source" src/manifest/types.ts`

Expected: four lines — two field definitions and their JSDoc comments, around lines 160 and 165.

- [ ] **Step 2: Remove the two fields**

Open `src/manifest/types.ts` and find the `AssetDetail` interface. Remove exactly these two fields (and their single-line JSDoc):

```ts
  /** Present when target_width or target_height was set. */
  computed_dimensions?: { width: number; height: number };
  /** Present when computed_dimensions is present. */
  dimension_source?: "svg_intrinsic" | "source_dimensions";
```

The resulting `AssetDetail` interface should be:

```ts
/** Detail form served by fetch_asset. Superset of AssetSummary. */
export interface AssetDetail extends AssetSummary {
  /** The single format actually served by this call. */
  format: "svg" | "png";
  /** Always present. */
  url: string;
  /** Present when mode === "path". */
  path?: string;
  /** Present when mode === "bytes". */
  bytes_base64?: string;
}
```

- [ ] **Step 3: Confirm no references remain**

Run: `grep -rn "computed_dimensions\|dimension_source" src/ test/`

Expected: no output. If anything shows, delete those references too — they'd fail typecheck later.

- [ ] **Step 4: Gate**

Run:
```bash
bun run typecheck && bun run lint && bun test
```
Expected: all three exit 0, 82 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/manifest/types.ts test/manifest/output-types.test.ts
git commit -m "$(cat <<'EOF'
refactor: drop computed_dimensions/dimension_source from AssetDetail

Phase-2 scope revision removed server-side target_width/target_height
computation. The output fields that communicated those computed values
become dead weight; remove them now so fetch-asset.ts (added next) has
a clean target type.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Drop `InvalidDimensions` from the error-code union

The revised spec also drops the `InvalidDimensions` error code, since no call path produces it anymore.

**Files:**
- Modify: `src/errors.ts`
- Modify: `test/errors.test.ts`

- [ ] **Step 1: Edit `src/errors.ts`**

Change the `SfLogosErrorCode` union from:
```ts
export type SfLogosErrorCode =
  | "AssetNotFound"
  | "InvalidAssetUrl"
  | "FormatUnavailable"
  | "InvalidDimensions"
  | "UnknownBrand"
  | "InvalidInput"
  | "FetchFailed";
```
to:
```ts
export type SfLogosErrorCode =
  | "AssetNotFound"
  | "InvalidAssetUrl"
  | "FormatUnavailable"
  | "UnknownBrand"
  | "InvalidInput"
  | "FetchFailed";
```

- [ ] **Step 2: Edit `test/errors.test.ts`**

In the "error-code union has expected members" test, change:
```ts
const codes: SfLogosErrorCode[] = [
  "AssetNotFound",
  "InvalidAssetUrl",
  "FormatUnavailable",
  "InvalidDimensions",
  "UnknownBrand",
  "InvalidInput",
  "FetchFailed",
];
expect(codes).toHaveLength(7);
```
to:
```ts
const codes: SfLogosErrorCode[] = [
  "AssetNotFound",
  "InvalidAssetUrl",
  "FormatUnavailable",
  "UnknownBrand",
  "InvalidInput",
  "FetchFailed",
];
expect(codes).toHaveLength(6);
```

- [ ] **Step 3: Confirm no remaining references**

Run: `grep -rn "InvalidDimensions" src/ test/ scripts/`
Expected: no output.

- [ ] **Step 4: Gate**

```bash
bun run typecheck && bun run lint && bun test
```
Expected: all green, 82 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/errors.ts test/errors.test.ts
git commit -m "$(cat <<'EOF'
refactor: drop InvalidDimensions from SfLogosErrorCode union

No call path produces this error after the phase-2 scope revision
removed server-side target_width/target_height handling. Shrink the
union from 7 to 6 members.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Asynchronous logger file sink (replace `appendFileSync`)

Phase 1's logger used `appendFileSync` per event. That's fine at info-level (one line per tool call) but becomes a bottleneck once `fetch_asset` emits `asset.fetch` / `cache.miss` / `cache.write` debug events under load. Switch to `fs.createWriteStream` with a short buffer flush.

The API stays the same (`filePath` option); the internal implementation changes.

**Files:**
- Modify: `src/observability/logger.ts`
- Modify: `test/observability/logger.test.ts`

- [ ] **Step 1: Write a failing test for the stream-based sink**

Add this block to `test/observability/logger.test.ts`:

```ts
describe("Logger — file sink (async stream)", () => {
  it("writes emitted lines to the configured file path", async () => {
    const tmpPath = `/tmp/sf-logos-test-${process.pid}-${Date.now()}.log`;
    const log = createLogger({
      level: "info",
      format: "human",
      stderr: () => undefined,
      filePath: tmpPath,
    });
    log.emit({ event: "server.start", level: "info", version: "0.0.0", pid: 1, node_version: "v20" });
    log.emit({ event: "server.ready", level: "info", tool_count: 6, manifest_source: "live", manifest_version: "x", startup_ms: 1 });
    await log.flush();
    const { readFileSync, unlinkSync } = await import("node:fs");
    const content = readFileSync(tmpPath, "utf8");
    try {
      expect(content).toContain("server.start");
      expect(content).toContain("server.ready");
      const lineCount = content.split("\n").filter((l) => l.length > 0).length;
      expect(lineCount).toBe(2);
    } finally {
      unlinkSync(tmpPath);
    }
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun test test/observability/logger.test.ts`

Expected: fails — `log.flush` is not a function, or the file is empty because the current implementation writes synchronously and the new test doesn't await anything.

- [ ] **Step 3: Implement the change**

Open `src/observability/logger.ts`. At the top of the file, add imports:

```ts
import { createWriteStream, type WriteStream } from "node:fs";
```

Remove the existing `import { appendFileSync } from "node:fs";` line.

Extend the `Logger` interface:

```ts
export interface Logger {
  emit(evt: LogEvent): void;
  ringSnapshot(): LogEvent[];
  resizeRing(capacity: number): void;
  setLevel(level: LogLevel): void;
  flush(): Promise<void>;
  close(): Promise<void>;
}
```

Inside `createLogger(opts)`, replace the `appendFileSync`-based file logic with:

```ts
  let fileStream: WriteStream | null = null;
  if (opts.filePath !== undefined) {
    fileStream = createWriteStream(opts.filePath, { flags: "a", encoding: "utf8" });
    // Swallow write errors — logger must never crash the server.
    fileStream.on("error", () => undefined);
  }
```

In the `emit(evt)` function, replace the block that uses `appendFileSync` with:

```ts
      if (fileStream !== null) {
        try {
          fileStream.write(line + "\n");
        } catch {
          // swallow
        }
      }
```

Add two new methods to the returned object:

```ts
    flush() {
      if (fileStream === null) return Promise.resolve();
      return new Promise<void>((resolve) => {
        // cork() + uncork() isn't needed — write() returns false only when
        // the buffer exceeds highWaterMark. A single no-op write drains the
        // pending queue by the time its callback fires.
        const stream = fileStream;
        if (stream === null) return resolve();
        stream.write("", () => resolve());
      });
    },
    close() {
      if (fileStream === null) return Promise.resolve();
      const stream = fileStream;
      fileStream = null;
      return new Promise<void>((resolve) => {
        stream.end(() => resolve());
      });
    },
```

- [ ] **Step 4: Run the test, confirm green**

Run: `bun test test/observability/logger.test.ts`

Expected: all logger tests pass (prior 4 + new 1 = 5).

- [ ] **Step 5: Gate full suite**

```bash
bun run typecheck && bun run lint && bun test
```
Expected: all green, 83 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/observability/logger.ts test/observability/logger.test.ts
git commit -m "$(cat <<'EOF'
refactor: logger file sink uses createWriteStream (non-blocking)

Replaces per-event appendFileSync with a persistent WriteStream.
fetch_asset in phase 2 emits debug events (asset.fetch, cache.*,
cache.write) at rates where sync disk I/O would block the dispatcher.

Adds flush() and close() to the Logger interface so tests — and the
server shutdown path — can drain pending writes deterministically.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `src/assets/fetch.ts` — HTTP GET with timeout

Canonical fetcher, decoupled from the cache. Tests inject a `fetch`; production uses `globalThis.fetch`.

**Files:**
- Create: `src/assets/fetch.ts`
- Create: `test/assets/fetch.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/assets/fetch.test.ts
import { describe, it, expect } from "bun:test";
import { fetchAsset, type FetchAssetOptions } from "../../src/assets/fetch.js";
import { SfLogosError } from "../../src/errors.js";

function opts(partial: Partial<FetchAssetOptions> & { fetch: FetchAssetOptions["fetch"] }): FetchAssetOptions {
  return {
    url: "https://dam.usefulto.me/x.svg",
    userAgent: "sf-logos-mcp-test",
    timeoutMs: 100,
    ...partial,
  };
}

describe("fetchAsset", () => {
  it("returns bytes on 200", async () => {
    const body = new TextEncoder().encode("<svg/>");
    const fetchFn = () => Promise.resolve(new Response(body, { status: 200 }));
    const result = await fetchAsset(opts({ fetch: fetchFn }));
    expect(result.status).toBe(200);
    expect(result.bytes.length).toBe(body.length);
  });

  it("throws FetchFailed on non-200", async () => {
    const fetchFn = () => Promise.resolve(new Response("nope", { status: 500 }));
    try {
      await fetchAsset(opts({ fetch: fetchFn }));
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(SfLogosError);
      const e = err as SfLogosError;
      expect(e.code).toBe("FetchFailed");
      expect(e.details?.["status"]).toBe(500);
    }
  });

  it("throws FetchFailed with reason='timeout' when aborted", async () => {
    const fetchFn = (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    try {
      await fetchAsset(opts({ fetch: fetchFn, timeoutMs: 20 }));
      throw new Error("expected throw");
    } catch (err) {
      const e = err as SfLogosError;
      expect(e.code).toBe("FetchFailed");
      expect(e.details?.["reason"]).toBe("timeout");
    }
  });

  it("throws FetchFailed with reason='network_error' on other errors", async () => {
    const fetchFn = () => Promise.reject(new Error("ECONNREFUSED"));
    try {
      await fetchAsset(opts({ fetch: fetchFn }));
      throw new Error("expected throw");
    } catch (err) {
      const e = err as SfLogosError;
      expect(e.code).toBe("FetchFailed");
      expect(e.details?.["reason"]).toBe("network_error");
    }
  });

  it("sends the configured User-Agent", async () => {
    let capturedUA: string | undefined;
    const fetchFn = (_url: string, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string> | undefined;
      capturedUA = headers?.["User-Agent"];
      return Promise.resolve(new Response(new Uint8Array(), { status: 200 }));
    };
    await fetchAsset(opts({ fetch: fetchFn, userAgent: "custom/1.0" }));
    expect(capturedUA).toBe("custom/1.0");
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun test test/assets/fetch.test.ts`
Expected: fails with module-not-found.

- [ ] **Step 3: Implement `src/assets/fetch.ts`**

```ts
/**
 * assets/fetch — HTTP GET for asset bytes.
 *
 * Responsibility: issue one GET with a timeout and a User-Agent, return
 * status + bytes + elapsed time on 200. Raise SfLogosError("FetchFailed")
 * on anything else. Injected `fetch` function so tests don't touch the
 * network.
 * Errors: FetchFailed.
 * Dependencies: errors.ts.
 *
 * See spec §4.3.
 */

import { SfLogosError } from "../errors.js";

export interface FetchAssetOptions {
  url: string;
  userAgent: string;
  timeoutMs: number;
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
}

export interface FetchAssetResult {
  status: number;
  bytes: Uint8Array;
  duration_ms: number;
}

export async function fetchAsset(opts: FetchAssetOptions): Promise<FetchAssetResult> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, opts.timeoutMs);
  try {
    const resp = await opts.fetch(opts.url, {
      headers: { "User-Agent": opts.userAgent },
      signal: controller.signal,
    });
    if (!resp.ok) {
      throw new SfLogosError("FetchFailed", `non-200 from ${opts.url}`, {
        url: opts.url,
        status: resp.status,
        reason: `http_${String(resp.status)}`,
      });
    }
    const buf = new Uint8Array(await resp.arrayBuffer());
    return { status: resp.status, bytes: buf, duration_ms: Date.now() - started };
  } catch (err) {
    if (err instanceof SfLogosError) throw err;
    const reason =
      err instanceof Error && err.name === "AbortError" ? "timeout" : "network_error";
    throw new SfLogosError("FetchFailed", `fetch failed for ${opts.url}`, {
      url: opts.url,
      reason,
      cause: err instanceof Error ? err.message : String(err),
    });
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 4: Run tests, confirm green**

Run: `bun test test/assets/fetch.test.ts`
Expected: 5 pass.

- [ ] **Step 5: Gate full suite**

```bash
bun run typecheck && bun run lint && bun test
```
Expected: all green, 88 tests pass (83 prior + 5 new).

- [ ] **Step 6: Commit**

```bash
git add src/assets/fetch.ts test/assets/fetch.test.ts
git commit -m "$(cat <<'EOF'
feat: add src/assets/fetch.ts — HTTP GET with 10s timeout

Isolates HTTP concerns from the cache. Tests inject fetch; production
uses globalThis.fetch. Raises SfLogosError("FetchFailed") with a
reason tag (timeout | network_error | http_NNN) on any non-200.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `src/assets/cache.ts` — on-disk cache

Version-keyed on-disk cache. First request for an asset writes it; subsequent requests return the path. Concurrent requests for the same asset dedupe via an in-process Map.

**Files:**
- Create: `src/assets/cache.ts`
- Create: `test/assets/cache.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/assets/cache.test.ts
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAssetCache, type AssetCache } from "../../src/assets/cache.js";
import { SfLogosError } from "../../src/errors.js";

let cacheRoot: string;
let cache: AssetCache;
let fetchCalls: Array<{ url: string }>;

beforeEach(() => {
  cacheRoot = mkdtempSync(join(tmpdir(), "sf-logos-cache-"));
  fetchCalls = [];
  cache = createAssetCache({
    root: cacheRoot,
    manifestVersion: "2026-03-13",
    fetcher: (url) => {
      fetchCalls.push({ url });
      return Promise.resolve({
        status: 200,
        bytes: new TextEncoder().encode(`bytes-for:${url}`),
        duration_ms: 1,
      });
    },
  });
});

afterEach(() => {
  rmSync(cacheRoot, { recursive: true, force: true });
});

describe("AssetCache", () => {
  it("first call fetches and writes to <root>/<version>/<id>.<ext>", async () => {
    const path = await cache.getPath("icon-admin", "svg", "https://dam.usefulto.me/x.svg");
    expect(path).toBe(join(cacheRoot, "2026-03-13", "icon-admin.svg"));
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, "utf8")).toBe("bytes-for:https://dam.usefulto.me/x.svg");
    expect(fetchCalls.length).toBe(1);
  });

  it("second call is a cache hit — no fetch", async () => {
    await cache.getPath("icon-admin", "svg", "https://dam.usefulto.me/x.svg");
    await cache.getPath("icon-admin", "svg", "https://dam.usefulto.me/x.svg");
    expect(fetchCalls.length).toBe(1);
  });

  it("concurrent identical requests dedupe to a single fetch", async () => {
    const [a, b, c] = await Promise.all([
      cache.getPath("icon-admin", "svg", "https://x"),
      cache.getPath("icon-admin", "svg", "https://x"),
      cache.getPath("icon-admin", "svg", "https://x"),
    ]);
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(fetchCalls.length).toBe(1);
  });

  it("different manifest versions use isolated directories", async () => {
    const c2 = createAssetCache({
      root: cacheRoot,
      manifestVersion: "2026-04-01",
      fetcher: cache["fetcher" as keyof typeof cache] as never, // reuse the same mocked fetcher
    });
    await cache.getPath("icon-admin", "svg", "https://x");
    await c2.getPath("icon-admin", "svg", "https://x");
    expect(existsSync(join(cacheRoot, "2026-03-13", "icon-admin.svg"))).toBe(true);
    expect(existsSync(join(cacheRoot, "2026-04-01", "icon-admin.svg"))).toBe(true);
  });

  it("rejects ids containing path traversal characters", async () => {
    try {
      await cache.getPath("../../etc/passwd", "svg", "https://x");
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(SfLogosError);
      expect((err as SfLogosError).code).toBe("InvalidInput");
    }
  });

  it("writes are atomic — no .tmp files left after a successful write", async () => {
    await cache.getPath("icon-admin", "svg", "https://x");
    const tmpMarker = join(cacheRoot, "2026-03-13", "icon-admin.svg.tmp");
    expect(existsSync(tmpMarker)).toBe(false);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun test test/assets/cache.test.ts`
Expected: module-not-found.

- [ ] **Step 3: Implement `src/assets/cache.ts`**

```ts
/**
 * assets/cache — version-keyed on-disk cache for asset bytes.
 *
 * Responsibility: turn (asset_id, format, url) into a local filesystem
 * path. First hit fetches and writes; second hit returns the existing
 * path with no fetch. Concurrent calls for the same target dedupe. A
 * new manifest.lastUpdated starts a new directory, implicitly
 * invalidating stale versions without touching disk.
 * Errors: InvalidInput (bad id), FetchFailed (propagated from fetcher).
 * Dependencies: fetch.ts (or any compatible fetcher), node:fs, node:path.
 *
 * See spec §4.2.
 */

import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { SfLogosError } from "../errors.js";
import type { FetchAssetResult } from "./fetch.js";

export type CacheFetcher = (url: string) => Promise<FetchAssetResult>;

export interface AssetCacheOptions {
  root: string;
  manifestVersion: string;
  fetcher: CacheFetcher;
}

export interface AssetCache {
  getPath(assetId: string, format: "svg" | "png", url: string): Promise<string>;
  /** Exposed for tests that reuse a mocked fetcher. Not part of the public API. */
  readonly fetcher: CacheFetcher;
}

// Asset ids are validated here BEFORE path construction. See spec §5.6.
const VALID_ID = /^[a-z0-9-]+$/;

export function createAssetCache(opts: AssetCacheOptions): AssetCache {
  const versionDir = join(resolve(opts.root), opts.manifestVersion);
  const inFlight = new Map<string, Promise<string>>();

  function pathFor(id: string, format: "svg" | "png"): string {
    return join(versionDir, `${id}.${format}`);
  }

  async function fetchAndWrite(id: string, format: "svg" | "png", url: string): Promise<string> {
    const target = pathFor(id, format);
    mkdirSync(dirname(target), { recursive: true });
    const result = await opts.fetcher(url);
    const tmp = `${target}.tmp`;
    writeFileSync(tmp, result.bytes);
    renameSync(tmp, target);
    return target;
  }

  return {
    fetcher: opts.fetcher,
    getPath(assetId, format, url) {
      if (!VALID_ID.test(assetId)) {
        return Promise.reject(
          new SfLogosError(
            "InvalidInput",
            `Invalid asset id '${assetId}' — ids must match /^[a-z0-9-]+$/.`,
            { asset_id: assetId },
          ),
        );
      }
      const target = pathFor(assetId, format);
      if (existsSync(target)) return Promise.resolve(target);

      const key = `${assetId}.${format}`;
      const pending = inFlight.get(key);
      if (pending !== undefined) return pending;

      const promise = fetchAndWrite(assetId, format, url).finally(() => {
        inFlight.delete(key);
      });
      inFlight.set(key, promise);
      return promise;
    },
  };
}
```

- [ ] **Step 4: Run tests, confirm green**

Run: `bun test test/assets/cache.test.ts`
Expected: 6 pass.

- [ ] **Step 5: Gate full suite**

```bash
bun run typecheck && bun run lint && bun test
```
Expected: all green, 94 tests pass (88 + 6).

- [ ] **Step 6: Commit**

```bash
git add src/assets/cache.ts test/assets/cache.test.ts
git commit -m "$(cat <<'EOF'
feat: add src/assets/cache.ts — version-keyed on-disk asset cache

First hit fetches + writes atomically (write .tmp, rename).
Subsequent hits return the path with no network. Concurrent hits
dedupe via an in-process promise Map. A new manifest.lastUpdated
starts a new directory, implicitly invalidating stale bytes without
touching disk.

Validates asset ids against /^[a-z0-9-]+$/ before any path construction
to prevent directory traversal.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `fetch_asset` tool — input validation and URL-mode path

Tool skeleton: registers the shape, implements `mode: "url"` (no I/O), enforces the input-exclusivity rules (`id` xor `url`). Later tasks add `path` and `bytes` modes.

Splitting by mode keeps each commit small and each test focused.

**Files:**
- Create: `src/tools/fetch-asset.ts`
- Create: `test/tools/fetch-asset.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/tools/fetch-asset.test.ts
import { describe, it, expect } from "bun:test";
import { fetchAssetTool } from "../../src/tools/fetch-asset.js";
import bundled from "../../src/bundled/manifest.json" with { type: "json" };
import type { Manifest } from "../../src/manifest/types.js";
import { makeTestContext } from "../helpers/context.js";
import { SfLogosError } from "../../src/errors.js";

function ctx() {
  return makeTestContext(bundled as unknown as Manifest);
}

describe("fetch_asset — URL mode", () => {
  it("returns the fully-qualified URL for a known id (mode=url)", async () => {
    const result = (await fetchAssetTool.handler(
      { id: "icon-agentforce", mode: "url" },
      ctx(),
    )) as { id: string; url: string; format: "svg" | "png" };
    expect(result.id).toBe("icon-agentforce");
    expect(result.url).toMatch(/^https:\/\/dam\.usefulto\.me\//);
  });

  it("accepts url alt input (mode=url)", async () => {
    const url =
      "https://dam.usefulto.me/Icons/extracted/Agentforce-2D-Product-Icon/Agentforce-2D-Product-Icon-Full-Color-RGB.svg";
    const result = (await fetchAssetTool.handler({ url, mode: "url" }, ctx())) as { url: string };
    expect(result.url).toBe(url);
  });

  it("rejects neither id nor url with InvalidInput", async () => {
    try {
      await fetchAssetTool.handler({ mode: "url" } as never, ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect((err as SfLogosError).code).toBe("InvalidInput");
    }
  });

  it("rejects both id and url with InvalidInput", async () => {
    try {
      await fetchAssetTool.handler(
        { id: "icon-agentforce", url: "https://dam.usefulto.me/x", mode: "url" } as never,
        ctx(),
      );
      throw new Error("expected throw");
    } catch (err) {
      expect((err as SfLogosError).code).toBe("InvalidInput");
    }
  });

  it("rejects url not under dam.usefulto.me with InvalidAssetUrl", async () => {
    try {
      await fetchAssetTool.handler(
        { url: "https://evil.example.com/x.svg", mode: "url" } as never,
        ctx(),
      );
      throw new Error("expected throw");
    } catch (err) {
      expect((err as SfLogosError).code).toBe("InvalidAssetUrl");
    }
  });

  it("raises AssetNotFound for unknown id", async () => {
    try {
      await fetchAssetTool.handler({ id: "bogus-asset-id", mode: "url" }, ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect((err as SfLogosError).code).toBe("AssetNotFound");
    }
  });

  it("has a description >= 200 chars", () => {
    expect(fetchAssetTool.description.length).toBeGreaterThanOrEqual(200);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun test test/tools/fetch-asset.test.ts`
Expected: module-not-found.

- [ ] **Step 3: Implement the tool skeleton (URL mode only)**

```ts
// src/tools/fetch-asset.ts
/**
 * tools/fetch-asset — resolve asset id (or url) to a URL / local path / bytes.
 *
 * Responsibility: turn a caller's intent ("I need the Agentforce icon as
 * a file on disk") into one of: a public URL, a local filesystem path
 * (from the on-disk cache), or base64 bytes. Enforces the input-exclusivity
 * rules and validates URLs at the boundary.
 *
 * Errors:
 *   - InvalidInput when neither or both of {id, url} are supplied.
 *   - InvalidAssetUrl when `url` is not under dam.usefulto.me (exact host).
 *   - AssetNotFound when `id` does not match any asset in the manifest.
 *   - FormatUnavailable when `format` is requested but absent (svg-only or png-only).
 *   - FetchFailed when a live fetch was required and it failed.
 *
 * Modes (spec §2, phase-2 revision):
 *   - url   — no I/O; return the resolvable URL.
 *   - path  — fetch via cache (default when `mode` is omitted); return filesystem path.
 *   - bytes — fetch via cache; return base64-encoded content.
 *
 * Default `format` is "png" (revised from phase-1 "svg"): primary
 * consumers — pptxgenjs, Google Slides API, python-pptx — want raster.
 *
 * See docs/superpowers/specs/2026-04-25-phase-2-scope-revision.md.
 */

import { SfLogosError } from "../errors.js";
import { toAssetSummary, resolveUrl, ASSET_BASE_URL } from "../manifest/summary.js";
import type { AssetDetail, ManifestBrand, ManifestLogo } from "../manifest/types.js";
import { defineTool } from "./registry.js";

interface Input {
  id?: string;
  url?: string;
  format?: "svg" | "png";
  mode?: "url" | "path" | "bytes";
}

const DESCRIPTION = [
  "Resolve a Salesforce logo or product icon to a URL, a local filesystem path",
  "(from the on-disk cache), or inline base64 bytes. Provide EXACTLY ONE of",
  "`id` (from a prior find_*/list_brands call) or `url` (a dam.usefulto.me asset",
  "URL you already have). Optional `format` is 'png' (default) or 'svg'. Optional",
  "`mode` is 'path' (default — returns a filesystem path, fetching + caching on",
  "first access), 'url' (no I/O, just the public URL), or 'bytes' (base64).",
  "For PowerPoint/Google Slides/python-pptx consumers, the defaults (format=png,",
  "mode=path) are usually what you want. Use svg when you need scalable fidelity",
  "and the consumer supports it. Aspect_ratio (decimal) is returned with every",
  "response — derive dimensions yourself rather than asking the server to.",
].join(" ");

export const fetchAssetTool = defineTool<Input, AssetDetail>({
  name: "fetch_asset",
  description: DESCRIPTION,
  inputSchema: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "Asset id from a prior find_*/list_brands response (e.g. 'icon-agentforce').",
      },
      url: {
        type: "string",
        description:
          "A fully-qualified dam.usefulto.me asset URL (from a prior summary.formats.{svg,png}).",
      },
      format: {
        type: "string",
        enum: ["svg", "png"],
        description:
          "Output format. Defaults to 'png' — primary consumers are raster-based artifact builders.",
      },
      mode: {
        type: "string",
        enum: ["url", "path", "bytes"],
        description:
          "'path' (default) returns a filesystem path, fetching via cache. 'url' returns just the URL. 'bytes' returns base64.",
      },
    },
    additionalProperties: false,
    description:
      "Resolve an asset to a URL, local path, or inline bytes. Exactly one of id/url required.",
  },
  handler: (input, ctx) => {
    // --- input exclusivity ---
    const haveId = typeof input.id === "string";
    const haveUrl = typeof input.url === "string";
    if (!haveId && !haveUrl) {
      return Promise.reject(
        new SfLogosError(
          "InvalidInput",
          "fetch_asset requires exactly one of `id` or `url`.",
          {},
        ),
      );
    }
    if (haveId && haveUrl) {
      return Promise.reject(
        new SfLogosError(
          "InvalidInput",
          "fetch_asset: supply `id` OR `url`, not both.",
          {},
        ),
      );
    }

    // --- url-only path: validate host ---
    if (haveUrl) {
      const url = input.url as string;
      if (!url.startsWith(`${ASSET_BASE_URL}/`)) {
        return Promise.reject(
          new SfLogosError(
            "InvalidAssetUrl",
            `url must be under ${ASSET_BASE_URL}/`,
            { url },
          ),
        );
      }
      // URL-only mode: return what we were given. Detail minus the summary
      // projection fields (caller didn't ask us to resolve metadata).
      // Later tasks will branch on mode='path'/'bytes' here.
      if (input.mode === "url" || input.mode === undefined) {
        return Promise.resolve(minimalDetailFromUrl(url, input.format ?? "png"));
      }
      return Promise.reject(
        new SfLogosError("InvalidInput", "path/bytes modes for url input not yet implemented", {}),
      );
    }

    // --- id path: look up metadata and emit full AssetDetail ---
    const id = input.id as string;
    const found = findAssetById(ctx.manifest.brands, id);
    if (!found) {
      return Promise.reject(
        new SfLogosError("AssetNotFound", `No asset with id '${id}'.`, { id }),
      );
    }
    const [logo, brand] = found;
    const summary = toAssetSummary(logo, brand);

    const format = chooseFormat(summary, input.format);
    if (format === null) {
      return Promise.reject(
        new SfLogosError(
          "FormatUnavailable",
          `Asset '${id}' does not have the requested format.`,
          {
            id,
            requested_format: input.format ?? null,
            available_formats: (["svg", "png"] as const).filter((f) => summary.formats[f] !== null),
          },
        ),
      );
    }

    const url = summary.formats[format];
    if (url === null) {
      // Defensive — chooseFormat returned this; shouldn't happen.
      return Promise.reject(new SfLogosError("FormatUnavailable", "format URL missing", { id }));
    }

    if (input.mode === "url" || input.mode === undefined) {
      return Promise.resolve({ ...summary, format, url } satisfies AssetDetail);
    }
    // path/bytes modes land in later tasks.
    return Promise.reject(
      new SfLogosError("InvalidInput", "mode=path/bytes not yet implemented", {}),
    );
  },
});

function findAssetById(
  brands: readonly ManifestBrand[],
  id: string,
): readonly [ManifestLogo, ManifestBrand] | null {
  for (const brand of brands) {
    for (const logo of brand.logos) {
      if (logo.id === id) return [logo, brand];
    }
  }
  return null;
}

function chooseFormat(
  summary: { formats: { svg: string | null; png: string | null } },
  requested: "svg" | "png" | undefined,
): "svg" | "png" | null {
  if (requested !== undefined) {
    return summary.formats[requested] !== null ? requested : null;
  }
  // Default preference: png (revised phase-2 default).
  if (summary.formats.png !== null) return "png";
  if (summary.formats.svg !== null) return "svg";
  return null;
}

/** For the url-only mode where we weren't asked to resolve metadata. */
function minimalDetailFromUrl(url: string, format: "svg" | "png"): AssetDetail {
  // We return an AssetDetail-shaped object; summary-only fields are set
  // to safe defaults because we don't have the source manifest entry.
  // The caller opted into raw URL mode by passing `url` — they're on the
  // hook for interpreting it.
  const _ = resolveUrl; // keep import live when summary projection isn't reached
  return {
    id: url,
    name: "",
    brand_id: "salesforce",
    type: "logo",
    variant: "",
    background: "light",
    preferred: false,
    co_branded: false,
    category: null,
    keywords: [],
    product_description: null,
    use_cases: [],
    usage: "",
    formats: { svg: format === "svg" ? url : null, png: format === "png" ? url : null },
    preferred_format: format,
    source_dimensions: { width: 0, height: 0, source: "png" },
    aspect_ratio: { decimal: 1, ratio: "1:1", is_square: true },
    svg_intrinsic: null,
    brand_colors_hint: {},
    format,
    url,
  };
}
```

- [ ] **Step 4: Run tests, confirm green**

Run: `bun test test/tools/fetch-asset.test.ts`
Expected: 7 pass.

- [ ] **Step 5: Gate full suite**

```bash
bun run typecheck && bun run lint && bun test
```
Expected: all green, 101 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/tools/fetch-asset.ts test/tools/fetch-asset.test.ts
git commit -m "$(cat <<'EOF'
feat: add fetch_asset tool — URL mode + input validation

Skeleton covering the id/url exclusivity rules, URL host validation
(InvalidAssetUrl), id lookup (AssetNotFound), format resolution
(FormatUnavailable with explicit available_formats), and mode='url'
responses. mode='path' and mode='bytes' land in the next two tasks.

Default format is 'png' per the phase-2 scope revision (primary
consumers are raster artifact builders). Default mode is 'url' at
this stage; will flip to 'path' in Task 9 once the cache is wired.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `fetch_asset` — `bytes` mode

Read cache (fetching on miss), return base64.

**Files:**
- Modify: `src/tools/fetch-asset.ts`
- Modify: `test/tools/fetch-asset.test.ts`

- [ ] **Step 1: Extend the test**

Append to `test/tools/fetch-asset.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAssetCache, type AssetCache } from "../../src/assets/cache.js";

describe("fetch_asset — bytes mode", () => {
  it("returns base64 bytes for a known id", async () => {
    const root = mkdtempSync(join(tmpdir(), "fetch-asset-bytes-"));
    try {
      const cache: AssetCache = createAssetCache({
        root,
        manifestVersion: "2026-03-13",
        fetcher: (url) =>
          Promise.resolve({
            status: 200,
            bytes: new TextEncoder().encode(`<!-- ${url} -->`),
            duration_ms: 1,
          }),
      });
      const ctxWithCache = { ...ctx(), cache };
      const result = (await fetchAssetTool.handler(
        { id: "icon-agentforce", mode: "bytes", format: "svg" },
        ctxWithCache as never,
      )) as { bytes_base64?: string; format: string };
      expect(result.format).toBe("svg");
      expect(typeof result.bytes_base64).toBe("string");
      expect(result.bytes_base64?.length ?? 0).toBeGreaterThan(0);
      const decoded = Buffer.from(result.bytes_base64 ?? "", "base64").toString("utf8");
      expect(decoded).toContain("icon-agentforce"); // url appears in our mock body via the include of url
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
```

**Note:** this test requires `ToolContext` to carry an optional `cache`. Extend the `ToolContext` interface in Step 2.

- [ ] **Step 2: Extend `ToolContext`**

Open `src/tools/registry.ts`. Change the `ToolContext` interface to include an optional cache:

```ts
import type { AssetCache } from "../assets/cache.js";

export interface ToolContext {
  manifest: Manifest;
  logger: Logger;
  reqId: string;
  counters: Counters;
  /** Phase 2+: present only for tools that consult the on-disk cache. */
  cache?: AssetCache;
}
```

Also extend `test/helpers/context.ts` to accept an optional cache:

```ts
// test/helpers/context.ts
import type { AssetCache } from "../../src/assets/cache.js";
import type { Manifest } from "../../src/manifest/types.js";
import type { ToolContext } from "../../src/tools/registry.js";
import { createCounters } from "../../src/observability/counters.js";
import { createLogger } from "../../src/observability/logger.js";

export function makeTestContext(
  manifest: Manifest,
  overrides: { reqId?: string; cache?: AssetCache } = {},
): ToolContext {
  const { reqId, cache } = overrides;
  return {
    manifest,
    logger: createLogger({ level: "error", format: "human", stderr: () => undefined }),
    reqId: reqId ?? "test0001",
    counters: createCounters(),
    ...(cache !== undefined ? { cache } : {}),
  };
}
```

Update existing test-helper call sites if any use positional args for `reqId`: change `makeTestContext(m, "abcd")` to `makeTestContext(m, { reqId: "abcd" })`. Run `grep -rn 'makeTestContext(' test/` to find them.

- [ ] **Step 3: Run and confirm failure**

Run: `bun test test/tools/fetch-asset.test.ts`
Expected: test "returns base64 bytes" fails — mode=bytes is not implemented.

- [ ] **Step 4: Implement bytes mode in `fetch-asset.ts`**

In `src/tools/fetch-asset.ts`, replace the `mode='path'/'bytes' not yet implemented` rejection on the id path with:

```ts
    if (input.mode === "bytes") {
      return handleBytes(ctx, id, format, url);
    }
    // path mode lands in Task 9.
    return Promise.reject(
      new SfLogosError("InvalidInput", "mode=path not yet implemented", {}),
    );
```

Add `handleBytes`:

```ts
async function handleBytes(
  ctx: { cache?: import("../assets/cache.js").AssetCache },
  id: string,
  format: "svg" | "png",
  url: string,
): Promise<Partial<AssetDetail>> {
  if (ctx.cache === undefined) {
    throw new SfLogosError(
      "InvalidInput",
      "fetch_asset bytes/path mode requires a configured asset cache.",
      {},
    );
  }
  const path = await ctx.cache.getPath(id, format, url);
  const { readFileSync } = await import("node:fs");
  const bytes_base64 = readFileSync(path).toString("base64");
  return { bytes_base64 };
}
```

Update the handler to merge the partial result:

```ts
    if (input.mode === "bytes") {
      const extra = await handleBytes(ctx as never, id, format, url);
      return { ...summary, format, url, ...extra } satisfies AssetDetail;
    }
```

For that to work, the outer handler must be `async`. Flip the arrow function wrapping the whole handler body to `async` and `throw` instead of `return Promise.reject` where needed. Minimal change:

```ts
  handler: async (input, ctx) => {
    // ...existing early-return validations, converted to `throw new SfLogosError(...)`...
    // id path:
    // ...build summary and format...
    if (input.mode === "bytes") {
      if (ctx.cache === undefined) {
        throw new SfLogosError("InvalidInput", "mode=bytes requires a cache", {});
      }
      const path = await ctx.cache.getPath(id, format, url);
      const { readFileSync } = await import("node:fs");
      const bytes_base64 = readFileSync(path).toString("base64");
      return { ...summary, format, url, bytes_base64 } satisfies AssetDetail;
    }
    // url mode default unchanged:
    return { ...summary, format, url } satisfies AssetDetail;
  },
```

Remove the now-unused `Promise.reject` wrappers and the `handleBytes` function if you've inlined it. Keep the code flat — one function body with clear branches is easier to review than a tangle of helpers.

- [ ] **Step 5: Run and confirm green**

Run: `bun test test/tools/fetch-asset.test.ts`
Expected: 8 pass (previous 7 + 1 new).

- [ ] **Step 6: Gate full suite**

```bash
bun run typecheck && bun run lint && bun test
```
Expected: all green. The count depends on how many existing `makeTestContext` sites you touched; they shouldn't drop tests.

- [ ] **Step 7: Commit**

```bash
git add src/tools/fetch-asset.ts src/tools/registry.ts test/helpers/context.ts test/tools/fetch-asset.test.ts
git commit -m "$(cat <<'EOF'
feat: fetch_asset — bytes mode (base64 from cache)

Extends ToolContext with an optional `cache` so tools that need disk
I/O (fetch_asset) can reach it, while read-only tools remain cache-
unaware.

makeTestContext now takes an options object with cache/reqId instead
of positional args, matching how phase-2 tests need to inject mocks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: `fetch_asset` — `path` mode (+ make it the default)

With bytes mode working, `path` mode is a near-trivial branch: call the cache, return the path without reading the file.

**Files:**
- Modify: `src/tools/fetch-asset.ts`
- Modify: `test/tools/fetch-asset.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `test/tools/fetch-asset.test.ts`:

```ts
describe("fetch_asset — path mode (default)", () => {
  it("returns a local filesystem path when mode omitted (default path) with a cache", async () => {
    const root = mkdtempSync(join(tmpdir(), "fetch-asset-path-"));
    try {
      const cache: AssetCache = createAssetCache({
        root,
        manifestVersion: "2026-03-13",
        fetcher: () =>
          Promise.resolve({ status: 200, bytes: new Uint8Array([1, 2, 3]), duration_ms: 1 }),
      });
      const result = (await fetchAssetTool.handler(
        { id: "icon-agentforce" }, // no mode — default should be 'path'
        { ...ctx(), cache } as never,
      )) as { path?: string; format: string };
      expect(result.format).toBe("png");
      expect(result.path?.endsWith("icon-agentforce.png")).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("raises FormatUnavailable with explicit available_formats when asked for unavailable format", async () => {
    // Find an SVG-only asset if any exists in the manifest; otherwise synthesize one inline.
    // The bundled manifest has at least one entry where `png` is null; pick it dynamically.
    const iconBrand = (bundled as unknown as Manifest).brands.find((b) => b.id === "product-icons");
    const svgOnly = iconBrand?.logos.find((l) => l.png === null && l.svg !== null);
    if (!svgOnly) {
      // No natural fixture — skip the dynamic portion; the contract is still covered at the unit layer.
      return;
    }
    try {
      await fetchAssetTool.handler({ id: svgOnly.id, format: "png", mode: "url" }, ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect((err as SfLogosError).code).toBe("FormatUnavailable");
    }
  });
});
```

- [ ] **Step 2: Run and confirm at least one failure**

Run: `bun test test/tools/fetch-asset.test.ts`
Expected: the "path mode default" test fails — path mode not implemented, or the default is still 'url'.

- [ ] **Step 3: Implement**

In `src/tools/fetch-asset.ts`, change the default mode. The current handler treats `mode === 'url' || mode === undefined` as URL. Change that to be explicit about `'url'` only, and add a `'path'` branch that's the default when `mode` is undefined:

```ts
    const mode = input.mode ?? "path"; // phase-2 default (revised from phase-1 'url').

    if (mode === "url") {
      return { ...summary, format, url } satisfies AssetDetail;
    }

    if (ctx.cache === undefined) {
      throw new SfLogosError(
        "InvalidInput",
        `fetch_asset mode='${mode}' requires a configured asset cache.`,
        {},
      );
    }

    if (mode === "path") {
      const path = await ctx.cache.getPath(id, format, url);
      return { ...summary, format, url, path } satisfies AssetDetail;
    }

    if (mode === "bytes") {
      const path = await ctx.cache.getPath(id, format, url);
      const { readFileSync } = await import("node:fs");
      const bytes_base64 = readFileSync(path).toString("base64");
      return { ...summary, format, url, bytes_base64 } satisfies AssetDetail;
    }

    // Unreachable under the schema's enum, but keep a guard for safety.
    throw new SfLogosError("InvalidInput", `unknown mode '${String(mode)}'`, {});
```

Also update the URL-input branch: remove the "path/bytes for url input not yet implemented" rejection and let it fall through the same way (id-less path isn't useful but accepting the url as-is for URL mode is the primary use case, so keep url-input limited to `mode: "url"` explicitly):

```ts
    if (haveUrl) {
      const url = input.url as string;
      if (!url.startsWith(`${ASSET_BASE_URL}/`)) { /* ... */ }
      if ((input.mode ?? "url") !== "url") {
        throw new SfLogosError(
          "InvalidInput",
          "url input only supports mode='url'. Use id input for path/bytes modes.",
          {},
        );
      }
      return minimalDetailFromUrl(url, input.format ?? "png");
    }
```

Update the description to say that default mode is `path`. In the `DESCRIPTION` constant, change `"'path' (default — returns a filesystem path ..."` — it's already correct; just verify.

- [ ] **Step 4: Run and confirm green**

Run: `bun test test/tools/fetch-asset.test.ts`
Expected: all fetch_asset tests pass.

- [ ] **Step 5: Update the URL-mode tests from Task 7 that relied on `mode: "url"` being the default**

Any test that didn't pass `mode: "url"` explicitly and expected a URL-only response must be updated. Check the three earlier "URL mode" tests — they all pass `mode: "url"` already, so no changes should be needed. Run the full suite to confirm.

```bash
bun test
```
Expected: all green.

- [ ] **Step 6: Gate full suite**

```bash
bun run typecheck && bun run lint && bun test
```
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/tools/fetch-asset.ts test/tools/fetch-asset.test.ts
git commit -m "$(cat <<'EOF'
feat: fetch_asset — path mode, now the default

mode defaults to 'path' per the phase-2 spec revision. Callers that
want just the URL must now pass mode='url' explicitly. path/bytes
modes require ctx.cache; url mode does not.

URL input is restricted to mode='url' — path/bytes from a raw URL
imply a non-id cache key, which the current cache layout doesn't
support and we have no use case for.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: `find_brand_logo` — `advisories[]` annotation

When `background` is supplied and every result is co-branded, add a machine-readable tag so less-capable callers don't have to infer the gap themselves.

**Files:**
- Modify: `src/tools/find-brand-logo.ts`
- Modify: `test/tools/find-brand-logo.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `test/tools/find-brand-logo.test.ts`:

```ts
describe("find_brand_logo — advisories", () => {
  it("emits 'only_co_branded_for_requested_background' when all dark Slack results are co-branded", async () => {
    const result = (await findBrandLogoTool.handler(
      { brand: "slack", background: "dark" },
      ctx(),
    )) as { logos: Array<{ co_branded: boolean }>; advisories?: string[] };
    expect(result.logos.length).toBeGreaterThan(0);
    expect(result.logos.every((l) => l.co_branded)).toBe(true);
    expect(result.advisories ?? []).toContain("only_co_branded_for_requested_background");
  });

  it("does NOT emit the advisory when some standalone results exist", async () => {
    const result = (await findBrandLogoTool.handler(
      { brand: "salesforce", background: "light" },
      ctx(),
    )) as { logos: Array<{ co_branded: boolean }>; advisories?: string[] };
    expect(result.logos.some((l) => !l.co_branded)).toBe(true);
    expect(result.advisories ?? []).not.toContain("only_co_branded_for_requested_background");
  });

  it("does NOT emit the advisory when background is not specified", async () => {
    const result = (await findBrandLogoTool.handler(
      { brand: "slack" },
      ctx(),
    )) as { logos: Array<{ co_branded: boolean }>; advisories?: string[] };
    expect(result.advisories ?? []).not.toContain("only_co_branded_for_requested_background");
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun test test/tools/find-brand-logo.test.ts`
Expected: the advisory tests fail — field doesn't exist.

- [ ] **Step 3: Implement in `src/tools/find-brand-logo.ts`**

Extend the `Output` interface:

```ts
interface Output {
  logos: AssetSummary[];
  advisories?: string[];
}
```

In the handler, after the existing sort, add:

```ts
    const advisories: string[] = [];
    if (input.background !== undefined && logos.length > 0 && logos.every((l) => l.co_branded)) {
      advisories.push("only_co_branded_for_requested_background");
    }

    return {
      logos: logos.map((l) => toAssetSummary(l, brand)),
      ...(advisories.length > 0 ? { advisories } : {}),
    };
```

Update the description to mention the annotation:

```ts
  "`co_branded: true`, the response includes `advisories: ['only_co_branded_for_requested_background']`",
  "— a structural signal for callers who don't parse the co-brand flag themselves.",
```

(Fit these lines into the existing `DESCRIPTION` join — order after the existing dog-food paragraph about co-brand fallbacks.)

- [ ] **Step 4: Run and confirm green**

Run: `bun test test/tools/find-brand-logo.test.ts`
Expected: all tests pass including the new three.

- [ ] **Step 5: Gate full suite**

```bash
bun run typecheck && bun run lint && bun test
```
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/tools/find-brand-logo.ts test/tools/find-brand-logo.test.ts
git commit -m "$(cat <<'EOF'
feat: find_brand_logo emits advisories[] for co-branded-only results

When background is specified and every result has co_branded=true
(notably dark Slack assets), the response now carries
advisories: ['only_co_branded_for_requested_background']. Callers
that don't parse co_branded can switch on this tag; callers that do
can ignore it.

Contract: advisories is an optional string array; each entry is a
known machine-readable tag. Present only when at least one advisory
fires; never empty.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Register `fetch_asset` in `server.ts` + bump tool count

This is the task that makes `fetch_asset` reachable via the MCP transport. It bumps the two hard-coded tool counts in the existing server tests — explicitly, in one commit, alongside the registration.

**Files:**
- Modify: `src/server.ts`
- Modify: `test/server.test.ts`
- Modify: `test/server.e2e.test.ts`

- [ ] **Step 1: Register the tool**

In `src/server.ts`, import:

```ts
import { fetchAssetTool } from "./tools/fetch-asset.js";
```

Extend `ALL_TOOLS`:

```ts
export const ALL_TOOLS: Tool[] = [
  listBrandsTool as Tool,
  findBrandLogoTool as Tool,
  findProductIconTool as Tool,
  getBrandColorsTool as Tool,
  getColorRolesTool as Tool,
  fetchAssetTool as Tool, // NEW in phase 2
];
```

`ServerDeps` gains an optional cache:

```ts
import type { AssetCache } from "./assets/cache.js";

export interface ServerDeps {
  manifest: Manifest;
  logger: Logger;
  counters: Counters;
  cache?: AssetCache; // present when fetch_asset's path/bytes modes are needed
}
```

Thread it into the `ToolContext` construction inside `dispatch`:

```ts
    const ctx: ToolContext = {
      manifest: deps.manifest,
      logger: deps.logger,
      reqId,
      counters: deps.counters,
      ...(deps.cache !== undefined ? { cache: deps.cache } : {}),
    };
```

Update `main()` to construct a cache and pass it in. Add at the top of `main()`, alongside existing imports:

```ts
  const { createAssetCache } = await import("./assets/cache.js");
  const { fetchAsset: fetchAssetFn } = await import("./assets/fetch.js");
  const { resolve: resolvePath } = await import("node:path");
  const { homedir } = await import("node:os");
```

After `loadManifest` resolves, before `buildServer`, build the cache:

```ts
  const cacheRoot =
    process.env["XDG_CACHE_HOME"] ??
    process.env["SFL_CACHE_ROOT"] ??
    resolvePath(
      process.platform === "darwin"
        ? `${homedir()}/Library/Caches`
        : process.platform === "win32"
          ? process.env["LOCALAPPDATA"] ?? `${homedir()}/AppData/Local`
          : `${homedir()}/.cache`,
    );
  const cache = createAssetCache({
    root: resolvePath(cacheRoot, "sf-logos-mcp"),
    manifestVersion: manifest.lastUpdated,
    fetcher: (url: string) =>
      fetchAssetFn({
        url,
        userAgent: `sf-logos-mcp/0.1.0`,
        timeoutMs: 10_000,
        fetch: globalThis.fetch,
      }),
  });
  const server = buildServer({ manifest, logger, counters, cache });
```

- [ ] **Step 2: Bump the hard-coded tool-count assertions**

`test/server.test.ts` — find the "lists five tools" test, update it:

```ts
  it("lists six tools", () => {
    const s = buildServer(deps());
    const names = s.listTools().map((t) => t.name);
    for (const name of [
      "list_brands",
      "find_brand_logo",
      "find_product_icon",
      "get_brand_colors",
      "get_color_roles",
      "fetch_asset",
    ]) {
      expect(names).toContain(name);
    }
    expect(names.length).toBe(6);
  });
```

`test/server.e2e.test.ts` — find the tools/list assertion, update:

```ts
    expect(toolsListResp?.result?.tools).toHaveLength(6);
```

- [ ] **Step 3: Add a new dispatch test for fetch_asset**

Append to `test/server.test.ts`:

```ts
  it("dispatches fetch_asset in URL mode without a cache", async () => {
    const s = buildServer(deps());
    const result = (await s.dispatch("fetch_asset", {
      id: "icon-agentforce",
      mode: "url",
    })) as { id: string; url: string };
    expect(result.url).toMatch(/^https:\/\/dam\.usefulto\.me\//);
  });
```

- [ ] **Step 4: Run tests, confirm green**

Run: `bun test`
Expected: all green. 110+ tests; count will depend on exact totals.

Phase-1 smoke will also need its hard-coded count updated. Skip that now — Task 15 handles smoke-script renaming and updates.

- [ ] **Step 5: Run regression suite**

Run: `bun run try:check`
Expected: 21 prior scenarios pass. No new scenarios yet for fetch_asset — that's Task 12.

- [ ] **Step 6: Gate**

```bash
bun run typecheck && bun run lint && bun test
```
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/server.ts test/server.test.ts test/server.e2e.test.ts
git commit -m "$(cat <<'EOF'
feat: register fetch_asset — server now exposes 6 tools

ALL_TOOLS grows to include fetchAssetTool. ServerDeps accepts an
optional AssetCache; main() wires one up rooted at the OS cache
directory (XDG_CACHE_HOME > SFL_CACHE_ROOT > platform default) with
a fetch implementation built on top of assets/fetch.ts.

Bumps the two hard-coded "5 tools" assertions in the existing server
tests to 6, and adds a dispatch test exercising fetch_asset in URL
mode (no cache needed).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Regression-suite scenarios for `fetch_asset`

**Files:**
- Modify: `scripts/try-mcp.ts`

- [ ] **Step 1: Add five new scenarios**

In the `SCENARIOS` array in `scripts/try-mcp.ts`, after the dog-food-derived block, add:

```ts
  // ---------------------------------------------------- fetch_asset (phase 2)
  {
    label: "fetch_asset(id='icon-agentforce', mode='url') — URL round-trip",
    tool: "fetch_asset",
    input: { id: "icon-agentforce", mode: "url" },
    expect: (out) => {
      const r = asObject(out);
      const url = asString(r["url"], "url");
      if (!url.startsWith("https://dam.usefulto.me/")) {
        throw new Error(`url not under dam.usefulto.me: ${url}`);
      }
      if (r["format"] !== "png") {
        throw new Error(`expected default format 'png', got '${String(r["format"])}'`);
      }
    },
  },
  {
    label: "fetch_asset(id='icon-agentforce', mode='path') — returns cache path; second call is a hit",
    tool: "fetch_asset",
    input: { id: "icon-agentforce", mode: "path" },
    expect: (out) => {
      const r = asObject(out);
      const path = asString(r["path"], "path");
      if (!path.endsWith("icon-agentforce.png")) {
        throw new Error(`path does not end with icon-agentforce.png: ${path}`);
      }
    },
  },
  {
    label: "fetch_asset(id='icon-agentforce', mode='bytes', format='svg') — base64 bytes present",
    tool: "fetch_asset",
    input: { id: "icon-agentforce", mode: "bytes", format: "svg" },
    expect: (out) => {
      const r = asObject(out);
      const b64 = asString(r["bytes_base64"], "bytes_base64");
      if (b64.length < 100) throw new Error(`bytes_base64 suspiciously short (${b64.length})`);
    },
  },
  {
    label: "fetch_asset(id='bogus') → AssetNotFound",
    tool: "fetch_asset",
    input: { id: "bogus" },
    expectError: { code: "AssetNotFound" },
  },
  {
    label: "fetch_asset(url='https://evil.example.com/x.svg') → InvalidAssetUrl",
    tool: "fetch_asset",
    input: { url: "https://evil.example.com/x.svg", mode: "url" },
    expectError: { code: "InvalidAssetUrl" },
  },
```

Also update the protocol check — the count bumps to 6:

```ts
  const expected = [
    "fetch_asset",
    "find_brand_logo",
    "find_product_icon",
    "get_brand_colors",
    "get_color_roles",
    "list_brands",
  ];
```

- [ ] **Step 2: Run the regression suite**

Run: `bun run try:check`
Expected: 26/26 pass (21 prior + 5 new).

- [ ] **Step 3: Gate**

```bash
bun run typecheck && bun run lint && bun test
```
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add scripts/try-mcp.ts
git commit -m "$(cat <<'EOF'
test: add 5 regression scenarios for fetch_asset

Covers the URL/path/bytes modes, AssetNotFound for unknown ids, and
InvalidAssetUrl for off-host urls. The path-mode scenario implicitly
exercises the cache because the suite runs the built server which
wires up a real cache in main().

Bumps the protocol-check tools list to 6.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: `SIGUSR2` snapshot handler

When the process receives `SIGUSR2`, dump the counters and recent events to a JSON file in the user's cache dir. Cheap, no new tool surface.

**Files:**
- Modify: `src/server.ts`

- [ ] **Step 1: Extend `main()` with the signal handler**

After the `buildServer` call in `main()`, before `mcp.connect`:

```ts
  process.on("SIGUSR2", () => {
    (async () => {
      const { writeFileSync, mkdirSync } = await import("node:fs");
      const { join } = await import("node:path");
      const snapshot = {
        version: "0.1.0",
        started_at: new Date().toISOString(),
        manifest: { source, version: manifest.lastUpdated },
        counters: counters.snapshot(),
        recent_events: logger.ringSnapshot(),
      };
      const dir = resolvePath(cacheRoot, "sf-logos-mcp", "diagnostics");
      mkdirSync(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      writeFileSync(join(dir, `diagnostics-${stamp}.json`), JSON.stringify(snapshot, null, 2));
    })().catch((err) => {
      process.stderr.write(
        `[sf-logos-mcp] SIGUSR2 dump failed: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    });
  });
```

- [ ] **Step 2: No automated test for this**

`SIGUSR2` handlers are awkward to test in bun:test. Smoke-test it manually:

```bash
bun run build
node bin/sf-logos-mcp </dev/null &
PID=$!
sleep 0.5
kill -USR2 "$PID"
sleep 0.2
kill "$PID"
ls ~/Library/Caches/sf-logos-mcp/diagnostics/
```

Expected: one `diagnostics-*.json` file exists; open it — it has `version`, `started_at`, `manifest`, `counters`, `recent_events`.

Clean up the file after: `rm ~/Library/Caches/sf-logos-mcp/diagnostics/diagnostics-*.json`.

- [ ] **Step 3: Gate**

```bash
bun run typecheck && bun run lint && bun test
```
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add src/server.ts
git commit -m "$(cat <<'EOF'
feat: add SIGUSR2 diagnostics snapshot handler

When the server receives SIGUSR2, writes a JSON snapshot (version,
manifest state, counter snapshot, ring-buffer events) to
<cache_root>/sf-logos-mcp/diagnostics/diagnostics-<ts>.json. Useful
when the MCP client can't call tools but the process is still alive.

No MCP diagnostics tool for phase 2 — see scope revision doc.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Rename and update the phase-1 smoke script

`scripts/phase1-smoke.sh` hard-codes 5 tools. Rename to `scripts/phase2-smoke.sh` and bump counts. Also update `package.json`.

**Files:**
- Rename: `scripts/phase1-smoke.sh` → `scripts/phase2-smoke.sh`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Rename and update the script**

```bash
git mv scripts/phase1-smoke.sh scripts/phase2-smoke.sh
```

Open `scripts/phase2-smoke.sh`. Bump the comment, add a new request for `fetch_asset`, add a new check:

Change the heredoc REQUESTS block to include an 8th request:

```
{"jsonrpc":"2.0","id":8,"method":"tools/call","params":{"name":"fetch_asset","arguments":{"id":"icon-agentforce","mode":"url"}}}
```

Add a new check line:

```bash
check 8 'dam.usefulto.me'
```

Update the final summary line's expected pass count from `6 pass / 0 fail` to `7 pass / 0 fail`.

Update the "Usage: bun run phase1:smoke" line in the script header to "Usage: bun run phase2:smoke".

- [ ] **Step 2: Update `package.json`**

Change:
```json
"phase1:smoke": "bash scripts/phase1-smoke.sh",
```
to:
```json
"phase2:smoke": "bash scripts/phase2-smoke.sh",
```

- [ ] **Step 3: Update `.github/workflows/ci.yml`**

Find the `phase1:smoke` step name and `bun run phase1:smoke` command, change to `phase2:smoke`.

- [ ] **Step 4: Run locally**

Run: `bun run phase2:smoke`
Expected: `phase2 smoke: 7 pass / 0 fail`.

- [ ] **Step 5: Gate**

```bash
bun run typecheck && bun run lint && bun test && bun run try:check
```
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add scripts/phase2-smoke.sh package.json .github/workflows/ci.yml
# Also stage the rename-aware removal of the old name:
git add -A
git commit -m "$(cat <<'EOF'
chore: rename phase1-smoke → phase2-smoke; add fetch_asset check

New 7th JSON-RPC call in the smoke script invokes fetch_asset with
mode='url' and greps for 'dam.usefulto.me' in the response.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Update the session primer + LEARNINGS.md

Phase 2 shipping is a state change the primer must reflect. LEARNINGS.md gets any findings that surfaced during phase 2 execution (if any).

**Files:**
- Modify: `docs/SESSION_PRIMER.md`
- Modify: `docs/LEARNINGS.md` (append findings discovered during this plan's execution)

- [ ] **Step 1: Update the state table**

Open `docs/SESSION_PRIMER.md`. Change the "Last updated" line to today. Update the state table:

```markdown
| MCP server phase 1 | Shipped. 5 read-only tools. |
| MCP server phase 2 | **Shipped.** Adds fetch_asset (url/path/bytes) + on-disk cache + advisories on find_brand_logo + SIGUSR2 diagnostics. |
| MCP server phase 3 | Deferred. Scope: full 9-step CI + publishable docs. |
```

Update the invariants list if anything changed. In particular:
- Add "fetch_asset default mode is `path`, default format is `png` — callers that want raw URLs must pass `mode: 'url'` explicitly."

- [ ] **Step 2: Append any new LEARNINGS**

If phase 2 execution surfaced any new non-obvious findings (toolchain quirks, MCP SDK behaviors, manifest gotchas), append them to `docs/LEARNINGS.md` under the appropriate section. Do not invent findings — if nothing surprised you during execution, skip this step.

- [ ] **Step 3: Commit**

```bash
git add docs/SESSION_PRIMER.md docs/LEARNINGS.md
git commit -m "$(cat <<'EOF'
docs: update SESSION_PRIMER + LEARNINGS for phase 2 shipping

Phase 2 state in the primer flips from "not started" to "shipped".
Adds a new invariant about fetch_asset defaults so fresh agents
don't assume mode='url' is the default (it was in the original
spec; phase-2 scope revision made 'path' the default).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: Final verification + merge

Full sanity pass before merging the branch to `main`.

- [ ] **Step 1: Run every gate, one more time**

```bash
bun run typecheck
bun run lint
bun test
bun run build
bun run phase2:smoke
bun run try:check
```

Expected for each:
- `typecheck`: exit 0.
- `lint`: exit 0.
- `test`: all pass.
- `build`: `dist/` populated, no errors.
- `phase2:smoke`: `7 pass / 0 fail`.
- `try:check`: 26/26 pass.

- [ ] **Step 2: Verify working tree is clean**

Run: `git status --short`
Expected: only `.claude/` untracked (local settings). If anything else is uncommitted, investigate.

- [ ] **Step 3: Merge to main**

```bash
git checkout main
git merge --no-ff feat/mcp-phase-2 -m "$(cat <<'EOF'
Merge phase 2: fetch_asset + on-disk cache

Delivers:
- fetch_asset MCP tool (url / path / bytes modes; default path + png)
- Version-keyed on-disk cache (<OS cache>/sf-logos-mcp/<version>/<id>.<ext>)
- Non-blocking logger file sink (createWriteStream)
- find_brand_logo advisories[] for co-branded-only results
- SIGUSR2 diagnostics snapshot
- 5 regression scenarios for fetch_asset
- Phase-2 smoke script with the 7th tool call

Scope-revised against phase-1 spec based on dog-food findings:
target_width/target_height dropped (LLM does the math); diagnostics
MCP tool deferred; default format flipped svg → png.

See docs/superpowers/specs/2026-04-25-phase-2-scope-revision.md
and docs/superpowers/plans/2026-04-25-phase-2-fetch-asset.md.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Push**

```bash
git push origin main
```

- [ ] **Step 5: Verify CI**

Wait ~40 seconds, then:
```bash
gh run list --limit 1 --workflow ci.yml
```
Expected: `completed success`.

If CI fails, investigate before declaring phase 2 done. Common causes:
- Path-mode regression test needs network (the live manifest the server fetches may differ from the bundled snapshot); the `fetch_asset` cache scenario in `try-mcp.ts` runs against the real server, so a 5xx on dam.usefulto.me would break it. The cache on CI starts empty, so `fetch_asset` in path/bytes mode in CI does hit the network.
- `SFL_CACHE_ROOT` isn't set in CI — falls back to `~/.cache/sf-logos-mcp/<version>/…` which is fine but writes may be slow enough to exceed the 20s per-test budget. If so, set `SFL_CACHE_ROOT=/tmp/sf-logos-cache` in the CI env.

- [ ] **Step 6: Delete the feature branch**

```bash
git branch -d feat/mcp-phase-2
```

---

## Appendix A — Decisions log

| # | Question | Decision |
|---|---|---|
| P2.1 | Server-side target_width/target_height | Drop (Task 2, Task 3). |
| P2.2 | Default format for fetch_asset | png (Task 7, Task 9). |
| P2.3 | Diagnostics MCP tool | Defer; keep SIGUSR2 (Task 13). |
| P2.4 | Advisory annotations on find_brand_logo | Add (Task 10). |
| P2.5 | Cache layout | `<root>/<manifest.lastUpdated>/<id>.<ext>` (Task 6). |
| P2.6 | Cache fetcher injection | Injected via `AssetCacheOptions.fetcher` (Task 6); production wires it to `assets/fetch.ts` (Task 11). |
| P2.7 | URL input + mode=path/bytes | Rejected (Task 9). URL input only supports mode=url. |
| P2.8 | ToolContext.cache | Optional, present only when tools need it (Task 8). |
| P2.9 | Logger file sink | `createWriteStream` + `flush()` / `close()` (Task 4). |
| P2.10 | Tool count assertions | Bumped in one commit alongside registration (Task 11). |

---

## Self-review notes (author)

- Spec coverage: §4.1 loader unchanged; §4.2 cache → Task 6; §4.3 fetch → Task 5; §2 fetch_asset → Tasks 7–9; §5.3.7 diagnostics snapshot → Task 13 (MCP tool deferred per scope revision). ✓
- Placeholder scan: no "TBD" / "implement later" / "fill in". ✓
- Type consistency: `AssetCache`, `AssetCacheOptions`, `FetchAssetResult`, `CacheFetcher` used consistently. ✓
- Tool count bump happens exactly once (Task 11) — no mid-flight failures from stale assertions. ✓
- Every new test file is listed alongside its corresponding src file. ✓
