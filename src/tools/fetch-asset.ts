/**
 * tools/fetch-asset — resolve asset id (or url) to a URL / local path / bytes.
 *
 * Responsibility: turn a caller's intent ("I need the Agentforce icon as
 * a file on disk") into one of: a public URL, a local filesystem path
 * (from the on-disk cache), or base64 bytes. Enforces the input-exclusivity
 * rules and validates URLs at the boundary.
 *
 * Errors:
 *   - InvalidInput when neither or both of {id, url} are supplied.
 *   - InvalidAssetUrl when `url` is not under dam.usefulto.me (exact host).
 *   - AssetNotFound when `id` does not match any asset in the manifest.
 *   - FormatUnavailable when `format` is requested but absent (svg-only or png-only).
 *   - FetchFailed when a live fetch was required and it failed.
 *
 * Modes (spec §2, phase-2 revision):
 *   - url   — no I/O; return the resolvable URL.
 *   - path  — fetch via cache (default when `mode` is omitted); return filesystem path.
 *   - bytes — fetch via cache; return base64-encoded content.
 *
 * Default `format` is "png" (revised from phase-1 "svg"): primary
 * consumers — pptxgenjs, Google Slides API, python-pptx — want raster.
 *
 * See docs/superpowers/specs/2026-04-25-phase-2-scope-revision.md.
 */

import { SfLogosError } from "../errors.js";
import { toAssetSummary, ASSET_BASE_URL } from "../manifest/summary.js";
import type { AssetDetail, ManifestBrand, ManifestLogo } from "../manifest/types.js";
import { defineTool } from "./registry.js";

interface Input {
  id?: string;
  url?: string;
  format?: "svg" | "png";
  mode?: "url" | "path" | "bytes";
}

const DESCRIPTION = [
  "Resolve a Salesforce logo or product icon to a URL, a local filesystem path",
  "(from the on-disk cache), or inline base64 bytes. Provide EXACTLY ONE of",
  "`id` (from a prior find_*/list_brands call) or `url` (a dam.usefulto.me asset",
  "URL you already have). Optional `format` is 'png' (default) or 'svg'. Optional",
  "`mode` is 'path' (default — returns a filesystem path, fetching + caching on",
  "first access), 'url' (no I/O, just the public URL), or 'bytes' (base64).",
  "For PowerPoint/Google Slides/python-pptx consumers, the defaults (format=png,",
  "mode=path) are usually what you want. Use svg when you need scalable fidelity",
  "and the consumer supports it. Aspect_ratio (decimal) is returned with every",
  "response — derive dimensions yourself rather than asking the server to.",
].join(" ");

