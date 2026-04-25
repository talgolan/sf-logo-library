/**
 * observability/counters — In-process monotonic counters.
 *
 * Responsibility: keep lightweight call/error/cache stats that the
 * diagnostics tool surfaces. No external metrics, no network egress
 * (consistent with the "no telemetry" non-goal in spec §5.3.9).
 * Dependencies: none.
 *
 * See spec §5.3.9.
 */

/** Counter snapshot returned to the diagnostics tool. */
export interface CountersSnapshot {
  tool_calls: Record<string, number>;
  errors_by_code: Record<string, number>;
  cache: { hits: number; misses: number; bytes_written: number };
  asset_fetches: { total: number; failures: number };
  manifest_refreshes: Record<string, number>;
}

/** Public surface of the counters subsystem. */
export interface Counters {
  toolCall(tool: string): void;
  toolError(tool: string, code: string): void;
  cacheHit(): void;
  cacheMiss(): void;
  cacheWrite(bytes: number): void;
  assetFetch(): void;
  assetFetchFailed(): void;
  manifestRefresh(source: "live" | "bundled"): void;
  snapshot(): CountersSnapshot;
}

export function createCounters(): Counters {
  const toolCalls: Record<string, number> = {};
  const errorsByCode: Record<string, number> = {};
  const cache = { hits: 0, misses: 0, bytes_written: 0 };
  const assetFetches = { total: 0, failures: 0 };
  const manifestRefreshes: Record<string, number> = {};

  return {
    toolCall(tool) {
      toolCalls[tool] = (toolCalls[tool] ?? 0) + 1;
    },
    toolError(tool, code) {
      const key = `${tool}::${code}`;
      errorsByCode[key] = (errorsByCode[key] ?? 0) + 1;
    },
    cacheHit() {
      cache.hits += 1;
    },
    cacheMiss() {
      cache.misses += 1;
    },
    cacheWrite(bytes) {
      cache.bytes_written += bytes;
    },
    assetFetch() {
      assetFetches.total += 1;
    },
    assetFetchFailed() {
      assetFetches.failures += 1;
    },
    manifestRefresh(source) {
      manifestRefreshes[source] = (manifestRefreshes[source] ?? 0) + 1;
    },
    snapshot() {
      return {
        tool_calls: { ...toolCalls },
        errors_by_code: { ...errorsByCode },
        cache: { ...cache },
        asset_fetches: { ...assetFetches },
        manifest_refreshes: { ...manifestRefreshes },
      };
    },
  };
}
