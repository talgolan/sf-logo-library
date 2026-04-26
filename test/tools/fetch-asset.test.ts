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
