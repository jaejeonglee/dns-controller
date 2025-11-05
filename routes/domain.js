// routes/domain.js
const bindService = require("../services/bind"); // ⭐️ Updated import path (../)

const SUBDOMAIN_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const IPV4_REGEX =
  /^(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)){3}$/;
const HOSTNAME_REGEX =
  /^(?=.{1,253}$)(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z0-9-]{2,63}\.?$/i;

const isValidSubdomain = (name) => SUBDOMAIN_REGEX.test(name);

// ⭐️ Load the managed domain list at startup (kept as a simple constant for now)
const MANAGED_DOMAINS = ["sitey.one", "sitey.my"];

function normalizeRecordType(recordType = "A") {
  return bindService.normalizeRecordType(recordType);
}

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

/**
 * Domain and subdomain routes
 */
async function domainRoutes(fastify, options) {
  // GET /api/managed-domains
  fastify.get("/managed-domains", async (request, reply) => {
    try {
      return reply.code(200).send({ domains: MANAGED_DOMAINS });
    } catch (error) {
      fastify.log.error(error, "Failed to load managed domains");
      return reply.code(500).send({ error: "Error loading domains" });
    }
  });

  // GET /api/stats/active-domains
  fastify.get("/stats/active-domains", async (request, reply) => {
    try {
      const [rows] = await fastify.mysql.execute(
        "SELECT COUNT(*) AS count FROM subdomains"
      );
      const activeDomains = rows?.[0]?.count ?? 0;
      return reply.code(200).send({ activeDomains });
    } catch (error) {
      fastify.log.error(error, "Failed to load active domain stats");
      return reply.code(500).send({ error: "Error loading active domains" });
    }
  });

  // POST /api/check-availability
  fastify.post("/check-availability", async (request, reply) => {
    const { subdomain: rawSubdomain } = request.body;
    const subdomain = (rawSubdomain || "").trim().toLowerCase();

    if (!subdomain || !isValidSubdomain(subdomain)) {
      return reply.code(400).send({ error: "Invalid domain format" });
    }

    try {
      const results = await Promise.all(
        MANAGED_DOMAINS.map(async (domain) => {
          const isTakenInBind = await bindService.findDnsRecord(
            subdomain,
            domain
          );

          const [rows] = await fastify.mysql.execute(
            "SELECT 1 FROM subdomains s JOIN managed_domains m ON s.domain_id = m.id WHERE s.subdomain = ? AND m.domain_name = ? LIMIT 1",
            [subdomain, domain]
          );
          const isTakenInDb = rows.length > 0;

          return {
            domain,
            subdomain,
            fullSubdomain: `${subdomain}.${domain}`,
            isAvailable: !isTakenInBind && !isTakenInDb,
          };
        })
      );

      return reply.code(200).send({ results });
    } catch (error) {
      fastify.log.error(error, "Failed to check multi-domain availability");
      return reply
        .code(500)
        .send({ error: "Error checking domain availability" });
    }
  });

  // GET /api/subdomains (list user's subdomains)
  fastify.get(
    "/subdomains",
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const userId = request.user.id;

      try {
        const [rows] = await fastify.mysql.execute(
          "SELECT s.id, s.subdomain, m.domain_name, s.record_value, s.record_type " +
            "FROM subdomains s " +
            "JOIN managed_domains m ON s.domain_id = m.id " +
            "WHERE s.user_id = ? " +
            "ORDER BY m.domain_name, s.subdomain",
          [userId]
        );

        return reply.send(rows);
      } catch (error) {
        fastify.log.error(error, "Failed to fetch user domains");
        return reply.code(500).send({ error: "Error fetching your domains" });
      }
    }
  );

  fastify.post(
    "/subdomains",
    {
      preHandler: [fastify.authenticate], // ⭐️ Add auth guard via route options
    },
    async (request, reply) => {
      const {
        subdomain: rawSubdomain,
        value: rawValue,
        domain,
        recordType: rawRecordType = "A",
      } = request.body || {};
      const subdomain = (rawSubdomain || "").trim().toLowerCase();
      const domainName = (domain || "").trim().toLowerCase();
      const userId = request.user.id; // ⭐️ Authenticated user ID
      const recordType = normalizeRecordType(rawRecordType);

      if (
        !subdomain ||
        !rawValue ||
        !domainName ||
        !MANAGED_DOMAINS.includes(domainName)
      ) {
        return reply
          .code(400)
          .send({
            error: "Domain name, record value, and domain are required",
          });
      }
      if (!isValidSubdomain(subdomain)) {
        return reply.code(400).send({ error: "Invalid domain format" });
      }

      const validation = validateRecordValue(recordType, rawValue, {
        subdomain,
        domain: domainName,
      });
      if (!validation.valid) {
        return reply.code(400).send({ error: validation.message });
      }
      const recordValue = validation.value;

      const connection = await fastify.mysql.getConnection();
      try {
        // (Check for duplicates)
        const isTakenInBind = await bindService.findDnsRecord(
          subdomain,
          domainName
        );
        const [rows] = await connection.execute(
          "SELECT 1 FROM subdomains WHERE subdomain = ? AND domain_id IN (SELECT id FROM managed_domains WHERE domain_name = ?)",
          [subdomain, domainName]
        );
        if (isTakenInBind || rows.length > 0) {
          return reply.code(409).send({ error: "Domain is already in use." });
        }

        // (Fetch managed domain ID)
        const [domainRows] = await connection.execute(
          "SELECT id FROM managed_domains WHERE domain_name = ?",
          [domainName]
        );
        const domainId = domainRows[0].id;

        // (Create record in BIND9)
        const newRecord = await bindService.createDnsRecord(
          subdomain,
          recordValue,
          domainName,
          recordType
        );
        fastify.log.info(`New subdomain created in BIND: ${newRecord.name}`);

        // (Insert record into DB)
        await connection.execute(
          "INSERT INTO subdomains (user_id, domain_id, subdomain, record_value, record_type) VALUES (?, ?, ?, ?, ?)",
          [userId, domainId, subdomain, recordValue, recordType]
        );

        return reply.code(201).send({
          success: true,
          domain: newRecord.name,
          value: recordValue,
          recordType,
        });
      } catch (error) {
        fastify.log.error(error, "Failed to process domain creation");
        return reply
          .code(500)
          .send({ error: "Server error during domain creation" });
      } finally {
        connection.release();
      }
    }
  );

  // ⭐️ Updated: PUT /api/subdomains/:subdomain (update)
  fastify.put(
    "/subdomains/:subdomain",
    {
      preHandler: [fastify.authenticate], // ⭐️ Apply auth guard
    },
    async (request, reply) => {
      const { subdomain: rawSubdomain } = request.params;
      const { value: rawValue, domain } = request.body || {};
      const subdomain = (rawSubdomain || "").trim().toLowerCase();
      const userId = request.user.id;
      const domainName = (domain || "").trim().toLowerCase();

      if (!rawValue || !domainName || !MANAGED_DOMAINS.includes(domainName)) {
        return reply
          .code(400)
          .send({ error: "Record value and domain are required" });
      }

      try {
        // (Verify ownership)
        const [rows] = await fastify.mysql.execute(
          "SELECT s.id, s.record_type FROM subdomains s JOIN managed_domains m ON s.domain_id = m.id WHERE s.subdomain = ? AND m.domain_name = ? AND s.user_id = ?",
          [subdomain, domainName, userId]
        );
        const record = rows[0];

        if (!record) {
          return reply.code(404).send({
            error: "Domain not found or you do not own this record.",
          });
        }

        const recordType = normalizeRecordType(record.record_type);
        const validation = validateRecordValue(recordType, rawValue, {
          subdomain,
          domain: domainName,
        });
        if (!validation.valid) {
          return reply.code(400).send({ error: validation.message });
        }
        const recordValue = validation.value;

        // (Update BIND9 record)
        await bindService.updateDnsRecord(
          subdomain,
          recordValue,
          domainName,
          recordType
        );

        // (Update DB record)
        await fastify.mysql.execute(
          "UPDATE subdomains SET record_value = ? WHERE id = ?",
          [recordValue, record.id]
        );

        fastify.log.info(
          `Record updated by user ${userId}: ${subdomain}.${domainName} (${recordType})`
        );
        return reply.code(200).send({
          success: true,
          message: "Domain record updated successfully.",
        });
      } catch (error) {
        fastify.log.error(error, "Failed to update domain");
        return reply
          .code(500)
          .send({ error: "Server error during domain update" });
      }
    }
  );

  // ⭐️ Updated: DELETE /api/subdomains/:subdomain (delete)
  fastify.delete(
    "/subdomains/:subdomain",
    {
      preHandler: [fastify.authenticate], // ⭐️ Apply auth guard
    },
    async (request, reply) => {
      const { subdomain: rawSubdomain } = request.params;
      const { domain } = request.body || {};
      const subdomain = (rawSubdomain || "").trim().toLowerCase();
      const userId = request.user.id;
      const domainName = (domain || "").trim().toLowerCase();

      if (!domainName || !MANAGED_DOMAINS.includes(domainName)) {
        return reply.code(400).send({ error: "domain is required" });
      }

      try {
        // (Verify ownership)
        const [rows] = await fastify.mysql.execute(
          "SELECT s.id, s.record_type FROM subdomains s JOIN managed_domains m ON s.domain_id = m.id WHERE s.subdomain = ? AND m.domain_name = ? AND s.user_id = ?",
          [subdomain, domainName, userId]
        );
        const record = rows[0];

        if (!record) {
          return reply.code(404).send({
            error: "Domain not found or you do not own this record.",
          });
        }

        const recordType = normalizeRecordType(record.record_type);

        // (Delete record from BIND9)
        await bindService.deleteDnsRecord(subdomain, domainName, recordType);

        // (Delete record from DB)
        await fastify.mysql.execute("DELETE FROM subdomains WHERE id = ?", [
          record.id,
        ]);

        fastify.log.info(
          `Record deleted by user ${userId}: ${subdomain}.${domainName} (${recordType})`
        );
        return reply
          .code(200)
          .send({
            success: true,
            message: "Domain record deleted successfully.",
          });
      } catch (error) {
        fastify.log.error(error, "Failed to delete domain");
        return reply
          .code(500)
          .send({ error: "Server error during domain deletion" });
      }
    }
  );
}

module.exports = domainRoutes;
