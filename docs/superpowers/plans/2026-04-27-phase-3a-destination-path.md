# Phase 3A — `fetch_asset(destination_path)` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `destination_path` parameter to `fetch_asset`. When supplied, the server copies the cached asset to the caller's absolute path atomically, preserves the cache, returns both destination and cache paths in the response. Fails with `DestinationExists` if the path already exists.

**Architecture:** One new module (`src/assets/destination.ts`) for atomic destination-write logic, orthogonal to the existing `fetch.ts` / `cache.ts` split. `fetch-asset.ts` gains input validation for the new combinations and a destination sub-branch within `mode="path"`. One new error code (`DestinationExists`). One new `AssetDetail` field (`cached_from`).

**Tech Stack:** TypeScript NodeNext ESM, Node ≥ 20, Bun in dev. `@modelcontextprotocol/sdk`, `node:fs`, `node:path`.

**Reference docs:**
- Authoritative spec: [`docs/superpowers/specs/2026-04-27-phase-3a-destination-path.md`](../specs/2026-04-27-phase-3a-destination-path.md)
- Phase-2 revision (still current): [`docs/superpowers/specs/2026-04-25-phase-2-scope-revision.md`](../specs/2026-04-25-phase-2-scope-revision.md)
- Original design: [`docs/superpowers/specs/2026-04-24-sf-logos-mcp-design.md`](../specs/2026-04-24-sf-logos-mcp-design.md)
- Phase-2 dog-food transcript (motivation): [`docs/dogfood/2026-04-27-dog-food-phase-2.md`](../../dogfood/2026-04-27-dog-food-phase-2.md)

**Conventions (inherited from phases 1 & 2, unchanged):**
- Package name: `@usefulto/sf-logos-mcp`.
- ESM imports use `.js` extensions (TS NodeNext).
- Tests use `bun:test` (`describe`, `it`, `expect`, `beforeEach`, `afterEach`).
- Errors: `new SfLogosError(code, message, details?)` from `src/errors.ts`.
- Tool handler signature: `async (input, ctx: ToolContext) => Promise<Output>`.
- Commit style: conventional commits with Claude co-author trailer via HEREDOC.
- Strict TS: `exactOptionalPropertyTypes` — use spread (`...(x !== undefined ? { k: x } : {})`), never `{ k: undefined }`.
- Strict TS: `noPropertyAccessFromIndexSignature` — bracket access on index-signatured types.
- Strict lint: `require-await` — use `Promise.resolve(x)` when body has no `await`.
- `bun test`, `bun run typecheck`, `bun run lint`, `bun run try:check` must all pass before any commit.
- Working directory for every command: repo root (`/Users/tal.golan/SF_Logos`).

**Branch strategy:** work already started on branch `spec/phase-3a-destination-path` (spec committed as `f6cc0c7`). Implementation commits land on the same branch. One PR at the end containing spec + plan + implementation.

**Required test-count bumps from phase 2:**
- `test/errors.test.ts` — `expect(codes).toHaveLength(6)` → `.toHaveLength(7)` (Task 2).
- `scripts/try-mcp.ts` regression count 27 → 29 (Task 8).
- `bun test` total: 110 → 125 (final verification in Task 9).

The order: error code added first (Task 2), module built and tested in isolation (Task 3), type extended (Task 4), handler updated with all validation branches (Tasks 5–6), regression + docs (Tasks 7–9), final verification (Task 10).

---

## Scope check

Single subsystem: one new module, one handler change, one error code, one type field. Single plan is correct.

## File structure

```
src/
  assets/
    fetch.ts           # unchanged
    cache.ts           # unchanged
    destination.ts     # NEW — Task 3: atomic copy + destination validation
  errors.ts            # MODIFIED — Task 2: +DestinationExists
  manifest/
    types.ts           # MODIFIED — Task 4: +cached_from field on AssetDetail
  tools/
    fetch-asset.ts     # MODIFIED — Tasks 5 & 6: input validation + destination branch

test/
  assets/
    destination.test.ts  # NEW — Task 3 (7 scenarios)
  tools/
    fetch-asset.test.ts  # MODIFIED — Tasks 5 & 6 (+8 scenarios)
  errors.test.ts         # MODIFIED — Task 2 (count 6 → 7)

scripts/
  try-mcp.ts             # MODIFIED — Task 8 (+2 regression scenarios)

docs/
  SESSION_PRIMER.md      # MODIFIED — Task 9 (phase-3A shipped, counts bumped)
  LEARNINGS.md           # MODIFIED — Task 9 (findings, if any surface)
```

---

## Task 1: Starting-state verification

**Goal:** Confirm the tree is clean and the baseline gates pass before any implementation.

**Files:** none changed.

- [ ] **Step 1: Verify branch and clean tree**

Run: `git status --short && git branch --show-current`
Expected: branch `spec/phase-3a-destination-path`, tree clean (spec already committed as `f6cc0c7`).

If anything is modified or untracked, stop and investigate.

- [ ] **Step 2: Baseline gates**

Run:
```bash
bun install
bun run typecheck && bun run lint && bun test
```
Expected: typecheck + lint exit 0. Tests: `110 pass / 0 fail`.

- [ ] **Step 3: Confirm regression suite baseline**

Run: `bun run try:check`
Expected: `regression: 27/27 pass / 0 fail`.

If any of these fail, stop. Do not start implementation on a broken baseline.

---

