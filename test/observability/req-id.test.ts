import { describe, it, expect } from "bun:test";
import { newReqId } from "../../src/observability/req-id.js";

describe("newReqId", () => {
  it("returns an 8-char lowercase hex string (4 bytes)", () => {
    const id = newReqId();
    expect(id).toMatch(/^[0-9a-f]{8}$/);
  });

  it("is unique across many calls (probabilistic sanity)", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) ids.add(newReqId());
    // 1000 draws from 2^32 — collision probability is negligible.
    expect(ids.size).toBe(1000);
  });
});
