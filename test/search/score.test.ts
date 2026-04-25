// test/search/score.test.ts
import { describe, it, expect } from "bun:test";
import { scoreLogo } from "../../src/search/score.js";
import type { ManifestLogo } from "../../src/manifest/types.js";

const base: ManifestLogo = {
  id: "icon-agentforce",
  name: "Agentforce",
  variant: "Full Color",
  background: "light",
  preferred: false,
  usage: "",
  png: "p",
  svg: "s",
  type: "product-icon",
  co_branded: false,
  keywords: ["AI", "agent", "autonomous AI", "agentforce", "LLM"],
  use_cases: ["AI slide"],
  dimensions: { width: 1, height: 1, source: "png" },
  aspect_ratio: { decimal: 1, ratio: "1:1", is_square: true },
  svg_intrinsic: null,
  category: "AI",
  product_description: "Autonomous AI agent platform.",
};

describe("scoreLogo", () => {
  it("exact keyword hits score 3 each (and name hits +2 when it also matches)", () => {
    // token 'agentforce': kw exact (+3) + name substring (+2) = 5.
    expect(scoreLogo(base, ["agentforce"])).toBe(5);
  });
  it("name substring alone scores 2", () => {
    // no keywords configured, so only the name match fires.
    expect(scoreLogo({ ...base, keywords: [] }, ["agentforce"])).toBe(2);
  });
  it("description substring alone scores 1", () => {
    // 'platform' is in product_description only.
    expect(scoreLogo({ ...base, keywords: [] }, ["platform"])).toBe(1);
  });
  it("zero score when no token matches anywhere", () => {
    expect(scoreLogo(base, ["xyz123"])).toBe(0);
  });
  it("sums across tokens", () => {
    // 'agentforce' (kw:3 + name:2 = 5) + 'platform' (desc:1) = 6.
    expect(scoreLogo(base, ["agentforce", "platform"])).toBe(6);
  });
});