## Task 2: Add `DestinationExists` error code

**Goal:** Grow the error union from 6 to 7 members so later tasks can throw it.

**Files:**
- Modify: `src/errors.ts`
- Modify: `test/errors.test.ts`

- [ ] **Step 1: Update the type union**

Open `src/errors.ts`. Replace the `SfLogosErrorCode` type:

```ts
export type SfLogosErrorCode =
  | "AssetNotFound"
  | "InvalidAssetUrl"
  | "FormatUnavailable"
  | "UnknownBrand"
  | "InvalidInput"
  | "FetchFailed"
  | "DestinationExists";
```

- [ ] **Step 2: Update the error-union test**

Open `test/errors.test.ts`. In the "error-code union has expected members" test, change:

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

to:

```ts
const codes: SfLogosErrorCode[] = [
  "AssetNotFound",
  "InvalidAssetUrl",
  "FormatUnavailable",
  "UnknownBrand",
  "InvalidInput",
  "FetchFailed",
  "DestinationExists",
];
expect(codes).toHaveLength(7);
```

- [ ] **Step 3: Gate**

Run: `bun run typecheck && bun run lint && bun test`
Expected: all green, 110 tests still pass.

- [ ] **Step 4: Commit**

```bash
git add src/errors.ts test/errors.test.ts
git commit -m "$(cat <<'EOF'
refactor: add DestinationExists to SfLogosErrorCode union

Grows the error union from 6 to 7 members. No thrower yet; Task 3
(assets/destination.ts) will be the first to raise this code when a
caller-specified destination_path already exists.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `src/assets/destination.ts` — atomic destination-write module

**Goal:** Build the new module in isolation. Exports `copyToDestination({ source, destination })`. Seven test scenarios cover happy path, atomicity, pre-existence, absolute-path validation, null-byte rejection, missing parent dir, and read-only parent dir.

**Files:**
- Create: `src/assets/destination.ts`
- Create: `test/assets/destination.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `test/assets/destination.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  mkdtempSync,
  rmSync,
  existsSync,
  writeFileSync,
  readFileSync,
  chmodSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { copyToDestination } from "../../src/assets/destination.js";
import { SfLogosError } from "../../src/errors.js";

let workDir: string;
let sourcePath: string;
const SOURCE_CONTENT = "bytes-for-destination-test";

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "sf-logos-dest-"));
  sourcePath = join(workDir, "source.dat");
  writeFileSync(sourcePath, SOURCE_CONTENT);
});

afterEach(() => {
  // Ensure workDir is writable before cleanup (scenario 7 chmods to read-only).
  try {
    chmodSync(workDir, 0o755);
  } catch {
    // ignore — if workDir already cleaned or chmod fails, rmSync handles it.
  }
  rmSync(workDir, { recursive: true, force: true });
});

describe("copyToDestination", () => {
  it("copies source to destination and makes destination byte-identical", () => {
    const dest = join(workDir, "dest.dat");
    copyToDestination({ source: sourcePath, destination: dest });
    expect(existsSync(dest)).toBe(true);
    expect(readFileSync(dest, "utf8")).toBe(SOURCE_CONTENT);
  });

  it("writes atomically — no .tmp file remains after success", () => {
    const dest = join(workDir, "dest.dat");
    copyToDestination({ source: sourcePath, destination: dest });
    expect(existsSync(`${dest}.tmp`)).toBe(false);
  });

  it("raises DestinationExists when destination already exists", () => {
    const dest = join(workDir, "dest.dat");
    writeFileSync(dest, "pre-existing");
    try {
      copyToDestination({ source: sourcePath, destination: dest });
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(SfLogosError);
      expect((err as SfLogosError).code).toBe("DestinationExists");
    }
    expect(readFileSync(dest, "utf8")).toBe("pre-existing");
    expect(readFileSync(sourcePath, "utf8")).toBe(SOURCE_CONTENT);
  });

  it("rejects non-absolute destination with InvalidInput", () => {
    try {
      copyToDestination({ source: sourcePath, destination: "relative/path.dat" });
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(SfLogosError);
      expect((err as SfLogosError).code).toBe("InvalidInput");
    }
  });

  it("rejects destination containing a null byte with InvalidInput", () => {
    try {
      copyToDestination({
        source: sourcePath,
        destination: join(workDir, "bad\0name.dat"),
      });
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(SfLogosError);
      expect((err as SfLogosError).code).toBe("InvalidInput");
    }
  });

  it("relays OS error as FetchFailed when destination parent directory missing", () => {
    const dest = join(workDir, "nonexistent-subdir", "dest.dat");
    try {
      copyToDestination({ source: sourcePath, destination: dest });
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(SfLogosError);
      const e = err as SfLogosError;
      expect(e.code).toBe("FetchFailed");
      expect(e.details?.["reason"]).toBe("destination_write_failed");
    }
  });

  it("relays OS error as FetchFailed when destination parent is read-only", () => {
    chmodSync(workDir, 0o555);
    const dest = join(workDir, "dest.dat");
    try {
      copyToDestination({ source: sourcePath, destination: dest });
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(SfLogosError);
      const e = err as SfLogosError;
      expect(e.code).toBe("FetchFailed");
      expect(e.details?.["reason"]).toBe("destination_write_failed");
    }
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun test test/assets/destination.test.ts`
Expected: module-not-found error (the `src/assets/destination.js` import fails).

