// plugins/mcp.js
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const { z } = require("zod");
const bindService = require("../services/bind");
const { validateRecord } = require("../services/validation");
const { createSubdomain, updateSubdomain, deleteSubdomain } = require("../services/subdomain");
const { getManagedDomains } = require("../services/managedDomain");
const { isBlacklisted } = require("../services/blacklist");
const { hashKey, validateKey } = require("../services/api-key");

const SUBDOMAIN_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const IPV4_REGEX = /^(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)){3}$/;
const HOSTNAME_REGEX = /^(?=.{1,253}$)(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z0-9-]{2,63}\.?$/i;

const IP_SUBDOMAIN_LIMIT = 3;
const ANON_CREATE_RATE_WINDOW_MS = 60 * 1000;
const ANON_CREATE_RATE_MAX = 3;

// Global rate limiter for anonymous MCP creates
const anonCreateTimestamps = [];

function checkAnonCreateRate() {
  const now = Date.now();
  while (anonCreateTimestamps.length > 0 && anonCreateTimestamps[0] < now - ANON_CREATE_RATE_WINDOW_MS) {
    anonCreateTimestamps.shift();
  }
  if (anonCreateTimestamps.length >= ANON_CREATE_RATE_MAX) {
    return false;
  }
  anonCreateTimestamps.push(now);
  return true;
}

/**
 * Extract client IP from Fastify request
 */
function getClientIp(request) {
  return (
    request.headers["cf-connecting-ip"] ||
    request.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    request.ip
  );
}

/**
 * Resolve auth context from Fastify request
 */
async function resolveAuth(fastify, request) {
  const authHeader = request.headers["authorization"];
  if (authHeader && authHeader.startsWith("Bearer styo_")) {
    const rawKey = authHeader.slice(7); // "Bearer ".length
    const keyHash = hashKey(rawKey);
    const user = await validateKey(fastify, keyHash);
    if (!user) {
      return { mode: "invalid_key" };
    }
    return { mode: "apikey", userId: user.user_id, email: user.email, name: user.name };
  }
  return { mode: "ip", ip: getClientIp(request) };
}

function mcpValidateRecordValue(recordType, value, subdomain, domain) {
  const trimmed = (value || "").trim();
  if (!trimmed) {
    return { valid: false, message: "Record value is required." };
  }
  if (recordType === "A") {
    if (!IPV4_REGEX.test(trimmed)) {
      return { valid: false, message: "Provide a valid IPv4 address (e.g. 203.0.113.10)." };
    }
    return { valid: true, value: trimmed };
  }
  const candidate = trimmed.toLowerCase();
  if (!HOSTNAME_REGEX.test(candidate)) {
    return { valid: false, message: "Provide a valid hostname (e.g. app.example.com)." };
  }
  const fullDomain = `${subdomain}.${domain}`.toLowerCase();
  if (candidate.replace(/\.$/, "") === fullDomain.replace(/\.$/, "")) {
    return { valid: false, message: "CNAME target cannot point to itself." };
  }
  return { valid: true, value: candidate.replace(/\.$/, "") };
}

function mcpError(message) {
  return { content: [{ type: "text", text: JSON.stringify({ error: message }) }], isError: true };
}

function mcpErrorObj(obj) {
  return { content: [{ type: "text", text: JSON.stringify(obj) }], isError: true };
}

function mcpSuccess(data) {
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
}

/**
 * Inject auth context into _meta of each JSON-RPC message's params
 */
function injectAuth(body, auth) {
  if (Array.isArray(body)) {
    for (const msg of body) {
      injectAuthSingle(msg, auth);
    }
  } else if (body && typeof body === "object") {
    injectAuthSingle(body, auth);
  }
  return body;
}

function injectAuthSingle(msg, auth) {
  if (msg && typeof msg === "object" && msg.params && typeof msg.params === "object") {
    if (!msg.params._meta) {
      msg.params._meta = {};
    }
    msg.params._meta.auth = auth;
  }
}

/**
 * Create and configure a new McpServer with all tools registered.
 * We create a fresh server per request because the SDK's connect()
 * binds exclusively to one transport.
 */
