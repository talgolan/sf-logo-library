/**
 * tools/find-brand-logo — Select brand-wordmark / lockup assets.
 *
 * Responsibility: filter a brand's logos by background, co_branded,
 * variant substring, and preferred_only. Sort preferred-first, then
 * background-match, then alphabetical.
 * Errors:
 *   - InvalidInput when brand is 'product-icons' (use find_product_icon).
 *   - UnknownBrand when brand is not in list_brands.
 * Dependencies: manifest/summary.ts, manifest/types.ts, errors.ts,
 *   tools/registry.ts.
 *
 * Selection rules enforced here:
 *   1. If background is given, exact match.
 *   2. If co_branded is given, exact match.
 *   3. If variant is given, case-insensitive substring match on .variant.
 *   4. If preferred_only is true, keep only preferred=true.
 *   5. Sort: preferred first, then background-match (when filter set),
 *      then alphabetical by name.
 *
 * See spec §2 (find_brand_logo).
 */

import { sortAdvisories, type AdvisoryCode } from "../advisories.js";
import { SfLogosError } from "../errors.js";
import { toAssetSummary } from "../manifest/summary.js";
import type { AssetSummary, Background, BrandId } from "../manifest/types.js";
import { ev } from "../observability/events.js";
import { defineTool } from "./registry.js";

interface Input {
  brand: BrandId;
  background?: Background;
  co_branded?: boolean;
  variant?: string;
  preferred_only?: boolean;
}
interface Output {
  logos: AssetSummary[];
  advisories?: AdvisoryCode[];
}

const DESCRIPTION = [
  "Find brand wordmark or lockup assets for Salesforce, MuleSoft, Slack, Tableau,",
  "or Informatica. Required: `brand` (NOT 'product-icons' — use find_product_icon).",
  "Optional filters: `background` ('light'/'dark' — match the target slide surface),",
  "`co_branded` (true = Salesforce-endorsed lockups only), `variant` (substring on",
  "the asset's variant, e.g. 'Knockout'), `preferred_only` (only the default-choice",
  "asset). Results sorted preferred-first. Always prefer SVG (summary.preferred_format).",
  "Never recolor or distort — preserve the aspect_ratio supplied on each result.",
  "On success, the response may include `advisories` (optional string array) with one",
  "or more of: `only_co_branded_for_requested_background` (every result is a",
  "Salesforce-endorsed lockup when a specific background was requested — suppressed",
  "when co_branded: true was the caller's explicit ask), `only_light_surface_standalone_available`",
  "(dark background requested but only light-surface standalone marks exist for this brand —",
  "place the light mark on a contrasting card), `empty_result_filter_too_narrow` (the",
  "AND of filters eliminated every candidate — relaxing a filter is the likely recovery).",
].join(" ");

export const findBrandLogoTool = defineTool<Input, Output>({
  name: "find_brand_logo",
  description: DESCRIPTION,
  inputSchema: {
    type: "object",
    properties: {
      brand: {
        type: "string",
        description: "Brand id from list_brands (not 'product-icons').",
      },
      background: {
        type: "string",
        enum: ["light", "dark"],
        description: "Match the target surface.",
      },
      co_branded: {
        type: "boolean",
        description:
          "true = Salesforce-endorsed lockups only; false = exclude lockups. Omit for any.",
      },
      variant: {
        type: "string",
        description: "Case-insensitive substring on the asset's variant (e.g. 'Knockout').",
      },
      preferred_only: {
        type: "boolean",
        description: "Only assets with preferred=true.",
      },
    },
    required: ["brand"],
    additionalProperties: false,
    description: "Filter a brand's logos.",
  },
  handler: (input, ctx) => {
    if (input.brand === "product-icons") {
      return Promise.reject(
        new SfLogosError(
          "InvalidInput",
          "find_brand_logo does not serve 'product-icons'. Use find_product_icon instead.",
          { brand: input.brand },
        ),
      );
    }
    const brand = ctx.manifest.brands.find((b) => b.id === input.brand);
    if (!brand) {
      return Promise.reject(
        new SfLogosError(
          "UnknownBrand",
          `Unknown brand '${input.brand}'. Call list_brands for valid ids.`,
          { brand: input.brand },
        ),
      );
    }

    let logos = brand.logos.slice();
    if (input.background !== undefined) {
      logos = logos.filter((l) => l.background === input.background);
    }
    if (input.co_branded !== undefined) {
      logos = logos.filter((l) => l.co_branded === input.co_branded);
    }
    if (input.variant !== undefined) {
      const needle = input.variant.toLowerCase();
      logos = logos.filter((l) => l.variant.toLowerCase().includes(needle));
    }
    if (input.preferred_only === true) {
      logos = logos.filter((l) => l.preferred);
    }

    const bg = input.background;
    logos.sort((a, b) => {
      if (a.preferred !== b.preferred) return a.preferred ? -1 : 1;
      if (bg) {
        const aMatch = a.background === bg ? 0 : 1;
        const bMatch = b.background === bg ? 0 : 1;
        if (aMatch !== bMatch) return aMatch - bMatch;
      }
      return a.name.localeCompare(b.name);
    });

    const advisorySet = new Set<AdvisoryCode>();
    // Suppress when co_branded:true was the caller's explicit ask — the "only co-brands"
    // result is the answer, not an unexpected constraint worth flagging.
    if (
      input.background !== undefined &&
      input.co_branded !== true &&
      logos.length > 0 &&
      logos.every((l) => l.co_branded)
    ) {
      advisorySet.add("only_co_branded_for_requested_background");
    }

    if (input.background === "dark") {
      const darkStandalone = brand.logos.some((l) => l.background === "dark" && !l.co_branded);
      const lightStandalone = brand.logos.some((l) => l.background === "light" && !l.co_branded);
      if (!darkStandalone && lightStandalone) {
        advisorySet.add("only_light_surface_standalone_available");
      }
    }

    const filterSupplied =
      input.background !== undefined ||
      input.co_branded !== undefined ||
      input.variant !== undefined ||
      input.preferred_only === true;
    // Only fire if the brand has logos pre-filter — zero pre-filter means a
    // data gap (no assets exist), not a filter-too-narrow situation.
    if (filterSupplied && logos.length === 0 && brand.logos.length > 0) {
      advisorySet.add("empty_result_filter_too_narrow");
    }

    for (const code of advisorySet) {
      ctx.logger.emit(ev.advisoryEmitted({ tool: "find_brand_logo", code }));
    }
    const advisories = sortAdvisories(advisorySet);
    return Promise.resolve({
      logos: logos.map((l) => toAssetSummary(l, brand)),
      ...(advisories.length > 0 ? { advisories } : {}),
    });
  },
});