- [ ] **Step 3: Implement the module**

Create `src/assets/destination.ts`:

```ts
/**
 * assets/destination — Atomic copy from cache to caller-specified path.
 *
 * Responsibility: validate the destination path, reject if it already
 * exists, write via `<dest>.tmp` in the same directory + rename for
 * atomicity. Propagate OS errors as FetchFailed with reason tag.
 * Errors: InvalidInput (bad path shape), DestinationExists, FetchFailed.
 * Dependencies: errors.ts, node:fs, node:path.
 *
 * See docs/superpowers/specs/2026-04-27-phase-3a-destination-path.md.
 */

import { copyFileSync, existsSync, renameSync } from "node:fs";
import { isAbsolute } from "node:path";
import { SfLogosError } from "../errors.js";

export interface CopyToDestinationOptions {
  /** The cache path returned by AssetCache.getPath(). Must exist. */
  source: string;
  /** Caller-specified destination. Must be absolute, no null bytes. */
  destination: string;
}

export function copyToDestination(opts: CopyToDestinationOptions): void {
  validateDestinationPath(opts.destination);
  if (existsSync(opts.destination)) {
    throw new SfLogosError(
      "DestinationExists",
      `Destination already exists: ${opts.destination}`,
      { destination_path: opts.destination },
    );
  }
  const tmp = `${opts.destination}.tmp`;
  try {
    copyFileSync(opts.source, tmp);
    renameSync(tmp, opts.destination);
  } catch (err) {
    throw new SfLogosError(
      "FetchFailed",
      `Failed to write to ${opts.destination}: ${err instanceof Error ? err.message : String(err)}`,
      {
        destination_path: opts.destination,
        reason: "destination_write_failed",
        cause: err instanceof Error ? err.message : String(err),
      },
    );
  }
}

function validateDestinationPath(p: string): void {
  if (!isAbsolute(p)) {
    throw new SfLogosError(
      "InvalidInput",
      `destination_path must be absolute, got: ${p}`,
      { destination_path: p },
    );
  }
  if (p.includes("\0")) {
    throw new SfLogosError("InvalidInput", "destination_path contains a null byte", {});
  }
}
```

- [ ] **Step 4: Run and confirm green**

Run: `bun test test/assets/destination.test.ts`
Expected: 7 pass.

- [ ] **Step 5: Gate full suite**

Run: `bun run typecheck && bun run lint && bun test`
Expected: all green, 117 tests pass (110 + 7).

- [ ] **Step 6: Commit**

```bash
git add src/assets/destination.ts test/assets/destination.test.ts
git commit -m "$(cat <<'EOF'
feat: add src/assets/destination.ts — atomic destination-path write

Orthogonal to fetch.ts and cache.ts. Validates absolute-path + null-byte,
rejects pre-existing destinations with DestinationExists, writes via
`<dest>.tmp` in the same directory + rename for atomicity, relays OS
errors (EACCES, ENOENT on parent, ENOSPC, ...) as FetchFailed with
reason="destination_write_failed".

Tool handler wire-up lands in Tasks 5 and 6.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Extend `AssetDetail` with optional `cached_from` field

**Goal:** Add one optional field to the `AssetDetail` type so Tasks 5/6 can populate it.

**Files:**
- Modify: `src/manifest/types.ts`

- [ ] **Step 1: Edit the interface**

Open `src/manifest/types.ts`. Find the `AssetDetail` interface (currently around line 156). Add the new field after `bytes_base64`:

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
  /** Present when mode === "path" AND destination_path was supplied. The cache path, for diagnostic visibility. */
  cached_from?: string;
}
```

- [ ] **Step 2: Confirm no existing code breaks**

Run: `bun run typecheck && bun run lint && bun test`
Expected: all green, 117 tests pass. The field is optional and unused; no behavior changes.

- [ ] **Step 3: Commit**

```bash
git add src/manifest/types.ts
git commit -m "$(cat <<'EOF'
refactor: add cached_from optional field to AssetDetail

Diagnostic field populated by fetch_asset when a destination_path
write succeeds. Holds the cache path so callers can distinguish a
cache hit from a cold fetch without subscribing to observability.

No populator yet; Tasks 5 and 6 wire it up.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `fetch-asset.ts` — input-validation branch for `destination_path`

**Goal:** Accept and validate the `destination_path` input parameter. Reject the forbidden combinations (`url` input, non-`"path"` mode). No destination-write logic yet — Task 6 adds that.

**Files:**
- Modify: `src/tools/fetch-asset.ts`
- Modify: `test/tools/fetch-asset.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `test/tools/fetch-asset.test.ts` (after the existing describe blocks):

```ts
describe("fetch_asset — destination_path input validation", () => {
  it("rejects destination_path combined with url input", async () => {
    try {
      await fetchAssetTool.handler(
        {
          url: "https://dam.usefulto.me/x.svg",
          destination_path: "/tmp/out.svg",
          mode: "url",
        } as never,
        ctx(),
      );
      throw new Error("expected throw");
    } catch (err) {
      expect((err as SfLogosError).code).toBe("InvalidInput");
    }
  });

  it("rejects destination_path combined with mode='url'", async () => {
    try {
      await fetchAssetTool.handler(
        {
          id: "icon-agentforce",
          destination_path: "/tmp/out.png",
          mode: "url",
        } as never,
        ctx(),
      );
      throw new Error("expected throw");
    } catch (err) {
      expect((err as SfLogosError).code).toBe("InvalidInput");
    }
  });

  it("rejects destination_path combined with mode='bytes'", async () => {
    try {
      await fetchAssetTool.handler(
        {
          id: "icon-agentforce",
          destination_path: "/tmp/out.png",
          mode: "bytes",
        } as never,
        ctx(),
      );
      throw new Error("expected throw");
    } catch (err) {
      expect((err as SfLogosError).code).toBe("InvalidInput");
    }
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun test test/tools/fetch-asset.test.ts`
Expected: three new tests fail. Current handler doesn't know about `destination_path`; it passes through to one of the existing branches and produces a non-InvalidInput response (or a different error).

