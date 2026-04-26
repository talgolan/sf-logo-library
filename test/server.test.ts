import { describe, it, expect } from "bun:test";
import { buildServer } from "../src/server.js";
import bundled from "../src/bundled/manifest.json" with { type: "json" };
import type { Manifest } from "../src/manifest/types.js";
import { createLogger } from "../src/observability/logger.js";
import { createCounters } from "../src/observability/counters.js";

function deps() {
  return {
    manifest: bundled as unknown as Manifest,
    logger: createLogger({ level: "error", format: "human", stderr: () => undefined }),
    counters: createCounters(),
  };
}

describe("server dispatcher", () => {
  it("lists six tools (phase 2)", () => {
    const s = buildServer(deps());
    const names = s.listTools().map((t) => t.name);
    for (const name of [
      "list_brands",
      "find_brand_logo",
      "find_product_icon",
      "get_brand_colors",
      "get_color_roles",
      "fetch_asset",
    ]) {
      expect(names).toContain(name);
    }
    expect(names.length).toBe(6);
  });

  it("dispatches fetch_asset in URL mode without a cache", async () => {
    const s = buildServer(deps());
    const result = (await s.dispatch("fetch_asset", {
      id: "icon-agentforce",
      mode: "url",
    })) as { id: string; url: string };
    expect(result.url).toMatch(/^https:\/\/dam\.usefulto\.me\//);
  });

  it("dispatches list_brands and mints a req_id in the log", async () => {
    const lines: string[] = [];
    const deps2 = {
      ...deps(),
      logger: createLogger({ level: "info", format: "json", stderr: (l) => lines.push(l) }),
    };
    const s = buildServer(deps2);
    const result = await s.dispatch("list_brands", {});
    expect((result as { brands: unknown[] }).brands.length).toBe(6);
    const toolCallLine = lines.find((l) => l.includes('"event":"tool.call"'));
    expect(toolCallLine).toBeTruthy();
    expect(toolCallLine).toMatch(/"req_id":"[0-9a-f]{8}"/);
  });

  it("maps SfLogosError to a rejected promise", async () => {
    const s = buildServer(deps());
    await s
      .dispatch("get_brand_colors", { brand_id: "bogus" })
      .then(
        () => {
          throw new Error("expected rejection");
        },
        (err: unknown) => {
          expect((err as { code: string }).code).toBe("UnknownBrand");
        },
      );
  });

  it("wraps unexpected exceptions as InvalidInput internal error", async () => {
    const deps2 = deps();
    // sabotage: corrupt manifest so a tool throws an unexpected error
    const s = buildServer({ ...deps2, manifest: {} as Manifest });
    await s.dispatch("list_brands", {}).then(
      () => {
        throw new Error("expected rejection");
      },
      (err: unknown) => {
        expect((err as { code: string }).code).toBe("InvalidInput");
      },
    );
  });
});
