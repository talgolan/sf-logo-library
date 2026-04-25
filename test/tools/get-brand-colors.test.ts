import { describe, it, expect } from "bun:test";
import { getBrandColorsTool } from "../../src/tools/get-brand-colors.js";
import bundled from "../../src/bundled/manifest.json" with { type: "json" };
import type { Manifest } from "../../src/manifest/types.js";
import { makeTestContext } from "../helpers/context.js";

describe("get_brand_colors", () => {
  it("returns the brand's palette", async () => {
    const ctx = makeTestContext(bundled as unknown as Manifest);
    const result = await getBrandColorsTool.handler({ brand_id: "salesforce" }, ctx);
    expect(result.brand_id).toBe("salesforce");
    expect(typeof result.colors["primary"]).toBe("string");
  });

  it("raises UnknownBrand for unknown ids", async () => {
    const ctx = makeTestContext(bundled as unknown as Manifest);
    let caught: unknown;
    try {
      await getBrandColorsTool.handler({ brand_id: "nope" as never }, ctx);
    } catch (e) {
      caught = e;
    }
    expect(caught).toMatchObject({ code: "UnknownBrand" });
  });

  it("has a description >= 200 chars", () => {
    expect(getBrandColorsTool.description.length).toBeGreaterThanOrEqual(200);
  });
});
