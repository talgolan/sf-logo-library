import { describe, it, expectTypeOf } from "bun:test";
import type {
  AssetSummary,
  AssetDetail,
  BrandSummary,
  ColorEntry,
} from "../../src/manifest/types.js";

describe("Tool-output types", () => {
  it("AssetDetail extends AssetSummary", () => {
    const base: AssetSummary = {
      id: "x",
      name: "X",
      brand_id: "salesforce",
      type: "logo",
      variant: "Color",
      background: "light",
      preferred: false,
      co_branded: false,
      category: null,
      keywords: [],
      product_description: null,
      use_cases: [],
      usage: "",
      formats: { svg: null, png: null },
      preferred_format: "png",
      source_dimensions: { width: 1, height: 1, source: "png" },
      aspect_ratio: { decimal: 1, ratio: "1:1", is_square: true },
      svg_intrinsic: null,
      brand_colors_hint: {},
    };
    const detail: AssetDetail = { ...base, format: "png", url: "https://x" };
    expectTypeOf(detail).toMatchTypeOf<AssetSummary>();
  });

  it("BrandSummary has id/name/logo_count", () => {
    const b: BrandSummary = { id: "salesforce", name: "Salesforce", logo_count: 5 };
    expectTypeOf(b.logo_count).toBeNumber();
  });

  it("ColorEntry has name/hex/roles", () => {
    const c: ColorEntry = { name: "Blue 50", hex: "#0176D3", roles: ["primary"] };
    expectTypeOf(c.roles).toBeArray();
  });
});
