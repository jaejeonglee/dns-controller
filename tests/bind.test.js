import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "module";
import { normalizeRecordType } from "../services/bind.js";

const require2 = createRequire(import.meta.url);

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

// ---------------------------------------------------------------------------
// bind.js tests that require mocking fs
// Since BIND_DEV_MODE=true in vitest env, isBindDevMode is captured as true.
// We can test dev-mode behavior directly from the static import, and for
// production-mode tests we patch the CJS module's internals via fs mock.
// ---------------------------------------------------------------------------

const ZONE_CONTENT = [
  "$TTL 3600",
  "@  IN  SOA  ns1.example.com. admin.example.com. (",
  "    2024010101  ; Serial",
  "    3600        ; Refresh",
  "    900         ; Retry",
  "    604800      ; Expire",
  "    86400 )     ; Minimum TTL",
  "@       IN  NS  ns1.example.com.",
  "www     IN  A   1.2.3.4",
  "blog    IN  CNAME  myblog.example.com.",
  "api     IN  A   5.6.7.8",
].join("\n");

describe("dev mode behavior (BIND_DEV_MODE=true)", () => {
  it("findDnsRecord returns false in dev mode", async () => {
    const result = await normalizeRecordType; // just to use the import
    const bind = require2("../services/bind.js");
    const res = await bind.findDnsRecord("www", "example.com", "A");
    expect(res).toBe(false);
  });

  it("readDnsRecord returns null in dev mode", async () => {
    const bind = require2("../services/bind.js");
    const res = await bind.readDnsRecord("www", "example.com", "A");
    expect(res).toBeNull();
  });

  it("listDnsRecords returns empty array in dev mode", async () => {
    const bind = require2("../services/bind.js");
    const res = await bind.listDnsRecords("example.com");
    expect(res).toEqual([]);
  });

  it("deleteDnsRecord returns result with type in dev mode", async () => {
    const bind = require2("../services/bind.js");
    const res = await bind.deleteDnsRecord("www", "example.com", "A");
    expect(res).toEqual({ name: "www.example.com", type: "A" });
  });
});

// ---------------------------------------------------------------------------
// Production mode tests: we need a fresh module with BIND_DEV_MODE=false.
// Since config is captured at load time, we must clear require.cache and
// reload with modified env.
// ---------------------------------------------------------------------------

describe("production mode (BIND_DEV_MODE=false)", () => {
  let bind;
  let fsMod;
  const savedEnv = {};

  beforeEach(() => {
    // Save and override env
    savedEnv.BIND_DEV_MODE = process.env.BIND_DEV_MODE;
    savedEnv.BIND_DB_PATH = process.env.BIND_DB_PATH;
    savedEnv.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    savedEnv.TELEGRAM_ALERT_CHAT_ID = process.env.TELEGRAM_ALERT_CHAT_ID;
    process.env.BIND_DEV_MODE = "false";
    process.env.BIND_DB_PATH = "/zones";
    process.env.TELEGRAM_BOT_TOKEN = "test-tok";
    process.env.TELEGRAM_ALERT_CHAT_ID = "123";

    // Clear require cache for configs and bind so they re-evaluate
    const configPath = require2.resolve("../configs/index.js");
    const bindPath = require2.resolve("../services/bind.js");
    const alertPath = require2.resolve("../services/alert.js");
    delete require2.cache[configPath];
    delete require2.cache[bindPath];
    delete require2.cache[alertPath];

    // Re-require
    bind = require2("../services/bind.js");
    fsMod = require2("fs");
  });

  afterEach(() => {
    // Restore env
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }

    // Clear cache again to not pollute other tests
    const configPath = require2.resolve("../configs/index.js");
    const bindPath = require2.resolve("../services/bind.js");
    const alertPath = require2.resolve("../services/alert.js");
    delete require2.cache[configPath];
    delete require2.cache[bindPath];
    delete require2.cache[alertPath];
  });

  describe("findDnsRecord fail-close", () => {
    it("throws 'Zone file not found' when ENOENT", async () => {
      const origReadFile = fsMod.promises.readFile;
      fsMod.promises.readFile = vi.fn().mockRejectedValue(
        Object.assign(new Error("ENOENT"), { code: "ENOENT" })
      );

      try {
        await expect(bind.findDnsRecord("www", "example.com", "A"))
          .rejects.toThrow("Zone file not found");
      } finally {
        fsMod.promises.readFile = origReadFile;
      }
    });
  });

  describe("deleteDnsRecord idempotent", () => {
    it("returns { alreadyAbsent: true } when record not in zone file", async () => {
      const origReadFile = fsMod.promises.readFile;
      fsMod.promises.readFile = vi.fn().mockResolvedValue(ZONE_CONTENT);

      try {
        const result = await bind.deleteDnsRecord("nonexistent", "example.com", "A");
        expect(result).toEqual({
          name: "nonexistent.example.com",
          type: "A",
          alreadyAbsent: true,
        });
      } finally {
        fsMod.promises.readFile = origReadFile;
      }
    });
  });

  describe("readDnsRecord", () => {
    it("returns { name, type, value } when record exists", async () => {
      const origReadFile = fsMod.promises.readFile;
      fsMod.promises.readFile = vi.fn().mockResolvedValue(ZONE_CONTENT);

      try {
        const result = await bind.readDnsRecord("www", "example.com", "A");
        expect(result).toEqual({ name: "www", type: "A", value: "1.2.3.4" });
      } finally {
        fsMod.promises.readFile = origReadFile;
      }
    });

    it("returns null when record does not exist", async () => {
      const origReadFile = fsMod.promises.readFile;
      fsMod.promises.readFile = vi.fn().mockResolvedValue(ZONE_CONTENT);

      try {
        const result = await bind.readDnsRecord("missing", "example.com", "A");
        expect(result).toBeNull();
      } finally {
        fsMod.promises.readFile = origReadFile;
      }
    });
  });

  describe("listDnsRecords", () => {
    it("parses multiple A and CNAME records from zone content", async () => {
      const origReadFile = fsMod.promises.readFile;
      fsMod.promises.readFile = vi.fn().mockResolvedValue(ZONE_CONTENT);

      try {
        const records = await bind.listDnsRecords("example.com");
        expect(records).toEqual([
          { name: "www", type: "A", value: "1.2.3.4" },
          { name: "blog", type: "CNAME", value: "myblog.example.com." },
          { name: "api", type: "A", value: "5.6.7.8" },
        ]);
      } finally {
        fsMod.promises.readFile = origReadFile;
      }
    });
  });
});
