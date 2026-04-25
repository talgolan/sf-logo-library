// test/manifest/summary.test.ts
import { describe, it, expect } from "bun:test";
import { toAssetSummary, ASSET_BASE_URL } from "../../src/manifest/summary.js";
import type { ManifestBrand, ManifestLogo } from "../../src/manifest/types.js";

const brand: ManifestBrand = {
  id: "salesforce",
  name: "Salesforce",
  brandColors: { primary: "#0176d3", navy: "#032d60", cloud: "#1b96ff", white: "#fff", extra5: "#000" },
  logos: [],
};

const baseLogo: ManifestLogo = {
  id: "sf-x",
  name: "X",
  variant: "Color",
  background: "light",
  preferred: true,
  usage: "u",
  png: "Original/Logo Assets for Upload/Horizontal Logo RGB/X.png",
  svg: "Original/Logo Assets for Upload/Horizontal Logo RGB/X.svg",
  type: "logo",
  co_branded: false,
  keywords: ["a"],
  use_cases: [],
  dimensions: { width: 1, height: 1, source: "png" },
  aspect_ratio: { decimal: 1, ratio: "1:1", is_square: true },
  svg_intrinsic: null,
};

describe("toAssetSummary", () => {
  it("resolves URLs with percent-encoded spaces", () => {
    const s = toAssetSummary(baseLogo, brand);
    expect(s.formats.svg).toBe(`${ASSET_BASE_URL}/Original/Logo%20Assets%20for%20Upload/Horizontal%20Logo%20RGB/X.svg`);
    expect(s.formats.png).toBe(`${ASSET_BASE_URL}/Original/Logo%20Assets%20for%20Upload/Horizontal%20Logo%20RGB/X.png`);
  });

  it("preferred_format is svg when both present", () => {
    expect(toAssetSummary(baseLogo, brand).preferred_format).toBe("svg");
  });

  it("preferred_format is png when svg is null", () => {
    expect(toAssetSummary({ ...baseLogo, svg: null }, brand).preferred_format).toBe("png");
  });

  it("trims brand_colors_hint to at most 4 key/hex pairs", () => {
    const s = toAssetSummary(baseLogo, brand);
    expect(Object.keys(s.brand_colors_hint).length).toBeLessThanOrEqual(4);
  });

  it("nulls category and product_description for brand logos", () => {
    const s = toAssetSummary(baseLogo, brand);
    expect(s.category).toBeNull();
    expect(s.product_description).toBeNull();
  });

  it("passes through category and product_description for product-icons", () => {
    const iconBrand: ManifestBrand = { ...brand, id: "product-icons" };
    const icon: ManifestLogo = {
      ...baseLogo,
      type: "product-icon",
      category: "AI",
      product_description: "AI stuff",
    };
    const s = toAssetSummary(icon, iconBrand);
    expect(s.category).toBe("AI");
    expect(s.product_description).toBe("AI stuff");
  });

  it("defaults type='product-icon' and co_branded=false for product-icon entries that omit them", () => {
    // The bundled manifest's product-icon entries do not carry `type` or
    // `co_branded`; the projection must fill them in so AssetSummary is
    // never missing required fields.
    const iconBrand: ManifestBrand = { ...brand, id: "product-icons" };
    const { type: _t, co_branded: _c, ...rest } = baseLogo;
    const bare: ManifestLogo = rest;
    const s = toAssetSummary(bare, iconBrand);
    expect(s.type).toBe("product-icon");
    expect(s.co_branded).toBe(false);
  });

  it("defaults type='logo' for non-icon brands that omit the field", () => {
    const { type: _t, ...rest } = baseLogo;
    const bare: ManifestLogo = rest;
    const s = toAssetSummary(bare, brand);
    expect(s.type).toBe("logo");
  });
});
