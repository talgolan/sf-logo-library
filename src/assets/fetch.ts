/**
 * assets/fetch — HTTP GET for asset bytes.
 *
 * Responsibility: issue one GET with a timeout and a User-Agent, return
 * status + bytes + elapsed time on 200. Raise SfLogosError("FetchFailed")
 * on anything else. Injected `fetch` function so tests don't touch the
 * network.
 * Errors: FetchFailed.
 * Dependencies: errors.ts.
 *
 * See spec §4.3.
 */

import { SfLogosError } from "../errors.js";

export interface FetchAssetOptions {
  url: string;
  userAgent: string;
  timeoutMs: number;
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
}

export interface FetchAssetResult {
  status: number;
  bytes: Uint8Array;
  duration_ms: number;
}

export async function fetchAsset(opts: FetchAssetOptions): Promise<FetchAssetResult> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, opts.timeoutMs);
  try {
    const resp = await opts.fetch(opts.url, {
      headers: { "User-Agent": opts.userAgent },
      signal: controller.signal,
    });
    if (!resp.ok) {
      throw new SfLogosError("FetchFailed", `non-200 from ${opts.url}`, {
        url: opts.url,
        status: resp.status,
        reason: `http_${String(resp.status)}`,
      });
    }
    const buf = new Uint8Array(await resp.arrayBuffer());
    return { status: resp.status, bytes: buf, duration_ms: Date.now() - started };
  } catch (err) {
    if (err instanceof SfLogosError) throw err;
    const aborted =
      (err instanceof Error && err.name === "AbortError") || controller.signal.aborted;
    const reason = aborted ? "timeout" : "network_error";
    throw new SfLogosError("FetchFailed", `fetch failed for ${opts.url}`, {
      url: opts.url,
      reason,
      cause: err instanceof Error ? err.message : String(err),
    });
  } finally {
    clearTimeout(timer);
  }
}
