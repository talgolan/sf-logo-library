/**
 * manifest/types — TypeScript shape of the canonical manifest.json.
 *
 * Responsibility: describe the raw manifest exactly as served by
 * dam.usefulto.me. Every tool consumes projections of this type
 * (see summary.ts), never the raw entries directly.
 * Dependencies: none.
 *
 * See docs/architecture.md for how the manifest flows through the server.
 */

/** Brand identifier used across the manifest. */
export type BrandId =
  | "salesforce"
  | "mulesoft"
  | "slack"
  | "tableau"
  | "informatica"
  | "product-icons";

/** Asset type — see spec §3 field rules. */
export type AssetType = "logo" | "icon-mark" | "co-brand" | "product-icon";

/** Surface the asset is designed for. */
export type Background = "light" | "dark";

/** Product-icon categories (null for brand logos). */
export type ProductIconCategory =
  | "AI"
  | "CRM"
  | "Platform"
  | "Data"
  | "Industries"
  | "Marketing"
  | "Service"
  | "Security";

/** Dimensions block as carried by the manifest. */
export interface ManifestDimensions {
  width: number;
  height: number;
  source: "png" | "svg";
}

/** Aspect ratio block. */
export interface ManifestAspectRatio {
  decimal: number;
  ratio: string;
  is_square: boolean;
}

/** SVG viewBox-based intrinsic dimensions (present when an SVG exists). */
export interface ManifestSvgIntrinsic {
  width: number;
  height: number;
  aspect_ratio_decimal: number;
  ratio: string;
}

/** One asset entry within a brand's logos[] array. */
export interface ManifestLogo {
  id: string;
  name: string;
  variant: string;
  background: Background;
  preferred: boolean;
  usage: string;
  png: string | null;
  svg: string | null;
  /** Absent on product-icon entries — toAssetSummary defaults to "product-icon". */
  type?: AssetType;
  /** Absent on product-icon entries — toAssetSummary defaults to false. */
  co_branded?: boolean;
  keywords: string[];
  /** Absent on product-icon entries — toAssetSummary defaults to []. */
  use_cases?: string[];
  dimensions: ManifestDimensions;
  aspect_ratio: ManifestAspectRatio;
  svg_intrinsic: ManifestSvgIntrinsic | null;
  /** product-icon only. */
  category?: ProductIconCategory;
  /** product-icon only. */
  product_description?: string;
  /** brand-wordmark only. */
  orientation?: "horizontal" | "vertical";
}

/** Brand-level palette as a flat key/hex map. */
export type BrandColorMap = Record<string, string>;

/** One entry in the curated color-roles list. */
export interface ManifestColorRoleEntry {
  name: string;
  hex: string;
  roles: string[];
}

/** Full semantic color-roles section. */
export interface ManifestColorRoles {
  _description: string;
  roles: Record<string, ManifestColorRoleEntry[]>;
}

/** One brand grouping. */
export interface ManifestBrand {
  id: BrandId;
  name: string;
  brandColors: BrandColorMap;
  logos: ManifestLogo[];
}

/** Root manifest shape. */
export interface Manifest {
  title: string;
  description: string;
  lastUpdated: string;
  brands: ManifestBrand[];
  colorRoles: ManifestColorRoles;
  _ai_instructions?: { disclaimer?: string; [k: string]: unknown };
  disclaimer?: string;
}

// ---------------------------------------------------------------------------
// Tool-output types (projections served by the MCP tools)
// ---------------------------------------------------------------------------

/** Summary form served by find/list tools. See spec §3. */
export interface AssetSummary {
  id: string;
  name: string;
  brand_id: BrandId;
  type: AssetType;
  variant: string;
  background: Background;
  preferred: boolean;
  co_branded: boolean;
  /** null on brand logos; one of ProductIconCategory on product-icons. */
  category: ProductIconCategory | null;
  keywords: string[];
  /** null on brand logos; string on product-icons. */
  product_description: string | null;
  use_cases: string[];
  usage: string;
  formats: { svg: string | null; png: string | null };
  /** "svg" when available, else "png". */
  preferred_format: "svg" | "png";
  source_dimensions: ManifestDimensions;
  aspect_ratio: ManifestAspectRatio;
  svg_intrinsic: ManifestSvgIntrinsic | null;
  /** At most 4 key/hex pairs from the brand's palette. */
  brand_colors_hint: BrandColorMap;
  /** Present only on find_product_icon results when `query` was supplied. */
  match_score?: number;
}

/** Detail form served by fetch_asset. Superset of AssetSummary. */
export interface AssetDetail extends AssetSummary {
  /** The single format actually served by this call. */
  format: "svg" | "png";
  /** Always present. */
  url: string;
  /** Present when mode === "path". */
  path?: string;
  /** Present when mode === "bytes". */
  bytes_base64?: string;
  /** Present when target_width or target_height was set. */
  computed_dimensions?: { width: number; height: number };
  /** Present when computed_dimensions is present. */
  dimension_source?: "svg_intrinsic" | "source_dimensions";
}

/** Per-brand row in list_brands output. */
export interface BrandSummary {
  id: BrandId;
  name: string;
  logo_count: number;
}

/** Row in get_color_roles output. */
export type ColorEntry = ManifestColorRoleEntry;