export const fetchAssetTool = defineTool<Input, AssetDetail>({
  name: "fetch_asset",
  description: DESCRIPTION,
  inputSchema: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description:
          "Asset id from a prior find_*/list_brands response (e.g. 'icon-agentforce').",
      },
      url: {
        type: "string",
        description:
          "A fully-qualified dam.usefulto.me asset URL (from a prior summary.formats.{svg,png}).",
      },
      format: {
        type: "string",
        enum: ["svg", "png"],
        description:
          "Output format. Defaults to 'png' — primary consumers are raster-based artifact builders.",
      },
      mode: {
        type: "string",
        enum: ["url", "path", "bytes"],
        description:
          "'path' (default) returns a filesystem path, fetching via cache. 'url' returns just the URL. 'bytes' returns base64.",
      },
    },
    additionalProperties: false,
    description:
      "Resolve an asset to a URL, local path, or inline bytes. Exactly one of id/url required.",
  },
  handler: async (input, ctx) => {
    const haveId = typeof input.id === "string";
    const haveUrl = typeof input.url === "string";
    if (!haveId && !haveUrl) {
      throw new SfLogosError(
        "InvalidInput",
        "fetch_asset requires exactly one of `id` or `url`.",
        {},
      );
    }
    if (haveId && haveUrl) {
      throw new SfLogosError("InvalidInput", "fetch_asset: supply `id` OR `url`, not both.", {});
    }

    // --- url input path: mode='url' only. path/bytes imply a non-id cache
    //     key the cache layout does not support; use id input for those. ---
    if (haveUrl) {
      const url = input.url as string;
      if (!url.startsWith(`${ASSET_BASE_URL}/`)) {
        throw new SfLogosError("InvalidAssetUrl", `url must be under ${ASSET_BASE_URL}/`, { url });
      }
      if ((input.mode ?? "url") !== "url") {
        throw new SfLogosError(
          "InvalidInput",
          "url input only supports mode='url'. Use id input for path/bytes modes.",
          {},
        );
      }
      return minimalDetailFromUrl(url, input.format ?? "png");
    }

    // --- id path: look up metadata and emit full AssetDetail. ---
    const id = input.id as string;
    const found = findAssetById(ctx.manifest.brands, id);
    if (!found) {
      throw new SfLogosError("AssetNotFound", `No asset with id '${id}'.`, { id });
    }
    const [logo, brand] = found;
    const summary = toAssetSummary(logo, brand);

    const format = chooseFormat(summary, input.format);
    if (format === null) {
      throw new SfLogosError(
        "FormatUnavailable",
        `Asset '${id}' does not have the requested format.`,
        {
          id,
          requested_format: input.format ?? null,
          available_formats: (["svg", "png"] as const).filter((f) => summary.formats[f] !== null),
        },
      );
    }

    const url = summary.formats[format];
    if (url === null) {
      throw new SfLogosError("FormatUnavailable", "format URL missing", { id });
    }

    const mode = input.mode ?? "path"; // phase-2 default (revised from phase-1 'url').

    if (mode === "url") {
      return { ...summary, format, url } satisfies AssetDetail;
    }

    if (ctx.cache === undefined) {
      throw new SfLogosError(
        "InvalidInput",
        `fetch_asset mode='${mode}' requires a configured asset cache.`,
        {},
      );
    }

    if (mode === "path") {
      const path = await ctx.cache.getPath(id, format, url);
      return { ...summary, format, url, path } satisfies AssetDetail;
    }

    // mode === "bytes" — narrowed by elimination.
    const path = await ctx.cache.getPath(id, format, url);
    const { readFileSync } = await import("node:fs");
    const bytes_base64 = readFileSync(path).toString("base64");
    return { ...summary, format, url, bytes_base64 } satisfies AssetDetail;
  },
});

function findAssetById(
  brands: readonly ManifestBrand[],
  id: string,
): readonly [ManifestLogo, ManifestBrand] | null {
  for (const brand of brands) {
    for (const logo of brand.logos) {
      if (logo.id === id) return [logo, brand];
    }
  }
  return null;
}

function chooseFormat(
  summary: { formats: { svg: string | null; png: string | null } },
  requested: "svg" | "png" | undefined,
): "svg" | "png" | null {
  if (requested !== undefined) {
    return summary.formats[requested] !== null ? requested : null;
  }
  if (summary.formats.png !== null) return "png";
  if (summary.formats.svg !== null) return "svg";
  return null;
}

/**
 * Shape returned when the caller supplied a raw URL and mode='url'. We have
 * no manifest entry to project, so non-URL AssetDetail fields are zero
 * values — the caller opted into raw URL mode and is on the hook for
 * interpreting them. All known fields (id=url, url, format) are accurate.
 */
function minimalDetailFromUrl(url: string, format: "svg" | "png"): AssetDetail {
  return {
    id: url,
    name: "",
    brand_id: "salesforce",
    type: "logo",
    variant: "",
    background: "light",
    preferred: false,
    co_branded: false,
    category: null,
    keywords: [],
    product_description: null,
    use_cases: [],
    usage: "",
    formats: { svg: format === "svg" ? url : null, png: format === "png" ? url : null },
    preferred_format: format,
    source_dimensions: { width: 0, height: 0, source: "png" },
    aspect_ratio: { decimal: 1, ratio: "1:1", is_square: true },
    svg_intrinsic: null,
    brand_colors_hint: {},
    format,
    url,
  };
}
