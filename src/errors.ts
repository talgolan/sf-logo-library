/**
 * errors — Canonical error type for the MCP server.
 *
 * Responsibility: expose SfLogosError and the typed code union. Every
 * handler throws this; the top-level dispatcher maps it onto the MCP
 * JSON-RPC error shape.
 * Dependencies: none.
 *
 * See spec §5.2 for the error taxonomy.
 */

export type SfLogosErrorCode =
  | "AssetNotFound"
  | "InvalidAssetUrl"
  | "FormatUnavailable"
  | "UnknownBrand"
  | "InvalidInput"
  | "FetchFailed"
  | "DestinationExists";

/**
 * Base error for all predictable failure modes.
 *
 * @param code - Machine-readable failure category.
 * @param message - Human-readable message; safe to surface to the caller.
 * @param details - Optional structured context (ids, available formats, etc.).
 */
export class SfLogosError extends Error {
  public readonly code: SfLogosErrorCode;
  public readonly details: Record<string, unknown> | undefined;

  constructor(
    code: SfLogosErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "SfLogosError";
    this.code = code;
    this.details = details;
  }
}
