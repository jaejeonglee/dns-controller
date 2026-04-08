import { describe, it, expect } from "vitest";
import { normalizeRecordType } from "../services/bind.js";

// escapeRegex and formatRecordValue are not exported, so we test them indirectly
// through the exported functions. We can still test normalizeRecordType directly.

describe("normalizeRecordType", () => {
  it("should return A for 'a' (case-insensitive)", () => {
    expect(normalizeRecordType("a")).toBe("A");
  });

  it("should return A for 'A'", () => {
    expect(normalizeRecordType("A")).toBe("A");
  });

  it("should return CNAME for 'cname' (case-insensitive)", () => {
    expect(normalizeRecordType("cname")).toBe("CNAME");
  });

  it("should return CNAME for 'CNAME'", () => {
    expect(normalizeRecordType("CNAME")).toBe("CNAME");
  });

  it("should default to A when no argument", () => {
    expect(normalizeRecordType()).toBe("A");
  });

  it("should trim whitespace", () => {
    expect(normalizeRecordType("  A  ")).toBe("A");
  });

  it("should throw for unsupported record type", () => {
    expect(() => normalizeRecordType("MX")).toThrow("Unsupported record type");
    expect(() => normalizeRecordType("TXT")).toThrow("Unsupported record type");
    expect(() => normalizeRecordType("AAAA")).toThrow(
      "Unsupported record type"
    );
    expect(() => normalizeRecordType("")).toThrow("Unsupported record type");
  });
});
