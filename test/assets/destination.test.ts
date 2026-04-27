import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  mkdtempSync,
  rmSync,
  existsSync,
  writeFileSync,
  readFileSync,
  chmodSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { copyToDestination } from "../../src/assets/destination.js";
import { SfLogosError } from "../../src/errors.js";

let workDir: string;
let sourcePath: string;
const SOURCE_CONTENT = "bytes-for-destination-test";

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "sf-logos-dest-"));
  sourcePath = join(workDir, "source.dat");
  writeFileSync(sourcePath, SOURCE_CONTENT);
});

afterEach(() => {
  // Ensure workDir is writable before cleanup (scenario 7 chmods to read-only).
  try {
    chmodSync(workDir, 0o755);
  } catch {
    // ignore — if workDir already cleaned or chmod fails, rmSync handles it.
  }
  rmSync(workDir, { recursive: true, force: true });
});

describe("copyToDestination", () => {
  it("copies source to destination and makes destination byte-identical", () => {
    const dest = join(workDir, "dest.dat");
    copyToDestination({ source: sourcePath, destination: dest });
    expect(existsSync(dest)).toBe(true);
    expect(readFileSync(dest, "utf8")).toBe(SOURCE_CONTENT);
  });

  it("writes atomically — no .tmp file remains after success", () => {
    const dest = join(workDir, "dest.dat");
    copyToDestination({ source: sourcePath, destination: dest });
    expect(existsSync(`${dest}.tmp`)).toBe(false);
  });

  it("raises DestinationExists when destination already exists", () => {
    const dest = join(workDir, "dest.dat");
    writeFileSync(dest, "pre-existing");
    try {
      copyToDestination({ source: sourcePath, destination: dest });
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(SfLogosError);
      expect((err as SfLogosError).code).toBe("DestinationExists");
    }
    expect(readFileSync(dest, "utf8")).toBe("pre-existing");
    expect(readFileSync(sourcePath, "utf8")).toBe(SOURCE_CONTENT);
  });

  it("rejects non-absolute destination with InvalidInput", () => {
    try {
      copyToDestination({ source: sourcePath, destination: "relative/path.dat" });
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(SfLogosError);
      expect((err as SfLogosError).code).toBe("InvalidInput");
    }
  });

  it("rejects destination containing a null byte with InvalidInput", () => {
    try {
      copyToDestination({
        source: sourcePath,
        destination: join(workDir, "bad\0name.dat"),
      });
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(SfLogosError);
      expect((err as SfLogosError).code).toBe("InvalidInput");
    }
  });

  it("relays OS error as FetchFailed when destination parent directory missing", () => {
    const dest = join(workDir, "nonexistent-subdir", "dest.dat");
    try {
      copyToDestination({ source: sourcePath, destination: dest });
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(SfLogosError);
      const e = err as SfLogosError;
      expect(e.code).toBe("FetchFailed");
      expect(e.details?.["reason"]).toBe("destination_write_failed");
    }
  });

  it("relays OS error as FetchFailed when destination parent is read-only", () => {
    chmodSync(workDir, 0o555);
    const dest = join(workDir, "dest.dat");
    try {
      copyToDestination({ source: sourcePath, destination: dest });
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(SfLogosError);
      const e = err as SfLogosError;
      expect(e.code).toBe("FetchFailed");
      expect(e.details?.["reason"]).toBe("destination_write_failed");
    }
  });
});
