import { describe, it, expect } from "bun:test";
import { loadManifest } from "../../src/manifest/loader.js";
import { createLogger } from "../../src/observability/logger.js";

const bundledMin = {
  title: "t",
  description: "d",
  lastUpdated: "2026-03-13",
  brands: [{ id: "salesforce", name: "Salesforce", brandColors: {}, logos: [] }],
  colorRoles: { _description: "", roles: {} },
};

function mkLogger() {
  const lines: string[] = [];
  return { logger: createLogger({ level: "info", format: "human", stderr: (l) => lines.push(l) }), lines };
}

describe("loadManifest", () => {
  it("uses live manifest on success", async () => {
    const live = { ...bundledMin, lastUpdated: "2026-04-01" };
    const fetchFn = () => Promise.resolve(new Response(JSON.stringify(live), { status: 200 }));
    const { logger } = mkLogger();
    const result = await loadManifest({ fetch: fetchFn, logger, timeoutMs: 500 });
    expect(result.source).toBe("live");
    expect(result.manifest.lastUpdated).toBe("2026-04-01");
  });

  it("falls back to bundled on timeout", async () => {
    const fetchFn = (_: string, opts?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        opts?.signal?.addEventListener("abort", () => { reject(new Error("aborted")); });
      });
    const { logger } = mkLogger();
    const result = await loadManifest({ fetch: fetchFn, logger, timeoutMs: 20 });
    expect(result.source).toBe("bundled");
  });

  it("falls back to bundled on non-200", async () => {
    const fetchFn = () => Promise.resolve(new Response("nope", { status: 500 }));
    const { logger } = mkLogger();
    const result = await loadManifest({ fetch: fetchFn, logger, timeoutMs: 500 });
    expect(result.source).toBe("bundled");
  });

  it("falls back to bundled on invalid JSON", async () => {
    const fetchFn = () => Promise.resolve(new Response("not-json", { status: 200 }));
    const { logger } = mkLogger();
    const result = await loadManifest({ fetch: fetchFn, logger, timeoutMs: 500 });
    expect(result.source).toBe("bundled");
  });

  it("falls back on schema mismatch (missing brands[])", async () => {
    const fetchFn = () => Promise.resolve(new Response(JSON.stringify({ title: "x" }), { status: 200 }));
    const { logger } = mkLogger();
    const result = await loadManifest({ fetch: fetchFn, logger, timeoutMs: 500 });
    expect(result.source).toBe("bundled");
  });
});
