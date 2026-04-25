/**
 * tools/list-brands — Enumerate the brand groupings in the manifest.
 *
 * Responsibility: return one BrandSummary per brand with counts plus
 * the manifest version and disclaimer, so LLM callers can orient
 * themselves and pass the "unofficial resource" context through.
 * Errors: none.
 * Dependencies: manifest/types.ts, tools/registry.ts.
 *
 * Selection rules: none (pure enumeration).
 *
 * See spec §2 (list_brands).
 */

import type { BrandSummary } from "../manifest/types.js";
import { defineTool } from "./registry.js";

interface Output {
  brands: BrandSummary[];
  manifest_version: string;
  disclaimer: string;
}

const DESCRIPTION = [
  "Enumerate every brand grouping known to the server — five brand-logo families",
  "(Salesforce, MuleSoft, Slack, Tableau, Informatica) plus Salesforce 2D product icons.",
  "Returns each brand's id, human name, and asset count, along with the manifest version",
  "and the unofficial-resource disclaimer. Call this first when you don't know which brand",
  "or id to use. No inputs. Product icons are returned under brand_id 'product-icons' and",
  "MUST be searched via find_product_icon, not find_brand_logo.",
].join(" ");

export const listBrandsTool = defineTool<Record<string, never>, Output>({
  name: "list_brands",
  description: DESCRIPTION,
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false,
    description: "No inputs; returns the full brand list with counts.",
  },
  handler: (_input, ctx) => {
    const m = ctx.manifest;
    const disclaimer =
      ((m["_ai_instructions"] as { disclaimer?: string } | undefined)?.disclaimer) ??
      m.disclaimer ??
      "This library is an unofficial internal reference resource.";
    return Promise.resolve({
      brands: m.brands.map((b) => ({
        id: b.id,
        name: b.name,
        logo_count: b.logos.length,
      })),
      manifest_version: m.lastUpdated,
      disclaimer,
    });
  },
});