- [ ] **Step 3: Update the `Input` interface**

Open `src/tools/fetch-asset.ts`. Extend the `Input` interface:

```ts
interface Input {
  id?: string;
  url?: string;
  format?: "svg" | "png";
  mode?: "url" | "path" | "bytes";
  destination_path?: string;
}
```

- [ ] **Step 4: Add the validation branch**

In the handler, immediately after the existing `haveId && haveUrl` check and before the `if (haveUrl) { ... }` block, insert:

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

- [ ] **Step 5: Extend the input schema in the tool definition**

In the `inputSchema.properties` block of `fetch-asset.ts`, add the `destination_path` property after `mode`:

```ts
      destination_path: {
        type: "string",
        description:
          "Optional absolute path. When supplied, the server writes the asset to this location atomically. Requires id input and implies mode='path'. Fails with DestinationExists if the path already exists.",
      },
```

- [ ] **Step 6: Update the tool DESCRIPTION constant**

In `src/tools/fetch-asset.ts`, extend the `DESCRIPTION` array with a new paragraph. Replace:

```ts
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
```

with:

```ts
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
  "Optional `destination_path` (absolute path only) writes the asset to that",
  "exact location atomically. Fails with DestinationExists if the file already",
  "exists (callers must delete or pick a new name). Combined with `id` only —",
  "URL input does not accept destination_path. When used, `path` in the response",
  "is the destination and `cached_from` is the cache path.",
].join(" ");
```

- [ ] **Step 7: Run and confirm green**

Run: `bun test test/tools/fetch-asset.test.ts`
Expected: 13 pass (10 existing + 3 new).

- [ ] **Step 8: Gate full suite**

Run: `bun run typecheck && bun run lint && bun test`
Expected: all green, 120 tests pass (117 + 3).

- [ ] **Step 9: Commit**

```bash
git add src/tools/fetch-asset.ts test/tools/fetch-asset.test.ts
git commit -m "$(cat <<'EOF'
feat: fetch_asset — accept + validate destination_path input

Adds the destination_path field to the Input interface and tool input
schema. Rejects the forbidden combinations with InvalidInput:
- destination_path + url input
- destination_path + mode='url'
- destination_path + mode='bytes'

No write behavior yet; Task 6 wires the destination branch and tests
the happy path. Tool description updated so LLM callers see the new
parameter at tool-discovery time.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `fetch-asset.ts` — destination-write branch + response composition

**Goal:** When `destination_path` is supplied and validated, copy the cached file to the destination and return `AssetDetail` with `path = destination`, `cached_from = cachePath`.

**Files:**
- Modify: `src/tools/fetch-asset.ts`
- Modify: `test/tools/fetch-asset.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `test/tools/fetch-asset.test.ts`:

