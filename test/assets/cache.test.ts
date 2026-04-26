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
      fetcher: cache.fetcher,
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
