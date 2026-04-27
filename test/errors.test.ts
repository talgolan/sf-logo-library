import { describe, it, expect } from "bun:test";
import { SfLogosError, type SfLogosErrorCode } from "../src/errors.js";

describe("SfLogosError", () => {
  it("carries code, message, and details", () => {
    const err = new SfLogosError("AssetNotFound", "no such asset", { id: "x" });
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe("AssetNotFound");
    expect(err.message).toBe("no such asset");
    expect(err.details).toEqual({ id: "x" });
    expect(err.name).toBe("SfLogosError");
  });

  it("details is optional", () => {
    const err = new SfLogosError("InvalidInput", "bad");
    expect(err.details).toBeUndefined();
  });

  it("error-code union has expected members (compile-time check via runtime roundtrip)", () => {
    const codes: SfLogosErrorCode[] = [
      "AssetNotFound",
      "InvalidAssetUrl",
      "FormatUnavailable",
      "UnknownBrand",
      "InvalidInput",
      "FetchFailed",
      "DestinationExists",
    ];
    expect(codes).toHaveLength(7);
  });
});