```ts
describe("fetch_asset — destination_path happy path", () => {
  it("writes to destination_path and returns path + cached_from", async () => {
    const root = mkdtempSync(join(tmpdir(), "fetch-asset-dest-"));
    const destDir = mkdtempSync(join(tmpdir(), "fetch-asset-dest-out-"));
    try {
      const cache: AssetCache = createAssetCache({
        root,
        manifestVersion: "2026-03-13",
        fetcher: () =>
          Promise.resolve({
            status: 200,
            bytes: new TextEncoder().encode("agentforce-bytes"),
            duration_ms: 1,
          }),
      });
      const ctxWithCache = makeTestContext(bundled as unknown as Manifest, { cache });
      const destination = join(destDir, "agentforce.png");
      const result = (await fetchAssetTool.handler(
        { id: "icon-agentforce", destination_path: destination },
        ctxWithCache,
      )) as { path?: string; cached_from?: string; format: string };
      expect(result.format).toBe("png");
      expect(result.path).toBe(destination);
      expect(result.cached_from?.endsWith("icon-agentforce.png")).toBe(true);
      const { readFileSync, existsSync } = await import("node:fs");
      expect(existsSync(destination)).toBe(true);
      expect(readFileSync(destination, "utf8")).toBe("agentforce-bytes");
      expect(existsSync(result.cached_from ?? "")).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(destDir, { recursive: true, force: true });
    }
  });

  it("accepts mode='path' + destination_path (redundant but valid)", async () => {
    const root = mkdtempSync(join(tmpdir(), "fetch-asset-dest-redundant-"));
    const destDir = mkdtempSync(join(tmpdir(), "fetch-asset-dest-redundant-out-"));
    try {
      const cache: AssetCache = createAssetCache({
        root,
        manifestVersion: "2026-03-13",
        fetcher: () =>
          Promise.resolve({
            status: 200,
            bytes: new Uint8Array([1, 2, 3]),
            duration_ms: 1,
          }),
      });
      const ctxWithCache = makeTestContext(bundled as unknown as Manifest, { cache });
      const destination = join(destDir, "agentforce.png");
      const result = (await fetchAssetTool.handler(
        { id: "icon-agentforce", destination_path: destination, mode: "path" },
        ctxWithCache,
      )) as { path?: string; cached_from?: string };
      expect(result.path).toBe(destination);
      expect(result.cached_from).toBeTruthy();
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(destDir, { recursive: true, force: true });
    }
  });

  it("raises AssetNotFound for unknown id — cache/destination never touched", async () => {
    const root = mkdtempSync(join(tmpdir(), "fetch-asset-dest-notfound-"));
    const destDir = mkdtempSync(join(tmpdir(), "fetch-asset-dest-notfound-out-"));
    try {
      let fetcherCalls = 0;
      const cache: AssetCache = createAssetCache({
        root,
        manifestVersion: "2026-03-13",
        fetcher: () => {
          fetcherCalls++;
          return Promise.resolve({
            status: 200,
            bytes: new Uint8Array([0]),
            duration_ms: 1,
          });
        },
      });
      const ctxWithCache = makeTestContext(bundled as unknown as Manifest, { cache });
      const destination = join(destDir, "out.png");
      try {
        await fetchAssetTool.handler(
          { id: "bogus-id", destination_path: destination },
          ctxWithCache,
        );
        throw new Error("expected throw");
      } catch (err) {
        expect((err as SfLogosError).code).toBe("AssetNotFound");
      }
      expect(fetcherCalls).toBe(0);
      const { existsSync } = await import("node:fs");
      expect(existsSync(destination)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(destDir, { recursive: true, force: true });
    }
  });

  it("raises DestinationExists when destination already exists", async () => {
    const root = mkdtempSync(join(tmpdir(), "fetch-asset-dest-exists-"));
    const destDir = mkdtempSync(join(tmpdir(), "fetch-asset-dest-exists-out-"));
    try {
      const cache: AssetCache = createAssetCache({
        root,
        manifestVersion: "2026-03-13",
        fetcher: () =>
          Promise.resolve({
            status: 200,
            bytes: new Uint8Array([1, 2, 3]),
            duration_ms: 1,
          }),
      });
      const ctxWithCache = makeTestContext(bundled as unknown as Manifest, { cache });
      const destination = join(destDir, "already-there.png");
      const { writeFileSync } = await import("node:fs");
      writeFileSync(destination, "pre-existing");
      try {
        await fetchAssetTool.handler(
          { id: "icon-agentforce", destination_path: destination },
          ctxWithCache,
        );
        throw new Error("expected throw");
      } catch (err) {
        expect((err as SfLogosError).code).toBe("DestinationExists");
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(destDir, { recursive: true, force: true });
    }
  });

  it("raises InvalidInput when destination_path is not absolute", async () => {
    const root = mkdtempSync(join(tmpdir(), "fetch-asset-dest-relpath-"));
    try {
      const cache: AssetCache = createAssetCache({
        root,
        manifestVersion: "2026-03-13",
        fetcher: () =>
          Promise.resolve({
            status: 200,
            bytes: new Uint8Array([1, 2, 3]),
            duration_ms: 1,
          }),
      });
      const ctxWithCache = makeTestContext(bundled as unknown as Manifest, { cache });
      try {
        await fetchAssetTool.handler(
          { id: "icon-agentforce", destination_path: "relative/path.png" },
          ctxWithCache,
        );
        throw new Error("expected throw");
      } catch (err) {
        expect((err as SfLogosError).code).toBe("InvalidInput");
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun test test/tools/fetch-asset.test.ts`
Expected: the five new tests fail. The current handler doesn't act on `destination_path` when `mode === "path"` — it just returns the cache path ignoring the destination field.

- [ ] **Step 3: Wire the destination branch**

Open `src/tools/fetch-asset.ts`. Find the `mode === "path"` branch (near the end of the handler — after the `mode === "url"` happy-path return and before the bytes branch). Replace this block:

```ts
    if (mode === "path") {
      const path = await ctx.cache.getPath(id, format, url);
      return { ...summary, format, url, path } satisfies AssetDetail;
    }
```

with:

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

- [ ] **Step 4: Run and confirm green**

Run: `bun test test/tools/fetch-asset.test.ts`
Expected: 18 pass (13 existing + 5 new).

- [ ] **Step 5: Gate full suite**

Run: `bun run typecheck && bun run lint && bun test`
Expected: all green, **125 tests pass** (110 + 7 destination-unit + 3 validation + 5 happy-path = 125).

This is the final unit-test-count target from the spec.

- [ ] **Step 6: Commit**

