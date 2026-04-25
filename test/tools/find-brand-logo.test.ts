import { describe, it, expect } from "bun:test";
import { findBrandLogoTool } from "../../src/tools/find-brand-logo.js";
import bundled from "../../src/bundled/manifest.json" with { type: "json" };
import type { Manifest } from "../../src/manifest/types.js";
import { makeTestContext } from "../helpers/context.js";

describe("find_brand_logo", () => {
  const ctx = () => makeTestContext(bundled as unknown as Manifest);

  it("rejects brand 'product-icons' with InvalidInput", async () => {
    let caught: unknown;
    try {
      await findBrandLogoTool.handler({ brand: "product-icons" as never }, ctx());
    } catch (e) {
      caught = e;
    }
    expect(caught).toMatchObject({ code: "InvalidInput" });
  });

  it("raises UnknownBrand for unknown brand", async () => {
    let caught: unknown;
    try {
      await findBrandLogoTool.handler({ brand: "zzz" as never }, ctx());
    } catch (e) {
      caught = e;
    }
    expect(caught).toMatchObject({ code: "UnknownBrand" });
  });

  it("returns salesforce logos with fully-qualified SVG URLs", async () => {
    const r = await findBrandLogoTool.handler({ brand: "salesforce" }, ctx());
    expect(r.logos.length).toBeGreaterThan(0);
    for (const l of r.logos) {
      if (l.formats.svg) expect(l.formats.svg).toMatch(/^https:\/\/dam\.usefulto\.me\//);
    }
  });

  it("filters by background=dark", async () => {
    const r = await findBrandLogoTool.handler(
      { brand: "salesforce", background: "dark" },
      ctx(),
    );
    expect(r.logos.every((l) => l.background === "dark")).toBe(true);
  });

  it("preferred_only narrows to preferred=true", async () => {
    const r = await findBrandLogoTool.handler(
      { brand: "salesforce", preferred_only: true },
      ctx(),
    );
    expect(r.logos.every((l) => l.preferred)).toBe(true);
  });

  it("co_branded=true keeps only endorsed lockups", async () => {
    const r = await findBrandLogoTool.handler({ brand: "slack", co_branded: true }, ctx());
    expect(r.logos.every((l) => l.co_branded)).toBe(true);
  });

  it("sort order: preferred first", async () => {
    const r = await findBrandLogoTool.handler({ brand: "salesforce" }, ctx());
    const prefIdx = r.logos.findIndex((l) => l.preferred);
    expect(prefIdx).toBe(0);
  });

  it("has a description >= 200 chars", () => {
    expect(findBrandLogoTool.description.length).toBeGreaterThanOrEqual(200);
  });
});
