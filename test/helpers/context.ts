import type { AssetCache } from "../../src/assets/cache.js";
import type { Manifest } from "../../src/manifest/types.js";
import type { ToolContext } from "../../src/tools/registry.js";
import { createCounters } from "../../src/observability/counters.js";
import { createLogger } from "../../src/observability/logger.js";

export function makeTestContext(
  manifest: Manifest,
  overrides: { reqId?: string; cache?: AssetCache } = {},
): ToolContext {
  const { reqId, cache } = overrides;
  return {
    manifest,
    logger: createLogger({ level: "error", format: "human", stderr: () => undefined }),
    reqId: reqId ?? "test0001",
    counters: createCounters(),
    ...(cache !== undefined ? { cache } : {}),
  };
}