```bash
git add src/tools/fetch-asset.ts test/tools/fetch-asset.test.ts
git commit -m "$(cat <<'EOF'
feat: fetch_asset — write to destination_path when supplied

When destination_path is present on a mode='path' call, the handler
calls copyToDestination (from assets/destination.ts) to atomically copy
the cached file to the caller-specified location, then returns an
AssetDetail with:
  - path: the destination (what the caller asked for)
  - cached_from: the cache path (diagnostic, for cache hit/miss visibility)

Cache is preserved — the copy is copyFileSync, not a move. The "second
hit is free" invariant holds regardless of whether the caller uses
destination_path.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Build verification + server dispatch sanity

**Goal:** Confirm the compiled binary serves the new parameter end-to-end via the MCP dispatcher. No new tests; this is a verification task that catches any build-only issues before the regression suite runs.

**Files:** none changed.

- [ ] **Step 1: Rebuild**

Run: `bun run build`
Expected: `dist/` populated, no errors.

- [ ] **Step 2: Verify the compiled tool description mentions destination_path**

Run: `grep -c "destination_path" dist/src/tools/fetch-asset.js`
Expected: a positive integer (multiple occurrences — the field, schema property, description prose).

If zero, the build is stale or the description change didn't land.

- [ ] **Step 3: Run the regression suite to verify existing scenarios still pass**

Run: `bun run try:check`
Expected: `regression: 27/27 pass / 0 fail`. No new scenarios yet — Task 8 adds them. The existing 27 should not have regressed.

- [ ] **Step 4: Run smoke**

Run: `bun run phase2:smoke`
Expected: `phase2 smoke: 7 pass / 0 fail`.

- [ ] **Step 5: No commit**

Task 7 is verification-only. If any step fails, stop and investigate before proceeding to Task 8.

---

## Task 8: Regression scenarios for `destination_path`

**Goal:** Add two assertive end-to-end scenarios to `scripts/try-mcp.ts`. They run the built server via the MCP SDK client, validating the full stdio → dispatch → handler → filesystem flow.

**Files:**
- Modify: `scripts/try-mcp.ts`

- [ ] **Step 1: Extend the `Scenario` interface with an optional `cleanup` hook**

Open `scripts/try-mcp.ts`. Find the current `Scenario` interface (around line 202):

```ts
interface Scenario {
  label: string;
  tool: string;
  input: Record<string, unknown>;
  expect?: (output: unknown) => void;
  expectError?: { code: string };
}
```

Add a `cleanup` field:

```ts
interface Scenario {
  label: string;
  tool: string;
  input: Record<string, unknown>;
  expect?: (output: unknown) => void;
  expectError?: { code: string };
  /** Runs after the scenario regardless of pass/fail. For temp-file cleanup. */
  cleanup?: () => void;
}
```

- [ ] **Step 2: Call `cleanup` in the runner**

Find `runScenario` (around line 580). Wrap the assertion logic in try/finally so `cleanup` runs even if the scenario fails:

Before:
```ts
async function runScenario(client: Client, s: Scenario): Promise<ScenarioResult> {
  try {
    const resp = (await client.callTool({
      name: s.tool,
      arguments: s.input,
    })) as ToolCallResponse;
    // ... existing assertion logic ...
  } catch (err) {
    return { label: s.label, status: "fail", error: err instanceof Error ? err.message : String(err) };
  }
}
```

After (same shape, cleanup added):
```ts
async function runScenario(client: Client, s: Scenario): Promise<ScenarioResult> {
  try {
    const resp = (await client.callTool({
      name: s.tool,
      arguments: s.input,
    })) as ToolCallResponse;
    // ... existing assertion logic unchanged ...
  } catch (err) {
    return { label: s.label, status: "fail", error: err instanceof Error ? err.message : String(err) };
  } finally {
    try {
      s.cleanup?.();
    } catch {
      // Cleanup errors are silent — they would mask the real scenario result.
    }
  }
}
```

- [ ] **Step 3: Add the two new scenarios**

Still in `scripts/try-mcp.ts`, find the final `fetch_asset` phase-2 scenario (the one testing `InvalidAssetUrl` — around line 540). After its closing `},` and before the `SCENARIOS` array's closing `];`, add this IIFE-wrapped block that pre-creates the collision file and returns two scenarios:

```ts
  // ---------------------------------------------------- fetch_asset (phase 3A — destination_path)
  ...(() => {
    const pid = String(process.pid);
    const ts = String(Date.now());
    const destGood = `/tmp/try-mcp-dest-${pid}-${ts}.png`;
    const destExists = `/tmp/try-mcp-exists-${pid}-${ts}.png`;
    // Pre-create the file the DestinationExists scenario collides with.
    const { writeFileSync } = require("node:fs") as typeof import("node:fs");
    writeFileSync(destExists, "pre-existing");
    return [
      {
        label:
          "fetch_asset(destination_path=/tmp/...) — writes atomically; path=destination, cached_from=cache",
        tool: "fetch_asset",
        input: { id: "icon-agentforce", destination_path: destGood },
        expect: (out: unknown) => {
          const r = asObject(out);
          const destPath = asString(r["path"], "path");
          const cachedFrom = asString(r["cached_from"], "cached_from");
          if (destPath !== destGood) {
            throw new Error(`expected path=${destGood}, got ${destPath}`);
          }
          if (!cachedFrom.includes("sf-logos-mcp")) {
            throw new Error(`cached_from should reference the cache dir, got ${cachedFrom}`);
          }
          const { existsSync } = require("node:fs") as typeof import("node:fs");
          if (!existsSync(destPath)) {
            throw new Error(`destination file did not land on disk: ${destPath}`);
          }
        },
        cleanup: () => {
          const { unlinkSync } = require("node:fs") as typeof import("node:fs");
          try {
            unlinkSync(destGood);
          } catch {
            /* already removed */
          }
        },
      },
      {
        label:
          "fetch_asset(destination_path pointing to existing file) → DestinationExists",
        tool: "fetch_asset",
        input: { id: "icon-agentforce", destination_path: destExists },
        expectError: { code: "DestinationExists" },
        cleanup: () => {
          const { unlinkSync } = require("node:fs") as typeof import("node:fs");
          try {
            unlinkSync(destExists);
          } catch {
            /* already removed */
          }
        },
      },
    ];
  })(),
