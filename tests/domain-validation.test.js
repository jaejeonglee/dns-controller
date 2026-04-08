import { describe, it, expect } from "vitest";

// domain.js doesn't export these functions, so we replicate them here
// to test the validation logic. These should be kept in sync with routes/domain.js.

const SUBDOMAIN_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const IPV4_REGEX =
  /^(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)){3}$/;
const HOSTNAME_REGEX =
  /^(?=.{1,253}$)(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z0-9-]{2,63}\.?$/i;

const isValidSubdomain = (name) => SUBDOMAIN_REGEX.test(name);

function validateRecordValue(recordType, value, { subdomain, domain }) {
  const trimmed = (value || "").trim();
  if (!trimmed) {
    return { valid: false, message: "Record value is required." };
  }

  if (recordType === "A") {
    if (!IPV4_REGEX.test(trimmed)) {
      return {
        valid: false,
        message: "Provide a valid IPv4 address (e.g. 203.0.113.10).",
      };
    }
    return { valid: true, value: trimmed };
  }

  const candidate = trimmed.toLowerCase();
  if (!HOSTNAME_REGEX.test(candidate)) {
    return {
      valid: false,
      message: "Provide a valid hostname (e.g. app.example.com).",
    };
  }

  const fullDomain = `${subdomain}.${domain}`.toLowerCase();
  if (candidate.replace(/\.$/, "") === fullDomain.replace(/\.$/, "")) {
    return {
      valid: false,
      message: "CNAME target cannot point to itself.",
    };
  }

  return { valid: true, value: candidate.replace(/\.$/, "") };
}

describe("isValidSubdomain", () => {
  it("should accept valid subdomains", () => {
    expect(isValidSubdomain("hello")).toBe(true);
    expect(isValidSubdomain("my-app")).toBe(true);
    expect(isValidSubdomain("a")).toBe(true);
    expect(isValidSubdomain("test123")).toBe(true);
    expect(isValidSubdomain("123")).toBe(true);
    expect(isValidSubdomain("a-b-c")).toBe(true);
  });

  it("should reject subdomains starting with hyphen", () => {
    expect(isValidSubdomain("-hello")).toBe(false);
  });

  it("should reject subdomains ending with hyphen", () => {
    expect(isValidSubdomain("hello-")).toBe(false);
  });

  it("should reject uppercase characters", () => {
    expect(isValidSubdomain("Hello")).toBe(false);
    expect(isValidSubdomain("HELLO")).toBe(false);
  });

  it("should reject special characters", () => {
    expect(isValidSubdomain("hello.world")).toBe(false);
    expect(isValidSubdomain("hello_world")).toBe(false);
    expect(isValidSubdomain("hello world")).toBe(false);
    expect(isValidSubdomain("hello!")).toBe(false);
  });

  it("should reject empty string", () => {
    expect(isValidSubdomain("")).toBe(false);
  });

  it("should reject subdomains longer than 63 characters", () => {
    expect(isValidSubdomain("a".repeat(63))).toBe(true);
    expect(isValidSubdomain("a".repeat(64))).toBe(false);
  });
});

describe("validateRecordValue", () => {
  const ctx = { subdomain: "test", domain: "example.com" };

  describe("A records", () => {
    it("should accept valid IPv4 addresses", () => {
      expect(validateRecordValue("A", "1.2.3.4", ctx)).toEqual({
        valid: true,
        value: "1.2.3.4",
      });
      expect(validateRecordValue("A", "203.0.113.10", ctx)).toEqual({
        valid: true,
        value: "203.0.113.10",
      });
      expect(validateRecordValue("A", "255.255.255.255", ctx)).toEqual({
        valid: true,
        value: "255.255.255.255",
      });
      expect(validateRecordValue("A", "0.0.0.0", ctx)).toEqual({
        valid: true,
        value: "0.0.0.0",
      });
    });

    it("should reject invalid IPv4 addresses", () => {
      expect(validateRecordValue("A", "256.1.1.1", ctx).valid).toBe(false);
      expect(validateRecordValue("A", "1.2.3", ctx).valid).toBe(false);
      expect(validateRecordValue("A", "1.2.3.4.5", ctx).valid).toBe(false);
      expect(validateRecordValue("A", "abc", ctx).valid).toBe(false);
      expect(validateRecordValue("A", "::1", ctx).valid).toBe(false);
    });

    it("should reject empty value", () => {
      expect(validateRecordValue("A", "", ctx).valid).toBe(false);
      expect(validateRecordValue("A", "  ", ctx).valid).toBe(false);
      expect(validateRecordValue("A", null, ctx).valid).toBe(false);
    });
  });

  describe("CNAME records", () => {
    it("should accept valid hostnames", () => {
      const result = validateRecordValue("CNAME", "app.example.com", ctx);
      expect(result.valid).toBe(true);
      expect(result.value).toBe("app.example.com");
    });

    it("should strip trailing dot", () => {
      const result = validateRecordValue("CNAME", "app.example.com.", ctx);
      expect(result.valid).toBe(true);
      expect(result.value).toBe("app.example.com");
    });

    it("should reject self-referencing CNAME", () => {
      const result = validateRecordValue("CNAME", "test.example.com", ctx);
      expect(result.valid).toBe(false);
      expect(result.message).toContain("cannot point to itself");
    });

    it("should reject self-referencing CNAME with trailing dot", () => {
      const result = validateRecordValue("CNAME", "test.example.com.", ctx);
      expect(result.valid).toBe(false);
    });

    it("should reject invalid hostnames", () => {
      expect(validateRecordValue("CNAME", "not a hostname", ctx).valid).toBe(
        false
      );
      expect(validateRecordValue("CNAME", "1.2.3.4", ctx).valid).toBe(false);
    });
  });
});
