import { describe, it, expect } from "bun:test";
import { defineTool, type ToolContext } from "../../src/tools/registry.js";

describe("defineTool", () => {
  it("returns the object verbatim (sanity) and preserves generics", async () => {
    const tool = defineTool<{ n: number }, { n2: number }>({
      name: "square",
      description: "squares a number",
      inputSchema: { type: "object", properties: { n: { type: "number" } }, required: ["n"] },
      handler: (input, _ctx) => Promise.resolve({ n2: input.n * input.n }),
    });
    expect(tool.name).toBe("square");
    const ctx: ToolContext = {
      manifest: { brands: [] } as never,
      logger: {
        emit: () => {},
        ringSnapshot: () => [],
        resizeRing: () => {},
        setLevel: () => {},
        flush: () => Promise.resolve(),
        close: () => Promise.resolve(),
      },
      reqId: "r",
      counters: {
        toolCall: () => {},
        toolError: () => {},
        cacheHit: () => {},
        cacheMiss: () => {},
        cacheWrite: () => {},
        assetFetch: () => {},
        assetFetchFailed: () => {},
        manifestRefresh: () => {},
        snapshot: () => ({
          tool_calls: {},
          errors_by_code: {},
          cache: { hits: 0, misses: 0, bytes_written: 0 },
          asset_fetches: { total: 0, failures: 0 },
          manifest_refreshes: {},
        }),
      },
    };
    expect(await tool.handler({ n: 3 }, ctx)).toEqual({ n2: 9 });
  });
});