```

- [ ] **Step 4: Run the regression suite**

Run: `bun run try:check`
Expected: `regression: 29/29 pass / 0 fail`.

If the first new scenario fails (e.g. `expected path=<destGood>, got <something else>`), re-check Task 6's handler composition — specifically that `path` is set to `destination_path` and `cached_from` is set to the cache path.

- [ ] **Step 5: Gate full suite**

Run: `bun run typecheck && bun run lint && bun test`
Expected: all green, 125 tests pass.

- [ ] **Step 6: Commit**

```bash
git add scripts/try-mcp.ts
git commit -m "$(cat <<'EOF'
test: regression scenarios for fetch_asset(destination_path=...)

Two assertive scenarios against the built server via the MCP SDK:
- Happy path: destination written atomically; response shape
  {path: destination, cached_from: cache}; file exists on disk.
- DestinationExists: pre-existing target file triggers the new
  error code.

Scenario interface extended with an optional cleanup hook so the
pre-existing-file scenario leaves no trace. Regression count 27 → 29.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Update SESSION_PRIMER + LEARNINGS

**Goal:** Per the session-continuity skill, primer and learnings updates ride along with a substantive commit. This task captures the post-3A state.

**Files:**
- Modify: `docs/SESSION_PRIMER.md`
- Modify: `docs/LEARNINGS.md` (only if phase-3A execution surfaced any non-obvious findings)

- [ ] **Step 1: Bump the primer's phase-2 row to include 3A**

Open `docs/SESSION_PRIMER.md`. Change the "Last updated" line to today's date (2026-04-27 if same day, else the actual date).

Update the state table:

```markdown
| MCP server phase 2 | **Shipped.** 6th tool `fetch_asset` (url / path / bytes; default path + png), on-disk cache under `<OS cache>/sf-logos-mcp/<manifest.lastUpdated>/<id>.<ext>`, `find_brand_logo` advisories (co-brand-only), `SIGUSR2` diagnostics snapshot. |
| MCP server phase 3A | **Shipped.** `fetch_asset(destination_path)` — single-call download to absolute path, atomic writes, cache preserved. New `DestinationExists` error code. 125 tests, 29 regression scenarios. |
| MCP server phase 3 (remaining) | In scope. npm publish pipeline, full docs set, CI hardening, advisory symmetry. Separate specs when each turn comes. |
```

- [ ] **Step 2: Bump the "How to start work" regression count**

In the same file, find the block:

```bash
# 27 assertive scenarios hit the server via the real MCP SDK client.
bun run try:check
```

Change to:

```bash
# 29 assertive scenarios hit the server via the real MCP SDK client.
bun run try:check
```

- [ ] **Step 3: Add a new invariant if applicable**

If phase-3A surfaced a new invariant that would bite a fresh agent in their first 15 minutes, add it to the "Invariants" section. A candidate worth considering:

> 9. **`fetch_asset(destination_path=…)` requires an absolute path + id input only.** No tilde expansion, no URL input, no overwriting. Fails loudly with `InvalidInput` or `DestinationExists`.

Add it only if the contract is non-obvious enough to bite a fresh agent. If unsure, skip — the tool description already carries the rule.

- [ ] **Step 4: Append to LEARNINGS.md if anything surprising surfaced**

If phase-3A execution turned up a toolchain quirk, a node-fs corner case, or any finding that cost >15 minutes to diagnose, append it to `docs/LEARNINGS.md` under the relevant section (Toolchain, or a new Phase-3 section if warranted).

If nothing surprising surfaced, skip this step. Do not invent findings.

- [ ] **Step 5: Commit**

```bash
git add docs/SESSION_PRIMER.md
# If LEARNINGS was updated, include it:
# git add docs/LEARNINGS.md
git commit -m "$(cat <<'EOF'
docs: update SESSION_PRIMER for phase-3A shipping

Adds phase-3A row to the state table (destination_path feature,
125 tests, 29 regression scenarios). Bumps the regression-count
reference in the "how to start work" block.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Final verification + push + PR

**Goal:** Full sanity pass, then push the branch and open the PR.

**Files:** none changed.

- [ ] **Step 1: Run every gate one more time**

```bash
bun run typecheck
bun run lint
bun test
bun run build
bun run phase2:smoke
bun run try:check
```

Expected:
- `typecheck`: exit 0.
- `lint`: exit 0.
- `test`: 125 pass / 0 fail.
- `build`: `dist/` populated.
- `phase2:smoke`: 7 pass / 0 fail.
- `try:check`: 29/29 pass.

If any fail, stop and fix before pushing.

- [ ] **Step 2: Verify clean tree**

Run: `git status --short`
Expected: empty (or only `.claude/` if it sneaks back — that directory is gitignored as of phase 2).

- [ ] **Step 3: Push the branch**

Run: `git push -u origin spec/phase-3a-destination-path`

- [ ] **Step 4: Open the PR**

```bash
gh pr create --title "feat: phase 3A — fetch_asset(destination_path)" --body "$(cat <<'EOF'
## Summary

