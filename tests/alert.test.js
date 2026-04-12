import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "module";

const require2 = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// alert.js reads config.telegram at call time, not module load.
// We patch the config object and global.fetch to test alert behavior.
// ---------------------------------------------------------------------------

describe("alertService", () => {
  let alertMod;
  let configMod;
  let mockFetch;
  let mockLogger;
  let origTelegram;

  beforeEach(() => {
    configMod = require2("../configs/index.js");
    alertMod = require2("../services/alert.js");

    // Save original telegram config
    origTelegram = { ...configMod.telegram };

    mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", mockFetch);

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
    };
    alertMod.setLogger(mockLogger);
  });

  afterEach(() => {
    // Restore telegram config
    configMod.telegram.botToken = origTelegram.botToken;
    configMod.telegram.alertChatId = origTelegram.alertChatId;
    vi.unstubAllGlobals();
  });

  describe("with token configured", () => {
    beforeEach(() => {
      configMod.telegram.botToken = "test-token";
      configMod.telegram.alertChatId = "12345";
    });

    it("critical() calls fetch with correct Telegram API URL and message format", async () => {
      await alertMod.critical("TEST_ERROR", { subdomain: "foo", domain: "bar.com" });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe("https://api.telegram.org/bottest-token/sendMessage");
      expect(opts.method).toBe("POST");

      const body = JSON.parse(opts.body);
      expect(body.chat_id).toBe("12345");
      expect(body.text).toContain("CRITICAL");
      expect(body.text).toContain("TEST_ERROR");
      expect(body.text).toContain("subdomain: foo");
    });

    it("warn() calls fetch with correct format", async () => {
      await alertMod.warn("SOMETHING_HAPPENED", { key: "val" });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe("https://api.telegram.org/bottest-token/sendMessage");

      const body = JSON.parse(opts.body);
      expect(body.text).toContain("WARNING");
      expect(body.text).toContain("SOMETHING_HAPPENED");
      expect(body.text).toContain("key: val");
    });

    it("when fetch fails, logger.fatal is called and no throw", async () => {
      mockFetch.mockRejectedValue(new Error("network down"));

      await alertMod.critical("FAIL_TEST", {});
      expect(mockLogger.fatal).toHaveBeenCalled();
      const fatalCall = mockLogger.fatal.mock.calls[0];
      expect(fatalCall[0].alertFailed).toBe(true);
    });
  });

  describe("with no token configured", () => {
    beforeEach(() => {
      configMod.telegram.botToken = undefined;
      configMod.telegram.alertChatId = undefined;
    });

    it("logs warning and does not call fetch", async () => {
      await alertMod.warn("NO_TOKEN_TEST", {});

      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Telegram alert not configured, logging only"
      );
    });
  });
});
