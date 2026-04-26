/**
 * tools/get-color-roles — Semantic UI-role palette.
 *
 * Responsibility: expose the curated role-tagged subset of the full
 * 156-swatch palette — swatches tagged with roles like 'primary',
 * 'hover', 'error', 'focus-ring'. Used to style functional UI, NOT
 * to recolor logos.
 * Errors: none (unknown role names return an empty array).
 * Dependencies: manifest/types.ts, tools/registry.ts.
 *
 * See spec §2 (get_color_roles).
 */

import type { ColorEntry } from "../manifest/types.js";
import { defineTool } from "./registry.js";

interface Input {
  roles?: string[];
}
interface Output {
  roles: ColorEntry[];
}

const DESCRIPTION = [
  "Return the semantic UI-role palette: hex swatches tagged with roles like",
  "'primary', 'hover', 'error', 'focus-ring', 'brand'. Provide a `roles` array",
  "to filter to swatches that include any of those role names (union). Omit",
  "`roles` to get every curated swatch (22 in the curated set — the full 156-swatch",
  "palette is not exposed here). This is for functional UI only — it is NOT a",
  "substitute for get_brand_colors when styling a logo's neighborhood.",
  "Unknown role names return an empty list, not an error.",
].join(" ");

export const getColorRolesTool = defineTool<Input, Output>({
  name: "get_color_roles",
  description: DESCRIPTION,
  inputSchema: {
    type: "object",
    properties: {
      roles: {
        type: "array",
        items: { type: "string" },
        description:
          "Optional list of role names (e.g. ['primary', 'hover']). Union-matched.",
      },
    },
    additionalProperties: false,
    description: "Fetch the semantic UI-role palette, optionally filtered by role name.",
  },
  handler: (input, ctx) => {
    const all: ColorEntry[] = Object.values(ctx.manifest.colorRoles.roles).flat();
    if (!input.roles || input.roles.length === 0) return Promise.resolve({ roles: all });
    const wanted = new Set(input.roles);
    return Promise.resolve({
      roles: all.filter((e) => e.roles.some((r) => wanted.has(r))),
    });
  },
});
