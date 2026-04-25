/**
 * search/tokenize — String tokenization for find_product_icon scoring.
 *
 * Responsibility: split user queries into lower-case tokens; test
 * whether a keyword matches a token via exact or word-boundary rules.
 * Dependencies: none.
 *
 * See spec §2 (find_product_icon scoring).
 */

/** Lowercase + whitespace-split. Punctuation stays inside tokens. */
export function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .split(/\s+/u)
    .filter((t) => t.length > 0);
}

/**
 * Does `keyword` match `token`?
 *
 * - Exact: keyword.toLowerCase() === token.
 * - Word-boundary substring: token appears in the keyword flanked by
 *   non-letter/digit characters (or string boundaries).
 */
export function matchesToken(keyword: string, token: string): boolean {
  const kw = keyword.toLowerCase();
  if (kw === token) return true;
  const pattern = new RegExp(
    `(?:^|[^a-z0-9])${escapeRegExp(token)}(?:[^a-z0-9]|$)`,
    "u",
  );
  return pattern.test(kw);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
