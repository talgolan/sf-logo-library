/**
 * observability/req-id — Short request identifiers for log correlation.
 *
 * Responsibility: mint a 4-byte hex id at the top of every tool dispatch
 * so every downstream log line can be grepped together.
 * Dependencies: node:crypto (Web Crypto getRandomValues via crypto.getRandomValues).
 *
 * See spec §5.3.5.
 */

import { randomBytes } from "node:crypto";

/** 8-character lowercase hex (4 bytes of randomness). */
export function newReqId(): string {
  return randomBytes(4).toString("hex");
}
