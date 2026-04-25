import { describe, it, expect, beforeEach } from "bun:test";
import { createCounters, type Counters } from "../../src/observability/counters.js";

describe("Counters", () => {
  let c: Counters;
  beforeEach(() => {
    c = createCounters();
  });

  it("increments labelled counters", () => {
    c.toolCall("list_brands");
    c.toolCall("list_brands");
    c.toolCall("find_product_icon");
    expect(c.snapshot().tool_calls).toEqual({
      list_brands: 2,
      find_product_icon: 1,
    });
  });

  it("increments error counters by tool+code", () => {
    c.toolError("fetch_asset", "FormatUnavailable");
    expect(c.snapshot().errors_by_code["fetch_asset::FormatUnavailable"]).toBe(1);
  });

  it("tracks cache hits/misses/bytes", () => {
    c.cacheHit();
    c.cacheMiss();
    c.cacheWrite(1024);
    expect(c.snapshot().cache).toEqual({ hits: 1, misses: 1, bytes_written: 1024 });
  });
});
