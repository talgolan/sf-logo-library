/**
 * observability/ring — Bounded in-memory event ring.
 *
 * Responsibility: capture the last N log events regardless of the
 * configured log level. Used by the diagnostics tool (spec §5.3.7) and
 * the SIGUSR2 snapshot handler.
 * Dependencies: none.
 */

export interface Ring<T> {
  push(value: T): void;
  snapshot(): T[];
  resize(newCapacity: number): void;
  capacity(): number;
  size(): number;
}

export function createRing<T>(initialCapacity: number): Ring<T> {
  if (initialCapacity < 1) {
    throw new Error("ring capacity must be >= 1");
  }
  // Simple append-and-trim buffer. O(1) amortized push for small N.
  let buf: T[] = [];
  let cap = initialCapacity;

  return {
    push(value) {
      buf.push(value);
      if (buf.length > cap) buf.splice(0, buf.length - cap);
    },
    snapshot() {
      return buf.slice();
    },
    resize(newCapacity) {
      if (newCapacity < 1) throw new Error("ring capacity must be >= 1");
      cap = newCapacity;
      if (buf.length > cap) buf = buf.slice(buf.length - cap);
    },
    capacity() {
      return cap;
    },
    size() {
      return buf.length;
    },
  };
}
