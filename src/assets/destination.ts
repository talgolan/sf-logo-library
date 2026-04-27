/**
 * assets/destination — Atomic copy from cache to caller-specified path.
 *
 * Responsibility: validate the destination path, reject if it already
 * exists, write via `<dest>.tmp` in the same directory + rename for
 * atomicity. Propagate OS errors as FetchFailed with reason tag.
 * Errors: InvalidInput (bad path shape), DestinationExists, FetchFailed.
 * Dependencies: errors.ts, node:fs, node:path.
 *
 * See docs/superpowers/specs/2026-04-27-phase-3a-destination-path.md.
 */

import { copyFileSync, existsSync, renameSync } from "node:fs";
import { isAbsolute } from "node:path";
import { SfLogosError } from "../errors.js";

export interface CopyToDestinationOptions {
  /** The cache path returned by AssetCache.getPath(). Must exist. */
  source: string;
  /** Caller-specified destination. Must be absolute, no null bytes. */
  destination: string;
}

export function copyToDestination(opts: CopyToDestinationOptions): void {
  validateDestinationPath(opts.destination);
  if (existsSync(opts.destination)) {
    throw new SfLogosError(
      "DestinationExists",
      `Destination already exists: ${opts.destination}`,
      { destination_path: opts.destination },
    );
  }
  const tmp = `${opts.destination}.tmp`;
  try {
    copyFileSync(opts.source, tmp);
    renameSync(tmp, opts.destination);
  } catch (err) {
    throw new SfLogosError(
      "FetchFailed",
      `Failed to write to ${opts.destination}: ${err instanceof Error ? err.message : String(err)}`,
      {
        destination_path: opts.destination,
        reason: "destination_write_failed",
        cause: err instanceof Error ? err.message : String(err),
      },
    );
  }
}

function validateDestinationPath(p: string): void {
  if (!isAbsolute(p)) {
    throw new SfLogosError(
      "InvalidInput",
      `destination_path must be absolute, got: ${p}`,
      { destination_path: p },
    );
  }
  if (p.includes("\0")) {
    throw new SfLogosError("InvalidInput", "destination_path contains a null byte", {});
  }
}
