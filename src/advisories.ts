/**
 * advisories — Catalog of machine-readable advisory codes emitted on
 * successful responses from find_* tools.
 *
 * Responsibility: single source of truth for the AdvisoryCode union,
 * the alphabetized list of all codes, and the sortAdvisories helper.
 * What this module does NOT own: which tools emit which codes (lives in
 * src/tools/*.ts), the trigger conditions (lives in docs/tools.md once
 * phase 3C lands and inline in the tool descriptions), nor the
 * observability event that records emissions (lives in
 * src/observability/events.ts).
 * Inputs: none (pure type + data module).
 * Outputs: the AdvisoryCode type and helpers.
 * Errors: none — advisories are informational, not failures.
 * Dependencies: none.
 *
 * See docs/superpowers/specs/2026-04-27-phase-3e-advisory-symmetry.md
 * for the authoritative per-code trigger rules.
 */

/** Every stable advisory code the server may emit on success responses. */
export type AdvisoryCode =
  | "empty_result_filter_too_narrow"
  | "only_co_branded_for_requested_background"
  | "only_light_surface_standalone_available"
  | "query_matched_no_scored_results";

/** Alphabetized list of every member of the AdvisoryCode union. */
export const ALL_ADVISORY_CODES: readonly AdvisoryCode[] = [
  "empty_result_filter_too_narrow",
  "only_co_branded_for_requested_background",
  "only_light_surface_standalone_available",
  "query_matched_no_scored_results",
];

// Exhaustiveness guard: fails to compile if a union member is missing from
// ALL_ADVISORY_CODES. Adding a new AdvisoryCode requires adding a key here;
// adding a key that is not in the union fails at the type annotation.
const _ALL_ADVISORY_CODES_EXHAUSTIVE: { readonly [K in AdvisoryCode]: true } = {
  empty_result_filter_too_narrow: true,
  only_co_branded_for_requested_background: true,
  only_light_surface_standalone_available: true,
  query_matched_no_scored_results: true,
};
void _ALL_ADVISORY_CODES_EXHAUSTIVE;

/**
 * Sort a set of advisory codes alphabetically.
 *
 * Handlers accumulate codes into a `Set<AdvisoryCode>` during dispatch,
 * then call this before attaching the list to the response. Deterministic
 * ordering keeps test expectations and client parsing simple.
 *
 * @param codes Set of advisory codes to emit on a response.
 * @returns The codes as an alphabetically sorted array (stable).
 * @example
 *   const set = new Set<AdvisoryCode>([...]);
 *   const advisories = sortAdvisories(set);
 */
export function sortAdvisories(codes: Set<AdvisoryCode>): AdvisoryCode[] {
  return Array.from(codes).sort();
}
