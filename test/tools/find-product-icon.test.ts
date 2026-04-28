import { describe, it, expect } from "bun:test";
import { findProductIconTool } from "../../src/tools/find-product-icon.js";
import bundled from "../../src/bundled/manifest.json" with { type: "json" };
import type { Manifest } from "../../src/manifest/types.js";
import type { AdvisoryCode } from "../../src/advisories.js";
import { makeTestContext } from "../helpers/context.js";

describe("find_product_icon", () => {
  const ctx = () => makeTestContext(bundled as unknown as Manifest);

  it("rejects empty input with InvalidInput", async () => {
    let caught: unknown;
    try {
      await findProductIconTool.handler({}, ctx());
    } catch (e) {
      caught = e;
    }
    expect(caught).toMatchObject({ code: "InvalidInput" });
  });

  it("finds Agentforce by natural-language query", async () => {
    const r = await findProductIconTool.handler({ query: "autonomous AI agent" }, ctx());
    expect(r.icons.length).toBeGreaterThan(0);
    expect(r.icons[0]?.id).toBe("icon-agentforce");
    expect((r.icons[0]?.match_score ?? 0)).toBeGreaterThan(0);
  });

  it("filters by category alone", async () => {
    const r = await findProductIconTool.handler({ category: "AI" }, ctx());
    expect(r.icons.length).toBeGreaterThan(0);
    expect(r.icons.every((i) => i.category === "AI")).toBe(true);
  });

  it("ANDs query with filters", async () => {
    const r = await findProductIconTool.handler(
      { query: "einstein", category: "AI" },
      ctx(),
    );
    expect(r.icons.every((i) => i.category === "AI")).toBe(true);
  });

  it("limit clamps to max 90", async () => {
    const r = await findProductIconTool.handler({ category: "AI", limit: 1000 }, ctx());
    expect(r.icons.length).toBeLessThanOrEqual(90);
  });

  it("match_score is omitted when no query", async () => {
    const r = await findProductIconTool.handler({ category: "AI" }, ctx());
    expect(r.icons[0]?.match_score).toBeUndefined();
  });

  it("keywords filter is case-insensitive and ANDs all", async () => {
    const r = await findProductIconTool.handler({ keywords: ["AI", "AGENT"] }, ctx());
    expect(r.icons.length).toBeGreaterThan(0);
    for (const i of r.icons) {
      const lower = i.keywords.map((k) => k.toLowerCase());
      expect(lower).toContain("ai");
      expect(lower).toContain("agent");
    }
  });

  it("has a description >= 200 chars", () => {
    expect(findProductIconTool.description.length).toBeGreaterThanOrEqual(200);
  });
});

describe("find_product_icon — advisories", () => {
  const ctx = () => makeTestContext(bundled as unknown as Manifest);

  it("emits 'empty_result_filter_too_narrow' when category + keywords filter eliminates everything", async () => {
    const result = (await findProductIconTool.handler(
      { category: "Data", keywords: ["__nonexistent_xyz__"] },
      ctx(),
    )) as { icons: unknown[]; advisories?: AdvisoryCode[] };
    expect(result.icons).toHaveLength(0);
    expect(result.advisories ?? []).toContain("empty_result_filter_too_narrow");
  });

  it("does NOT emit 'empty_result_filter_too_narrow' when results exist", async () => {
    const result = (await findProductIconTool.handler({ category: "AI" }, ctx())) as {
      icons: unknown[];
      advisories?: AdvisoryCode[];
    };
    expect(result.icons.length).toBeGreaterThan(0);
    expect(result.advisories ?? []).not.toContain("empty_result_filter_too_narrow");
  });
});
