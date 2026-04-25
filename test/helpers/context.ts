import type { Manifest } from "../../src/manifest/types.js";
import type { ToolContext } from "../../src/tools/registry.js";
import { createCounters } from "../../src/observability/counters.js";
import { createLogger } from "../../src/observability/logger.js";

export function makeTestContext(manifest: Manifest, reqId = "test0001"): ToolContext {
  return {
    manifest,
    logger: createLogger({ level: "error", format: "human", stderr: () => undefined }),
    reqId,
    counters: createCounters(),
  };
}
