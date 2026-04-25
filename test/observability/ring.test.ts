import { describe, it, expect } from "bun:test";
import { createRing } from "../../src/observability/ring.js";

describe("Event ring", () => {
  it("evicts oldest entries beyond capacity, preserves order", () => {
    const r = createRing<number>(3);
    r.push(1);
    r.push(2);
    r.push(3);
    r.push(4);
    expect(r.snapshot()).toEqual([2, 3, 4]);
  });

  it("snapshot is a copy; mutating it does not affect the ring", () => {
    const r = createRing<string>(2);
    r.push("a");
    r.push("b");
    const snap = r.snapshot();
    snap.push("c");
    expect(r.snapshot()).toEqual(["a", "b"]);
  });

  it("resize grows capacity without dropping entries", () => {
    const r = createRing<number>(2);
    r.push(1);
    r.push(2);
    r.resize(5);
    r.push(3);
    expect(r.snapshot()).toEqual([1, 2, 3]);
  });
});