Adds the \`destination_path\` parameter to \`fetch_asset\`, shipping the sharpest motivator from phase-2 dog-food: a single tool call that writes an asset to a caller-specified absolute path atomically, without consuming the cache.

**Before (today):** \`find_* → fetch_asset(mode=path) → list_allowed_directories → move_file\` — four tool calls, cache depleted.

**After:** \`fetch_asset(id, destination_path)\` — one tool call, cache preserved, response includes both destination (\`path\`) and cache path (\`cached_from\`) for diagnostic visibility.

## Design decisions locked

See the authoritative spec at [\`docs/superpowers/specs/2026-04-27-phase-3a-destination-path.md\`](docs/superpowers/specs/2026-04-27-phase-3a-destination-path.md). In brief:

- Absolute paths only. No tilde, no relative, no magic.
- \`destination_path\` requires \`id\` input. URL input remains mode='url'-only.
- \`destination_path\` implies \`mode='path'\`. Other modes + destination_path → \`InvalidInput\`.
- Destination already exists → new \`DestinationExists\` error code. No overwrite flag.
- Cache-first, then copy. Cache preserved unconditionally.
- Atomic write: \`<dest>.tmp\` in destination's own directory → rename in place.

## Changes

- **New:** \`src/assets/destination.ts\` — validates absolute + null-byte, checks pre-existence, atomic copy via \`.tmp\` + rename, relays OS errors.
- **Modified:** \`src/tools/fetch-asset.ts\` — input schema + validation + destination branch.
- **Modified:** \`src/errors.ts\` — error union 6 → 7 (+ \`DestinationExists\`).
- **Modified:** \`src/manifest/types.ts\` — \`AssetDetail\` gains optional \`cached_from\`.
- **Tests:** \`test/assets/destination.test.ts\` new (7 scenarios). \`test/tools/fetch-asset.test.ts\` extended (+8 scenarios). \`test/errors.test.ts\` bumped to 7.
- **Regression:** 2 new scenarios in \`scripts/try-mcp.ts\` (happy path + DestinationExists).
- **Docs:** \`SESSION_PRIMER.md\` updated for phase-3A state.

## Test plan

- [x] \`bun run typecheck\` — pass
- [x] \`bun run lint\` — pass
- [x] \`bun test\` — 125 pass / 0 fail (was 110)
- [x] \`bun run build\` — clean
- [x] \`bun run phase2:smoke\` — 7/7 pass
- [x] \`bun run try:check\` — 29/29 pass (was 27)
- [ ] CI green on PR

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: Wait for CI**

Run: `gh run list --limit 1 --branch spec/phase-3a-destination-path`
Expected: eventually `completed / success` (typically within 20–30 seconds).

If CI fails, inspect logs with `gh run view <run-id>` and fix before merging.

- [ ] **Step 6: Merge**

Merge strategy: `--merge` (preserve TDD commit history):

```bash
gh pr merge <pr-number> --merge
```

- [ ] **Step 7: Sync local `main` and clean up the branch**

```bash
git fetch origin
git checkout main
git pull --ff-only origin main
git branch -d spec/phase-3a-destination-path
git push origin --delete spec/phase-3a-destination-path
```

- [ ] **Step 8: Verify main CI**

Run: `gh run list --limit 1 --branch main`
Expected: `completed / success`.

Phase-3A shipped.

---

## Appendix A — Decisions log

| # | Question | Decision |
|---|---|---|
| Q1 | Phase-3 scope | `fetch_asset(destination_path)` only. Other items deferred. |
| Q2 | Destination-already-exists behavior | Fail with new `DestinationExists` error code. |
| Q3 | Path form accepted | Absolute only. No tilde, no relative, no magic. |
| Q4 | Cache interaction | Always write to cache first, then copy to destination. |
| Q5 | Response shape | `path` = destination, `cached_from` = cache path. |
| Q6 | Input validation depth | Minimal: absolute + no null byte. OS permissions enforce. |
| Q7 | `mode` + `destination_path` | `destination_path` implies `mode="path"`; others → InvalidInput. |
| Q8 | URL input + `destination_path` | Rejected. URL input remains `mode="url"`-only. |
| Q9 | Write atomicity | `.tmp` in destination's own directory → rename in place. |
| A-approach | Code structure | Approach B — new `src/assets/destination.ts` module. |

---

## Self-review notes (author)

- Spec coverage: every acceptance criterion in the spec maps to a task. §2 input contract → Tasks 5–6. §3 output contract → Task 6. §4 error taxonomy → Tasks 2, 3, 5, 6. §5 module + handler arch → Tasks 3, 4, 5, 6. §6 tests → Tasks 3, 5, 6 (unit + integration), Task 8 (regression). §7 docs → Task 9 (primer) and tool description updated in Task 5.
- Placeholder scan: no "TBD" / "fill in" / "implement later" in any task.
- Type consistency: `CopyToDestinationOptions.source` / `destination` — used consistently across Tasks 3, 5, 6. `cached_from` field name consistent across spec, Task 4 type, Task 6 handler, Task 8 regression assertion.
- Tool count bump: single, final test count (125) declared once in Task 6 Step 5. Earlier tasks show intermediate counts (110, 117, 120, 125) so subagents have a predictable check at each gate.
- Regression count bump: 27 → 29 (Task 8), declared once.
- The Scenario-interface extension in Task 8 is the most complex piece of this plan. Two things the implementer must handle: (a) check whether `Scenario.cleanup` already exists before adding it, (b) route `cleanup()` through the regression runner's finally clause.
