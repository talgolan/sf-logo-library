/**
 * tools/find-product-icon — Search Salesforce 2D product icons.
 *
 * Responsibility: scored search + filter. Requires at least one of
 * `query`, `category`, `keywords`, or `background`. When `query` is
 * present, results are ranked; otherwise alphabetical.
 * Errors: InvalidInput when none of the above are supplied.
 * Dependencies: manifest/summary.ts, search/tokenize.ts, search/score.ts,
 *   errors.ts, tools/registry.ts.
 *
 * Scoring (spec §2):
 *   +3 per exact or word-boundary keyword match
 *   +2 per name substring match
 *   +1 per product_description or use_case substring match
 *
 * See spec §2 (find_product_icon).
 */

import { sortAdvisories, type AdvisoryCode } from "../advisories.js";
import { SfLogosError } from "../errors.js";
import { toAssetSummary } from "../manifest/summary.js";
import type { AssetSummary, Background, ProductIconCategory } from "../manifest/types.js";
import { scoreLogo } from "../search/score.js";
import { tokenize } from "../search/tokenize.js";
import { defineTool } from "./registry.js";

interface Input {
  query?: string;
  category?: ProductIconCategory;
  keywords?: string[];
  background?: Background;
  limit?: number;
}
interface Output {
  icons: AssetSummary[];
  advisories?: AdvisoryCode[];
}

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 90;

const DESCRIPTION = [
  "Search Salesforce 2D product icons. You MUST provide at least one of:",
  "`query` (natural language — scored across keywords, name, description, use_cases),",
  "`category` (one of AI | CRM | Platform | Data | Industries | Marketing | Service | Security),",
  "`keywords` (list — ALL must appear as keywords on the asset, case-insensitive),",
  "`background` ('light'/'dark'). Filters are ANDed. `limit` defaults to 10, max 90.",
  "Prefer SVG (summary.preferred_format). All 90 icons are square (is_square=true).",
  "Passing no filters raises InvalidInput.",
  "Name drift: some products have been renamed (e.g. 'Data Cloud' → 'Data 360');",
  "keywords cover former names, but `name` is always the current canonical label —",
  "surface `name` to the user rather than the query string.",
].join(" ");

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export const findProductIconTool = defineTool<Input, Output>({
  name: "find_product_icon",
  description: DESCRIPTION,
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Natural-language search string." },
      category: {
        type: "string",
        enum: ["AI", "CRM", "Platform", "Data", "Industries", "Marketing", "Service", "Security"],
        description: "Product-icon category.",
      },
      keywords: {
        type: "array",
        items: { type: "string" },
        description:
          "Case-insensitive exact-token match — every listed keyword must appear on the asset.",
      },
      background: {
        type: "string",
        enum: ["light", "dark"],
        description: "Target surface.",
      },
      limit: { type: "integer", minimum: 1, maximum: MAX_LIMIT, default: DEFAULT_LIMIT },
    },
    additionalProperties: false,
    description: "Find product icons by query, category, keywords, and/or background.",
  },
  handler: (input, ctx) => {
    if (
      input.query === undefined &&
      input.category === undefined &&
      input.keywords === undefined &&
      input.background === undefined
    ) {
      return Promise.reject(
        new SfLogosError(
          "InvalidInput",
          "find_product_icon requires at least one of query, category, keywords, or background.",
          {},
        ),
      );
    }
    const brand = ctx.manifest.brands.find((b) => b.id === "product-icons");
    if (!brand) return Promise.resolve({ icons: [] });

    const preFilterCount = brand.logos.length;

    let candidates = brand.logos.slice();
    if (input.category !== undefined) {
      candidates = candidates.filter((l) => l.category === input.category);
    }
    if (input.background !== undefined) {
      candidates = candidates.filter((l) => l.background === input.background);
    }
    if (input.keywords !== undefined && input.keywords.length > 0) {
      const wanted = input.keywords.map((k) => k.toLowerCase());
      candidates = candidates.filter((l) => {
        const lower = l.keywords.map((k) => k.toLowerCase());
        return wanted.every((w) => lower.includes(w));
      });
    }

    const postFilterCount = candidates.length;
    const limit = clamp(input.limit ?? DEFAULT_LIMIT, 1, MAX_LIMIT);

    const queryTrimmed = input.query?.trim() ?? "";
    const hasQuery = queryTrimmed.length > 0;

    let finalIcons: AssetSummary[];
    if (hasQuery) {
      const tokens = tokenize(queryTrimmed);
      const scored = candidates
        .map((l) => ({ logo: l, score: scoreLogo(l, tokens) }))
        .filter((s) => s.score > 0)
        .sort((a, b) =>
          b.score !== a.score ? b.score - a.score : a.logo.name.localeCompare(b.logo.name),
        )
        .slice(0, limit);
      finalIcons = scored.map((s) => ({
        ...toAssetSummary(s.logo, brand),
        match_score: s.score,
      }));
    } else {
      candidates.sort((a, b) => a.name.localeCompare(b.name));
      finalIcons = candidates.slice(0, limit).map((l) => toAssetSummary(l, brand));
    }

    const advisorySet = new Set<AdvisoryCode>();
    const nonQueryFilterSupplied =
      input.category !== undefined ||
      (input.keywords !== undefined && input.keywords.length > 0) ||
      input.background !== undefined;
    if (finalIcons.length === 0 && nonQueryFilterSupplied && preFilterCount > 0) {
      advisorySet.add("empty_result_filter_too_narrow");
    }
    if (finalIcons.length === 0 && hasQuery && postFilterCount > 0) {
      advisorySet.add("query_matched_no_scored_results");
    }

    const advisories = sortAdvisories(advisorySet);
    return Promise.resolve({
      icons: finalIcons,
      ...(advisories.length > 0 ? { advisories } : {}),
    });
  },
});
