import { describe, it, expect } from "bun:test";
import { getColorRolesTool } from "../../src/tools/get-color-roles.js";
import bundled from "../../src/bundled/manifest.json" with { type: "json" };
import type { Manifest } from "../../src/manifest/types.js";
import { makeTestContext } from "../helpers/context.js";

describe("get_color_roles", () => {
  it("returns every role when no filter is provided", async () => {
    const ctx = makeTestContext(bundled as unknown as Manifest);
    const result = await getColorRolesTool.handler({}, ctx);
    expect(result.roles.length).toBeGreaterThan(0);
  });

  it("filters by a single role", async () => {
    const ctx = makeTestContext(bundled as unknown as Manifest);
    const result = await getColorRolesTool.handler({ roles: ["primary"] }, ctx);
    expect(result.roles.every((r) => r.roles.includes("primary"))).toBe(true);
  });

  it("filters by multiple roles (union)", async () => {
    const ctx = makeTestContext(bundled as unknown as Manifest);
    const result = await getColorRolesTool.handler({ roles: ["primary", "hover"] }, ctx);
    expect(result.roles.every((r) => r.roles.some((x) => ["primary", "hover"].includes(x)))).toBe(true);
  });

  it("returns empty array (not error) for unknown role", async () => {
    const ctx = makeTestContext(bundled as unknown as Manifest);
    const result = await getColorRolesTool.handler({ roles: ["nonexistent-xyz"] }, ctx);
    expect(result.roles).toEqual([]);
  });

  it("has a description >= 200 chars", () => {
    expect(getColorRolesTool.description.length).toBeGreaterThanOrEqual(200);
  });

  it("exposes caption-on-light → Neutral 60 (#939393)", async () => {
    const ctx = makeTestContext(bundled as unknown as Manifest);
    const result = await getColorRolesTool.handler({ roles: ["caption-on-light"] }, ctx);
    expect(result.roles).toHaveLength(1);
    expect(result.roles[0]?.hex).toBe("#939393");
    expect(result.roles[0]?.name).toBe("Neutral 60");
  });

  it("exposes caption-on-dark → Cloud Blue 80 (#90D0FE)", async () => {
    const ctx = makeTestContext(bundled as unknown as Manifest);
    const result = await getColorRolesTool.handler({ roles: ["caption-on-dark"] }, ctx);
    expect(result.roles).toHaveLength(1);
    expect(result.roles[0]?.hex).toBe("#90D0FE");
    expect(result.roles[0]?.name).toBe("Cloud Blue 80");
  });
});