function createMcpServer(fastify) {
  const server = new McpServer({
    name: "sitey.one",
    version: "1.0.0",
  });

  // --- Tool: check_availability ---
  server.tool(
    "check_availability",
    "Check if a subdomain is available for registration",
    {
      subdomain: z.string().describe("Subdomain name (e.g. 'demo')"),
      domain: z.string().describe("Root domain (e.g. 'sitey.one')"),
    },
    async ({ subdomain: rawSubdomain, domain: rawDomain }) => {
      const subdomain = (rawSubdomain || "").trim().toLowerCase();
      const domainName = (rawDomain || "").trim().toLowerCase();

      if (!subdomain || !SUBDOMAIN_REGEX.test(subdomain)) {
        return mcpError("Invalid subdomain format.");
      }

      const managedDomains = await getManagedDomains(fastify);
      const domainEntry = managedDomains.find((d) => d.normalized === domainName);
      if (!domainEntry) {
        return mcpErrorObj({ error: "Domain is not managed by this service.", available_domains: managedDomains.map((d) => d.domain) });
      }

      const isTakenInBind = await bindService.findDnsRecord(subdomain, domainEntry.domain);
      const [rows] = await fastify.mysql.execute(
        "SELECT 1 FROM subdomains WHERE subdomain = ? AND domain_id = ? LIMIT 1",
        [subdomain, domainEntry.id]
      );
      const available = !isTakenInBind && rows.length === 0;

      return mcpSuccess({
        available,
        subdomain,
        domain: domainEntry.domain,
        fullSubdomain: `${subdomain}.${domainEntry.domain}`,
      });
    }
  );

  // --- Tool: create_subdomain ---
  server.tool(
    "create_subdomain",
    "Create a new subdomain DNS record (A or CNAME)",
    {
      subdomain: z.string().describe("Subdomain name (e.g. 'demo')"),
      domain: z.string().describe("Root domain (e.g. 'sitey.one')"),
      type: z.enum(["A", "CNAME"]).describe("Record type"),
      value: z.string().describe("Record value (IP for A, hostname for CNAME)"),
    },
    async ({ subdomain: rawSubdomain, domain: rawDomain, type, value }, extra) => {
      const subdomain = (rawSubdomain || "").trim().toLowerCase();
      const domainName = (rawDomain || "").trim().toLowerCase();
      const recordType = type;

      const auth = extra._meta?.auth;
      if (!auth) return mcpError("Internal error: auth context missing.");
      if (auth.mode === "invalid_key") return mcpError("Invalid API key.");

      if (!subdomain || !SUBDOMAIN_REGEX.test(subdomain)) {
        return mcpError("Invalid subdomain format.");
      }

      const blacklistCheck = isBlacklisted(subdomain);
      if (blacklistCheck.blocked) {
        return mcpError(blacklistCheck.reason);
      }

      const managedDomains = await getManagedDomains(fastify);
      const domainEntry = managedDomains.find((d) => d.normalized === domainName);
      if (!domainEntry) {
        return mcpErrorObj({ error: "Domain is not managed by this service.", available_domains: managedDomains.map((d) => d.domain) });
      }

      const validation = mcpValidateRecordValue(recordType, value, subdomain, domainEntry.domain);
      if (!validation.valid) return mcpError(validation.message);
      const recordValue = validation.value;

      // IP limit for anonymous mode
      if (auth.mode === "ip") {
        if (!checkAnonCreateRate()) {
          return mcpError("Too many anonymous create requests. Please wait a moment.");
        }
        const [countRows] = await fastify.mysql.execute(
          "SELECT COUNT(*) AS cnt FROM subdomains WHERE owner_ip = ? AND owner_type = 'agent'",
          [auth.ip]
        );
        if (countRows[0].cnt >= IP_SUBDOMAIN_LIMIT) {
          return mcpError(`Anonymous agents can create up to ${IP_SUBDOMAIN_LIMIT} subdomains per IP. Sign up at sitey.one and generate an API key for unlimited access.`);
        }
      }

      // Reachability validation
      const isReachable = await validateRecord(recordType, recordValue);
      if (!isReachable) {
        const msg = recordType === "A"
          ? `Target IP ${recordValue} is not reachable on port 80 or 443.`
          : `Target domain ${recordValue} does not resolve to any address.`;
        return mcpErrorObj({ error: msg, code: "VALIDATION_UNREACHABLE" });
      }

      try {
        const newRecord = await createSubdomain(fastify, {
          userId: auth.mode === "apikey" ? auth.userId : null,
          domainId: domainEntry.id,
          subdomain,
          domain: domainEntry.domain,
          recordValue,
          recordType,
          ownerType: auth.mode === "apikey" ? "user" : "agent",
          ownerIp: auth.mode === "ip" ? auth.ip : null,
        });

        return mcpSuccess({
          success: true,
          fullSubdomain: newRecord.name,
          type: newRecord.type,
          value: recordValue,
        });
      } catch (error) {
        if (error.statusCode === 409) {
          return mcpError("This subdomain is already in use.");
        }
        fastify.log.error(error, "MCP create_subdomain failed");
        return mcpError("Server error during subdomain creation.");
      }
    }
  );

  // --- Tool: list_subdomains ---
  server.tool(
    "list_subdomains",
    "List subdomains owned by the current user/IP",
    {},
    async (_, extra) => {
      const auth = extra._meta?.auth;
      if (!auth) return mcpError("Internal error: auth context missing.");
      if (auth.mode === "invalid_key") return mcpError("Invalid API key.");

      let rows;
      if (auth.mode === "apikey") {
        [rows] = await fastify.mysql.execute(
          "SELECT s.subdomain, m.domain_name AS domain, s.record_type AS type, s.record_value AS value, s.created_at FROM subdomains s JOIN managed_domains m ON s.domain_id = m.id WHERE s.user_id = ? ORDER BY s.created_at DESC",
          [auth.userId]
        );
      } else {
        [rows] = await fastify.mysql.execute(
          "SELECT s.subdomain, m.domain_name AS domain, s.record_type AS type, s.record_value AS value, s.created_at FROM subdomains s JOIN managed_domains m ON s.domain_id = m.id WHERE s.owner_ip = ? AND s.owner_type = 'agent' ORDER BY s.created_at DESC",
          [auth.ip]
        );
      }

      return mcpSuccess({ subdomains: rows });
    }
  );

  // --- Tool: update_subdomain ---
  server.tool(
    "update_subdomain",
    "Update the value of an existing subdomain record",
    {
      subdomain: z.string().describe("Subdomain name (e.g. 'demo')"),
      domain: z.string().describe("Root domain (e.g. 'sitey.one')"),
      value: z.string().describe("New record value"),
    },
    async ({ subdomain: rawSubdomain, domain: rawDomain, value }, extra) => {
      const subdomain = (rawSubdomain || "").trim().toLowerCase();
      const domainName = (rawDomain || "").trim().toLowerCase();

      const auth = extra._meta?.auth;
      if (!auth) return mcpError("Internal error: auth context missing.");
      if (auth.mode === "invalid_key") return mcpError("Invalid API key.");

      const managedDomains = await getManagedDomains(fastify);
      const domainEntry = managedDomains.find((d) => d.normalized === domainName);
      if (!domainEntry) return mcpError("Domain is not managed by this service.");

      let record;
      if (auth.mode === "apikey") {
        const [rows] = await fastify.mysql.execute(
          "SELECT id, record_type FROM subdomains WHERE subdomain = ? AND domain_id = ? AND user_id = ?",
          [subdomain, domainEntry.id, auth.userId]
        );
        record = rows[0];
      } else {
        const [rows] = await fastify.mysql.execute(
          "SELECT id, record_type FROM subdomains WHERE subdomain = ? AND domain_id = ? AND owner_ip = ? AND owner_type = 'agent'",
          [subdomain, domainEntry.id, auth.ip]
        );
        record = rows[0];
      }

      if (!record) {
        const msg = auth.mode === "ip"
          ? "Subdomain not found or you don't have permission. If your IP has changed, sign up at sitey.one to manage it."
          : "Subdomain not found or you do not own this record.";
        return mcpError(msg);
      }

      const recordType = bindService.normalizeRecordType(record.record_type);
      const validation = mcpValidateRecordValue(recordType, value, subdomain, domainEntry.domain);
      if (!validation.valid) return mcpError(validation.message);
      const recordValue = validation.value;

      const isReachable = await validateRecord(recordType, recordValue);
      if (!isReachable) {
        const msg = recordType === "A"
          ? `Target IP ${recordValue} is not reachable on port 80 or 443.`
          : `Target domain ${recordValue} does not resolve to any address.`;
        return mcpErrorObj({ error: msg, code: "VALIDATION_UNREACHABLE" });
      }

      try {
        await updateSubdomain(fastify, {
          recordId: record.id,
          subdomain,
          domain: domainEntry.domain,
          recordValue,
          recordType,
        });

        return mcpSuccess({
          success: true,
          fullSubdomain: `${subdomain}.${domainEntry.domain}`,
          value: recordValue,
        });
      } catch (error) {
        fastify.log.error(error, "MCP update_subdomain failed");
        return mcpError("Server error during subdomain update.");
      }
    }
  );

  // --- Tool: delete_subdomain ---
  server.tool(
    "delete_subdomain",
    "Delete an existing subdomain record",
    {
      subdomain: z.string().describe("Subdomain name (e.g. 'demo')"),
      domain: z.string().describe("Root domain (e.g. 'sitey.one')"),
    },
    async ({ subdomain: rawSubdomain, domain: rawDomain }, extra) => {
      const subdomain = (rawSubdomain || "").trim().toLowerCase();
      const domainName = (rawDomain || "").trim().toLowerCase();

      const auth = extra._meta?.auth;
      if (!auth) return mcpError("Internal error: auth context missing.");
      if (auth.mode === "invalid_key") return mcpError("Invalid API key.");

      const managedDomains = await getManagedDomains(fastify);
      const domainEntry = managedDomains.find((d) => d.normalized === domainName);
      if (!domainEntry) return mcpError("Domain is not managed by this service.");

      let record;
      if (auth.mode === "apikey") {
        const [rows] = await fastify.mysql.execute(
          "SELECT id, record_type FROM subdomains WHERE subdomain = ? AND domain_id = ? AND user_id = ?",
          [subdomain, domainEntry.id, auth.userId]
        );
        record = rows[0];
      } else {
        const [rows] = await fastify.mysql.execute(
          "SELECT id, record_type FROM subdomains WHERE subdomain = ? AND domain_id = ? AND owner_ip = ? AND owner_type = 'agent'",
          [subdomain, domainEntry.id, auth.ip]
        );
        record = rows[0];
      }

      if (!record) {
        const msg = auth.mode === "ip"
          ? "Subdomain not found or you don't have permission. If your IP has changed, sign up at sitey.one to manage it."
          : "Subdomain not found or you do not own this record.";
        return mcpError(msg);
      }

      const recordType = bindService.normalizeRecordType(record.record_type);

      try {
        await deleteSubdomain(fastify, {
          recordId: record.id,
          subdomain,
          domain: domainEntry.domain,
          recordType,
        });

        return mcpSuccess({
          success: true,
          fullSubdomain: `${subdomain}.${domainEntry.domain}`,
        });
      } catch (error) {
        fastify.log.error(error, "MCP delete_subdomain failed");
        return mcpError("Server error during subdomain deletion.");
      }
    }
  );

  // --- Tool: create_txt_record ---
  server.tool(
    "create_txt_record",
    "Create or update a TXT record (useful for domain verification, e.g. Vercel)",
    {
      subdomain: z.string().describe("Subdomain name (e.g. 'demo')"),
      domain: z.string().describe("Root domain (e.g. 'sitey.one')"),
      host_prefix: z.string().describe("TXT record host prefix (e.g. '_vercel' for Vercel verification)"),
      value: z.string().describe("TXT record value (the verification token)"),
    },
    async ({ subdomain: rawSubdomain, domain: rawDomain, host_prefix: hostPrefix, value: txtValue }, extra) => {
      const subdomain = (rawSubdomain || "").trim().toLowerCase();
      const domainName = (rawDomain || "").trim().toLowerCase();

      const auth = extra._meta?.auth;
      if (!auth) return mcpError("Internal error: auth context missing.");
      if (auth.mode === "invalid_key") return mcpError("Invalid API key.");

      const managedDomains = await getManagedDomains(fastify);
      const domainEntry = managedDomains.find((d) => d.normalized === domainName);
      if (!domainEntry) return mcpError("Domain is not managed by this service.");

      // Verify ownership: user must own the subdomain to add TXT
      let record;
      if (auth.mode === "apikey") {
        const [rows] = await fastify.mysql.execute(
          "SELECT id FROM subdomains WHERE subdomain = ? AND domain_id = ? AND user_id = ?",
          [subdomain, domainEntry.id, auth.userId]
        );
        record = rows[0];
      } else {
        const [rows] = await fastify.mysql.execute(
          "SELECT id FROM subdomains WHERE subdomain = ? AND domain_id = ? AND owner_ip = ? AND owner_type = 'agent'",
          [subdomain, domainEntry.id, auth.ip]
        );
        record = rows[0];
      }

      if (!record) {
        return mcpError("You must own the subdomain before adding TXT records. Create the subdomain first.");
      }

      if (!hostPrefix || !txtValue) {
        return mcpError("host_prefix and value are required.");
      }

      try {
        const fullPrefix = `${hostPrefix}.${subdomain}`;
        await bindService.createOrUpdateTxtRecord(domainEntry.domain, fullPrefix, txtValue);
        return mcpSuccess({
          success: true,
          record: `${fullPrefix}.${domainEntry.domain}`,
          type: "TXT",
          value: txtValue,
        });
      } catch (error) {
        fastify.log.error(error, "MCP create_txt_record failed");
        return mcpError("Server error during TXT record creation.");
      }
    }
  );

  // --- Tool: delete_txt_record ---
  server.tool(
    "delete_txt_record",
    "Delete a TXT record",
    {
      subdomain: z.string().describe("Subdomain name (e.g. 'demo')"),
      domain: z.string().describe("Root domain (e.g. 'sitey.one')"),
      host_prefix: z.string().describe("TXT record host prefix (e.g. '_vercel')"),
    },
    async ({ subdomain: rawSubdomain, domain: rawDomain, host_prefix: hostPrefix }, extra) => {
      const subdomain = (rawSubdomain || "").trim().toLowerCase();
      const domainName = (rawDomain || "").trim().toLowerCase();

      const auth = extra._meta?.auth;
      if (!auth) return mcpError("Internal error: auth context missing.");
      if (auth.mode === "invalid_key") return mcpError("Invalid API key.");

      const managedDomains = await getManagedDomains(fastify);
      const domainEntry = managedDomains.find((d) => d.normalized === domainName);
      if (!domainEntry) return mcpError("Domain is not managed by this service.");

      // Verify ownership
      let record;
      if (auth.mode === "apikey") {
        const [rows] = await fastify.mysql.execute(
          "SELECT id FROM subdomains WHERE subdomain = ? AND domain_id = ? AND user_id = ?",
          [subdomain, domainEntry.id, auth.userId]
        );
        record = rows[0];
      } else {
        const [rows] = await fastify.mysql.execute(
          "SELECT id FROM subdomains WHERE subdomain = ? AND domain_id = ? AND owner_ip = ? AND owner_type = 'agent'",
          [subdomain, domainEntry.id, auth.ip]
        );
        record = rows[0];
      }

      if (!record) {
        return mcpError("Subdomain not found or you don't have permission.");
      }

      try {
        const fullPrefix = `${hostPrefix}.${subdomain}`;
        await bindService.deleteTxtRecord(subdomain, domainEntry.domain, hostPrefix);
        return mcpSuccess({
          success: true,
          record: `${fullPrefix}.${domainEntry.domain}`,
          type: "TXT",
          deleted: true,
        });
      } catch (error) {
        fastify.log.error(error, "MCP delete_txt_record failed");
        return mcpError("Server error during TXT record deletion.");
      }
    }
  );

  return server;
}

async function mcpPlugin(fastify, options) {
  // POST /mcp — main MCP endpoint (Streamable HTTP)
  fastify.post("/mcp", async (request, reply) => {
    const auth = await resolveAuth(fastify, request);

    const server = createMcpServer(fastify);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
    });

    // Inject auth into _meta of each JSON-RPC message
    const body = injectAuth(request.body, auth);

    // Hijack: transport writes directly to the raw response
    reply.hijack();

    reply.raw.on("close", () => {
      transport.close();
    });

    await server.connect(transport);
    await transport.handleRequest(request.raw, reply.raw, body);
  });

  // GET /mcp — not supported in stateless mode
  fastify.get("/mcp", async (request, reply) => {
    reply.code(405).send({ error: "Use POST for MCP requests." });
  });

  // DELETE /mcp — session cleanup (stateless, just acknowledge)
  fastify.delete("/mcp", async (request, reply) => {
    reply.code(200).send({ message: "Session ended." });
  });

  fastify.log.info("MCP server plugin registered on /mcp");
}

module.exports = mcpPlugin;
