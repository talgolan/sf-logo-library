/**
 * search/score — Weighted scoring for find_product_icon.
 *
 * Responsibility: given a logo entry and a set of query tokens, return
 * an integer score:
 *   3 per exact keyword match,
 *   2 per name substring match,
 *   1 per product_description or use_case substring match.
 * Ties are broken by alphabetical name at the caller.
 * Dependencies: search/tokenize.ts, manifest/types.ts.
 *
 * See spec §2 (find_product_icon scoring).
 */

import { matchesToken } from "./tokenize.js";
import type { ManifestLogo } from "../manifest/types.js";

const KEYWORD_WEIGHT = 3;
const NAME_WEIGHT = 2;
const DESCRIPTION_WEIGHT = 1;
const USE_CASE_WEIGHT = 1;

export function scoreLogo(logo: ManifestLogo, tokens: string[]): number {
  let score = 0;
  for (const token of tokens) {
    // Keyword band — count each token once against the keyword set.
    if (logo.keywords.some((kw) => matchesToken(kw, token))) {
      score += KEYWORD_WEIGHT;
    }
    // Name band.
    if (logo.name.toLowerCase().includes(token)) {
      score += NAME_WEIGHT;
    }
    // Description band.
    if (logo.product_description && logo.product_description.toLowerCase().includes(token)) {
      score += DESCRIPTION_WEIGHT;
    }
    // Use-case band — count each token once across all use-case strings.
    if ((logo.use_cases ?? []).some((uc) => uc.toLowerCase().includes(token))) {
      score += USE_CASE_WEIGHT;
    }
  }
  return score;
}
