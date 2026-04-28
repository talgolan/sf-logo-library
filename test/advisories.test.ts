import { describe, it, expect } from "bun:test";
import { ALL_ADVISORY_CODES, sortAdvisories, type AdvisoryCode } from "../src/advisories.js";

describe("advisories — catalog", () => {
  it("ALL_ADVISORY_CODES contains exactly 4 members, alphabetically sorted", () => {
    expect(ALL_ADVISORY_CODES).toHaveLength(4);
    const sorted = [...ALL_ADVISORY_CODES].sort();
    expect(ALL_ADVISORY_CODES).toEqual(sorted);
    expect(ALL_ADVISORY_CODES).toEqual([
      "empty_result_filter_too_narrow",
      "only_co_branded_for_requested_background",
      "only_light_surface_standalone_available",
      "query_matched_no_scored_results",
    ]);
  });

  it("sortAdvisories produces alphabetical ordering for a multi-element set", () => {
    const set: Set<AdvisoryCode> = new Set([
      "query_matched_no_scored_results",
      "empty_result_filter_too_narrow",
      "only_co_branded_for_requested_background",
    ]);
    expect(sortAdvisories(set)).toEqual([
      "empty_result_filter_too_narrow",
      "only_co_branded_for_requested_background",
      "query_matched_no_scored_results",
    ]);
  });
});
