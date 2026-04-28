import { describe, it, expect } from "bun:test";
import { findBrandLogoTool } from "../../src/tools/find-brand-logo.js";
import bundled from "../../src/bundled/manifest.json" with { type: "json" };
import type { Manifest } from "../../src/manifest/types.js";
import { makeTestContext } from "../helpers/context.js";
import type { AdvisoryCode } from "../../src/advisories.js";

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

describe("find_brand_logo — advisories", () => {
  const ctx = () => makeTestContext(bundled as unknown as Manifest);

  it("emits 'only_co_branded_for_requested_background' when all dark Slack results are co-branded", async () => {
    const result = (await findBrandLogoTool.handler(
      { brand: "slack", background: "dark" },
      ctx(),
    )) as { logos: Array<{ co_branded: boolean }>; advisories?: AdvisoryCode[] };
    expect(result.logos.length).toBeGreaterThan(0);
    expect(result.logos.every((l) => l.co_branded)).toBe(true);
    expect(result.advisories ?? []).toContain("only_co_branded_for_requested_background");
  });

  it("does NOT emit the advisory when some standalone results exist", async () => {
    const result = (await findBrandLogoTool.handler(
      { brand: "salesforce", background: "light" },
      ctx(),
    )) as { logos: Array<{ co_branded: boolean }>; advisories?: AdvisoryCode[] };
    expect(result.logos.some((l) => !l.co_branded)).toBe(true);
    expect(result.advisories ?? []).not.toContain("only_co_branded_for_requested_background");
  });

  it("does NOT emit the advisory when background is not specified", async () => {
    const result = (await findBrandLogoTool.handler({ brand: "slack" }, ctx())) as {
      logos: Array<{ co_branded: boolean }>;
      advisories?: AdvisoryCode[];
    };
    expect(result.advisories ?? []).not.toContain("only_co_branded_for_requested_background");
  });

  it("does NOT emit the advisory when co_branded: true was explicitly requested", async () => {
    const result = (await findBrandLogoTool.handler(
      { brand: "slack", background: "dark", co_branded: true },
      ctx(),
    )) as { logos: Array<{ co_branded: boolean }>; advisories?: AdvisoryCode[] };
    expect(result.logos.length).toBeGreaterThan(0);
    expect(result.logos.every((l) => l.co_branded)).toBe(true);
    expect(result.advisories ?? []).not.toContain("only_co_branded_for_requested_background");
  });

  it("emits 'only_light_surface_standalone_available' for dark Slack (co-emits with co-brand advisory)", async () => {
    const result = (await findBrandLogoTool.handler(
      { brand: "slack", background: "dark" },
      ctx(),
    )) as { advisories?: AdvisoryCode[] };
    expect(result.advisories ?? []).toContain("only_light_surface_standalone_available");
    expect(result.advisories ?? []).toContain("only_co_branded_for_requested_background");
  });

  it("does NOT emit 'only_light_surface_standalone_available' for dark Salesforce (standalone dark mark exists)", async () => {
    const result = (await findBrandLogoTool.handler(
      { brand: "salesforce", background: "dark" },
      ctx(),
    )) as { advisories?: AdvisoryCode[] };
    expect(result.advisories ?? []).not.toContain("only_light_surface_standalone_available");
  });

  it("does NOT emit 'only_light_surface_standalone_available' for light-background request", async () => {
    const result = (await findBrandLogoTool.handler(
      { brand: "slack", background: "light" },
      ctx(),
    )) as { advisories?: AdvisoryCode[] };
    expect(result.advisories ?? []).not.toContain("only_light_surface_standalone_available");
  });

  it("emits 'only_light_surface_standalone_available' even when co_branded:true is explicit (co-brand advisory suppressed, light-surface advisory still fires)", async () => {
    const result = (await findBrandLogoTool.handler(
      { brand: "slack", background: "dark", co_branded: true },
      ctx(),
    )) as { advisories?: AdvisoryCode[] };
    expect(result.advisories ?? []).toContain("only_light_surface_standalone_available");
    expect(result.advisories ?? []).not.toContain("only_co_branded_for_requested_background");
  });

  it("emits 'empty_result_filter_too_narrow' when filters eliminate every candidate", async () => {
    const result = (await findBrandLogoTool.handler(
      { brand: "salesforce", background: "dark", variant: "__nonexistent_xyz__" },
      ctx(),
    )) as { logos: unknown[]; advisories?: AdvisoryCode[] };
    expect(result.logos).toHaveLength(0);
    expect(result.advisories ?? []).toContain("empty_result_filter_too_narrow");
  });

  it("does NOT emit 'empty_result_filter_too_narrow' when no filters are supplied", async () => {
    const result = (await findBrandLogoTool.handler({ brand: "salesforce" }, ctx())) as {
      logos: unknown[];
      advisories?: AdvisoryCode[];
    };
    expect(result.logos.length).toBeGreaterThan(0);
    expect(result.advisories ?? []).not.toContain("empty_result_filter_too_narrow");
  });

  it("does NOT emit 'empty_result_filter_too_narrow' when filters still yield results", async () => {
    const result = (await findBrandLogoTool.handler(
      { brand: "salesforce", background: "dark" },
      ctx(),
    )) as { logos: unknown[]; advisories?: AdvisoryCode[] };
    expect(result.logos.length).toBeGreaterThan(0);
    expect(result.advisories ?? []).not.toContain("empty_result_filter_too_narrow");
  });
});
