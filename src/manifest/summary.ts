/**
 * manifest/summary — Project raw manifest entries into AssetSummary.
 *
 * Responsibility: encapsulate every rule in spec §3 so each tool file
 * renders a consistent shape. Pre-resolves URLs (percent-encoding
 * spaces), computes preferred_format, trims brand_colors_hint to at
 * most 4 pairs, and nulls per-type fields that don't apply.
 * Dependencies: manifest/types.ts.
 *
 * See spec §3 and §5.1 (summary.ts).
 */

import type {
  AssetSummary,
  BrandColorMap,
  ManifestBrand,
  ManifestLogo,
} from "./types.js";

export const ASSET_BASE_URL = "https://dam.usefulto.me";

export function toAssetSummary(logo: ManifestLogo, brand: ManifestBrand): AssetSummary {
  const svgUrl = logo.svg !== null ? resolveUrl(logo.svg) : null;
  const pngUrl = logo.png !== null ? resolveUrl(logo.png) : null;
  // Product-icon manifest entries omit `type` and `co_branded`; infer them
  // from the brand so downstream consumers see a uniform shape. Brand logos
  // always carry these fields explicitly.
  const type = logo.type ?? (brand.id === "product-icons" ? "product-icon" : "logo");
  const co_branded = logo.co_branded ?? false;
  return {
    id: logo.id,
    name: logo.name,
    brand_id: brand.id,
    type,
    variant: logo.variant,
    background: logo.background,
    preferred: logo.preferred,
    co_branded,
    category: logo.category ?? null,
    keywords: logo.keywords,
    product_description: logo.product_description ?? null,
    use_cases: logo.use_cases ?? [],
    usage: logo.usage,
    formats: { svg: svgUrl, png: pngUrl },
    preferred_format: svgUrl !== null ? "svg" : "png",
    source_dimensions: logo.dimensions,
    aspect_ratio: logo.aspect_ratio,
    svg_intrinsic: logo.svg_intrinsic,
    brand_colors_hint: trimHint(brand.brandColors),
  };
}

/** Prepend the base URL and percent-encode spaces in path segments. */
export function resolveUrl(relativePath: string): string {
  const encoded = relativePath
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `${ASSET_BASE_URL}/${encoded}`;
}

function trimHint(colors: BrandColorMap): BrandColorMap {
  const entries = Object.entries(colors).slice(0, 4);
  const result: BrandColorMap = {};
  for (const [k, v] of entries) {
    result[k] = v;
  }
  return result;
}
