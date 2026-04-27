import { describe, it, expect } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fetchAssetTool } from "../../src/tools/fetch-asset.js";
import bundled from "../../src/bundled/manifest.json" with { type: "json" };
import type { Manifest } from "../../src/manifest/types.js";
import { makeTestContext } from "../helpers/context.js";
import { createAssetCache, type AssetCache } from "../../src/assets/cache.js";
import type { SfLogosError } from "../../src/errors.js";

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
      const ctxWithCache = makeTestContext(bundled as unknown as Manifest, { cache });
      const result = (await fetchAssetTool.handler(
        { id: "icon-agentforce" }, // no mode — default should be 'path'
        ctxWithCache,
      )) as { path?: string; format: string };
      expect(result.format).toBe("png");
      expect(result.path?.endsWith("icon-agentforce.png")).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("raises FormatUnavailable with explicit available_formats when asked for unavailable format", async () => {
    const iconBrand = (bundled as unknown as Manifest).brands.find(
      (b) => b.id === "product-icons",
    );
    const svgOnly = iconBrand?.logos.find((l) => l.png === null && l.svg !== null);
    if (!svgOnly) return; // no natural fixture; contract covered elsewhere
    try {
      await fetchAssetTool.handler(
        { id: svgOnly.id, format: "png", mode: "url" },
        makeTestContext(bundled as unknown as Manifest),
      );
      throw new Error("expected throw");
    } catch (err) {
      expect((err as SfLogosError).code).toBe("FormatUnavailable");
    }
  });
});

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
      const ctxWithCache = makeTestContext(bundled as unknown as Manifest, { cache });
      const result = (await fetchAssetTool.handler(
        { id: "icon-agentforce", mode: "bytes", format: "svg" },
        ctxWithCache,
      )) as { bytes_base64?: string; format: string };
      expect(result.format).toBe("svg");
      expect(typeof result.bytes_base64).toBe("string");
      expect(result.bytes_base64?.length ?? 0).toBeGreaterThan(0);
      const decoded = Buffer.from(result.bytes_base64 ?? "", "base64").toString("utf8");
      expect(decoded).toContain("dam.usefulto.me"); // URL appears in our mock body
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

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
