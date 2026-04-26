/**
 * assets/cache — version-keyed on-disk cache for asset bytes.
 *
 * Responsibility: turn (asset_id, format, url) into a local filesystem
 * path. First hit fetches and writes; second hit returns the existing
 * path with no fetch. Concurrent calls for the same target dedupe. A
 * new manifest.lastUpdated starts a new directory, implicitly
 * invalidating stale versions without touching disk.
 * Errors: InvalidInput (bad id), FetchFailed (propagated from fetcher).
 * Dependencies: fetch.ts (or any compatible fetcher), node:fs, node:path.
 *
 * See spec §4.2.
 */

import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { SfLogosError } from "../errors.js";
import type { FetchAssetResult } from "./fetch.js";

export type CacheFetcher = (url: string) => Promise<FetchAssetResult>;

export interface AssetCacheOptions {
  root: string;
  manifestVersion: string;
  fetcher: CacheFetcher;
}

export interface AssetCache {
  getPath(assetId: string, format: "svg" | "png", url: string): Promise<string>;
  /** Exposed so callers can share a fetcher across multiple cache instances. */
  readonly fetcher: CacheFetcher;
}

// Asset ids are validated BEFORE path construction to block directory traversal.
// The manifest ships only lowercase-alphanumeric-and-dash ids. See spec §5.6.
const VALID_ID = /^[a-z0-9-]+$/;

export function createAssetCache(opts: AssetCacheOptions): AssetCache {
  const versionDir = join(resolve(opts.root), opts.manifestVersion);
  const inFlight = new Map<string, Promise<string>>();

  function pathFor(id: string, format: "svg" | "png"): string {
    return join(versionDir, `${id}.${format}`);
  }

  async function fetchAndWrite(
    id: string,
    format: "svg" | "png",
    url: string,
  ): Promise<string> {
    const target = pathFor(id, format);
    mkdirSync(dirname(target), { recursive: true });
    const result = await opts.fetcher(url);
    const tmp = `${target}.tmp`;
    writeFileSync(tmp, result.bytes);
    renameSync(tmp, target);
    return target;
  }

  return {
    fetcher: opts.fetcher,
    getPath(assetId, format, url) {
      if (!VALID_ID.test(assetId)) {
        return Promise.reject(
          new SfLogosError(
            "InvalidInput",
            `Invalid asset id '${assetId}' — ids must match /^[a-z0-9-]+$/.`,
            { asset_id: assetId },
          ),
        );
      }
      const target = pathFor(assetId, format);
      if (existsSync(target)) return Promise.resolve(target);

      const key = `${assetId}.${format}`;
      const pending = inFlight.get(key);
      if (pending !== undefined) return pending;

      const promise = fetchAndWrite(assetId, format, url).finally(() => {
        inFlight.delete(key);
      });
      inFlight.set(key, promise);
      return promise;
    },
  };
}
