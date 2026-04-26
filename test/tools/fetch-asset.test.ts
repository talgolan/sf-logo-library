import { describe, it, expect } from "bun:test";
import { fetchAssetTool } from "../../src/tools/fetch-asset.js";
import bundled from "../../src/bundled/manifest.json" with { type: "json" };
import type { Manifest } from "../../src/manifest/types.js";
import { makeTestContext } from "../helpers/context.js";
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
