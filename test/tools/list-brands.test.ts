import { describe, it, expect } from "bun:test";
import { listBrandsTool } from "../../src/tools/list-brands.js";
import bundled from "../../src/bundled/manifest.json" with { type: "json" };
import type { Manifest } from "../../src/manifest/types.js";
import { makeTestContext } from "../helpers/context.js";

describe("list_brands", () => {
  it("returns one row per brand with name and logo_count", async () => {
    const ctx = makeTestContext(bundled as unknown as Manifest);
    const result = await listBrandsTool.handler({}, ctx);
    expect(result.brands).toHaveLength(6);
    const sf = result.brands.find((b) => b.id === "salesforce");
    expect(sf?.logo_count).toBeGreaterThan(0);
  });

  it("includes manifest_version and disclaimer", async () => {
    const ctx = makeTestContext(bundled as unknown as Manifest);
    const result = await listBrandsTool.handler({}, ctx);
    expect(typeof result.manifest_version).toBe("string");
    expect(typeof result.disclaimer).toBe("string");
  });

  it("has a description >= 200 chars (LLM-facing guidance)", () => {
    expect(listBrandsTool.description.length).toBeGreaterThanOrEqual(200);
  });
});
