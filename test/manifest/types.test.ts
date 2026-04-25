import { describe, it, expect } from "bun:test";
import bundled from "../../src/bundled/manifest.json" with { type: "json" };
import type { Manifest } from "../../src/manifest/types.js";

describe("Manifest types", () => {
  it("bundled snapshot satisfies the Manifest type at runtime", () => {
    const m = bundled as unknown as Manifest;
    expect(Array.isArray(m.brands)).toBe(true);
    expect(m.brands.length).toBe(6);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const first = m.brands[0]!;
    expect(typeof first.id).toBe("string");
    expect(typeof first.name).toBe("string");
    expect(Array.isArray(first.logos)).toBe(true);
  });
});
