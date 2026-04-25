/**
 * tools/get-brand-colors — Return a brand's palette.
 *
 * Responsibility: flat key/hex map for the specified brand, suitable
 * for styling surrounding UI (captions, backgrounds, dividers) —
 * never for recoloring the logo itself.
 * Errors: UnknownBrand when brand_id is not in list_brands.
 * Dependencies: manifest/types.ts, errors.ts, tools/registry.ts.
 *
 * See spec §2 (get_brand_colors).
 */

import { SfLogosError } from "../errors.js";
import type { BrandColorMap, BrandId } from "../manifest/types.js";
import { defineTool } from "./registry.js";

interface Input {
  brand_id: BrandId;
}
interface Output {
  brand_id: BrandId;
  brand_name: string;
  colors: BrandColorMap;
}

const DESCRIPTION = [
  "Return the brand palette for a given brand_id as a flat key/hex map.",
  "Use these colors to style the neighborhood of a logo — backgrounds, captions,",
  "dividers — NOT to recolor the logo itself (which is a brand violation).",
  "For semantic UI roles (primary, hover, error) use get_color_roles instead.",
  "Raises UnknownBrand when brand_id is not one of the ids from list_brands.",
].join(" ");

export const getBrandColorsTool = defineTool<Input, Output>({
  name: "get_brand_colors",
  description: DESCRIPTION,
  inputSchema: {
    type: "object",
    properties: {
      brand_id: {
        type: "string",
        description:
          "One of the ids returned by list_brands (e.g. 'salesforce', 'product-icons').",
      },
    },
    required: ["brand_id"],
    additionalProperties: false,
    description: "Look up a brand's color palette by id.",
  },
  handler: (input, ctx) => {
    const brand = ctx.manifest.brands.find((b) => b.id === input.brand_id);
    if (!brand) {
      return Promise.reject(
        new SfLogosError(
          "UnknownBrand",
          `Unknown brand '${input.brand_id}'. Call list_brands to see valid ids.`,
          { brand_id: input.brand_id },
        ),
      );
    }
    return Promise.resolve({
      brand_id: brand.id,
      brand_name: brand.name,
      colors: { ...brand.brandColors },
    });
  },
});
