// routes/domain.js
const bindService = require("../services/bind"); // ⭐️ Updated import path (../)

const SUBDOMAIN_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const IPV4_REGEX =
  /^(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)){3}$/;
const HOSTNAME_REGEX =
  /^(?=.{1,253}$)(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z0-9-]{2,63}\.?$/i;

const isValidSubdomain = (name) => SUBDOMAIN_REGEX.test(name);

function normalizeDomainName(name = "") {
  return String(name).trim().toLowerCase();
}

async function getManagedDomains(fastify) {
  const [rows] = await fastify.mysql.execute(
    "SELECT id, domain_name FROM managed_domains WHERE is_active = 1"
  );

  return rows.map((row) => ({
    id: row.id,
    domain: row.domain_name,
    normalized: normalizeDomainName(row.domain_name),
  }));
}

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
      const managedDomains = await getManagedDomains(fastify);
      return reply
        .code(200)
        .send({ domains: managedDomains.map((item) => item.domain) });
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
      const managedDomains = await getManagedDomains(fastify);
      if (!managedDomains.length) {
        return reply
          .code(503)
          .send({ error: "No managed domains are configured." });
      }

      const results = await Promise.all(
        managedDomains.map(async ({ id: domainId, domain }) => {
          const isTakenInBind = await bindService.findDnsRecord(
            subdomain,
            domain
          );

          const [rows] = await fastify.mysql.execute(
            "SELECT 1 FROM subdomains WHERE subdomain = ? AND domain_id = ? LIMIT 1",
            [subdomain, domainId]
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
          "SELECT s.id, s.subdomain, m.domain_name, s.record_value, s.record_type, t.host_prefix, t.txt_value " +
            "FROM subdomains s " +
            "JOIN managed_domains m ON s.domain_id = m.id " +
            "LEFT JOIN subdomain_txt_records t ON s.id = t.subdomain_id " +
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

      if (!subdomain || !rawValue || !domainName) {
        return reply.code(400).send({
          error: "Domain name, record value, and domain are required",
        });
      }
      if (!isValidSubdomain(subdomain)) {
        return reply.code(400).send({ error: "Invalid domain format" });
      }

      const managedDomains = await getManagedDomains(fastify);
      const domainEntry = managedDomains.find(
        (item) => item.normalized === domainName
      );

      if (!domainEntry) {
        return reply
          .code(400)
          .send({ error: "Requested domain is not managed by this service." });
      }

      const validation = validateRecordValue(recordType, rawValue, {
        subdomain,
        domain: domainEntry.domain,
      });
      if (!validation.valid) {
        return reply.code(400).send({ error: validation.message });
      }
      const recordValue = validation.value;

      const connection = await fastify.mysql.getConnection();
      try {
        // Check for duplicates
        const isTakenInBind = await bindService.findDnsRecord(
          subdomain,
          domainEntry.domain
        );
        const [rows] = await connection.execute(
          "SELECT 1 FROM subdomains WHERE subdomain = ? AND domain_id = ? LIMIT 1",
          [subdomain, domainEntry.id]
        );
        if (isTakenInBind || rows.length > 0) {
          return reply.code(409).send({ error: "Domain is already in use." });
        }

        // DB first (in transaction), then BIND9
        await connection.beginTransaction();
        await connection.execute(
          "INSERT INTO subdomains (user_id, domain_id, subdomain, record_value, record_type) VALUES (?, ?, ?, ?, ?)",
          [userId, domainEntry.id, subdomain, recordValue, recordType]
        );

        const newRecord = await bindService.createDnsRecord(
          subdomain,
          recordValue,
          domainEntry.domain,
          recordType
        );

        await connection.commit();
        fastify.log.info(`New subdomain created: ${newRecord.name}`);

        return reply.code(201).send({
          success: true,
          domain: newRecord.name,
          value: recordValue,
          recordType,
        });
      } catch (error) {
        try {
          await connection.rollback();
        } catch (rbErr) {
          fastify.log.error(rbErr, "Rollback failed during domain creation");
        }
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
      const { value: rawValue, domain, txtValue } = request.body || {};
      const subdomain = (rawSubdomain || "").trim().toLowerCase();
      const userId = request.user.id;
      const domainName = (domain || "").trim().toLowerCase();

      if (!rawValue || !domainName) {
        return reply
          .code(400)
          .send({ error: "Record value and domain are required" });
      }

      const connection = await fastify.mysql.getConnection();
      try {
        const managedDomains = await getManagedDomains(fastify);
        const domainEntry = managedDomains.find(
          (item) => item.normalized === domainName
        );

        if (!domainEntry) {
          return reply.code(400).send({
            error: "Requested domain is not managed by this service.",
          });
        }

        // Verify ownership
        const [rows] = await connection.execute(
          "SELECT s.id, s.record_type FROM subdomains s WHERE s.subdomain = ? AND s.domain_id = ? AND s.user_id = ?",
          [subdomain, domainEntry.id, userId]
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
          domain: domainEntry.domain,
        });
        if (!validation.valid) {
          return reply.code(400).send({ error: validation.message });
        }
        const recordValue = validation.value;

        // DB first (in transaction), then BIND9
        await connection.beginTransaction();
        await connection.execute(
          "UPDATE subdomains SET record_value = ? WHERE id = ?",
          [recordValue, record.id]
        );

        if (recordType === "CNAME" && typeof txtValue !== "undefined") {
          const hostPrefix = "_vercel";
          if (txtValue) {
            await connection.execute(
              "INSERT INTO subdomain_txt_records (subdomain_id, host_prefix, txt_value) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE txt_value = VALUES(txt_value)",
              [record.id, hostPrefix, txtValue]
            );
          } else {
            await connection.execute(
              "DELETE FROM subdomain_txt_records WHERE subdomain_id = ? AND host_prefix = ?",
              [record.id, hostPrefix]
            );
          }
        }

        // BIND9 operations
        await bindService.updateDnsRecord(
          subdomain,
          recordValue,
          domainEntry.domain,
          recordType
        );

        if (recordType === "CNAME" && typeof txtValue !== "undefined") {
          const hostPrefix = "_vercel";
          if (txtValue) {
            await bindService.createOrUpdateTxtRecord(
              domainEntry.domain,
              hostPrefix,
              txtValue
            );
          } else {
            await bindService.deleteTxtRecord(
              subdomain,
              domainEntry.domain,
              hostPrefix
            );
          }
        }

        await connection.commit();
        fastify.log.info(
          `Record updated by user ${userId}: ${subdomain}.${domainEntry.domain} (${recordType})`
        );
        return reply.code(200).send({
          success: true,
          message: "Domain record updated successfully.",
        });
      } catch (error) {
        try {
          await connection.rollback();
        } catch (rbErr) {
          fastify.log.error(rbErr, "Rollback failed during domain update");
        }
        fastify.log.error(error, "Failed to update domain");
        return reply
          .code(500)
          .send({ error: "Server error during domain update" });
      } finally {
        connection.release();
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

      if (!domainName) {
        return reply.code(400).send({ error: "domain is required" });
      }

      const connection = await fastify.mysql.getConnection();
      try {
        const managedDomains = await getManagedDomains(fastify);
        const domainEntry = managedDomains.find(
          (item) => item.normalized === domainName
        );

        if (!domainEntry) {
          return reply.code(400).send({
            error: "Requested domain is not managed by this service.",
          });
        }

        // Verify ownership
        const [rows] = await connection.execute(
          "SELECT s.id, s.record_type FROM subdomains s WHERE s.subdomain = ? AND s.domain_id = ? AND s.user_id = ?",
          [subdomain, domainEntry.id, userId]
        );
        const record = rows[0];

        if (!record) {
          return reply.code(404).send({
            error: "Domain not found or you do not own this record.",
          });
        }

        const recordType = normalizeRecordType(record.record_type);

        // Get associated TXT records before deleting
        const [txtRows] = await connection.execute(
          "SELECT host_prefix FROM subdomain_txt_records WHERE subdomain_id = ?",
          [record.id]
        );

        // DB first (in transaction), then BIND9
        await connection.beginTransaction();
        await connection.execute(
          "DELETE FROM subdomain_txt_records WHERE subdomain_id = ?",
          [record.id]
        );
        await connection.execute("DELETE FROM subdomains WHERE id = ?", [
          record.id,
        ]);

        // BIND9 operations
        await bindService.deleteDnsRecord(
          subdomain,
          domainEntry.domain,
          recordType
        );

        for (const txt of txtRows) {
          await bindService.deleteTxtRecord(
            subdomain,
            domainEntry.domain,
            txt.host_prefix
          );
        }

        await connection.commit();
        fastify.log.info(
          `Record deleted by user ${userId}: ${subdomain}.${domainEntry.domain} (${recordType})`
        );
        return reply.code(200).send({
          success: true,
          message: "Domain record deleted successfully.",
        });
      } catch (error) {
        try {
          await connection.rollback();
        } catch (rbErr) {
          fastify.log.error(rbErr, "Rollback failed during domain deletion");
        }
        fastify.log.error(error, "Failed to delete domain");
        return reply
          .code(500)
          .send({ error: "Server error during domain deletion" });
      } finally {
        connection.release();
      }
    }
  );

  // POST /api/subdomains/:subdomain/txt
  fastify.post(
    "/subdomains/:subdomain/txt",
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const { subdomain: rawSubdomain } = request.params;
      const { domain, txtValue } = request.body || {};
      const subdomain = (rawSubdomain || "").trim().toLowerCase();
      const userId = request.user.id;
      const domainName = (domain || "").trim().toLowerCase();
      const hostPrefix = "_vercel"; // As requested

      if (!domainName || !txtValue) {
        return reply
          .code(400)
          .send({ error: "Domain and TXT value are required" });
      }

      try {
        const managedDomains = await getManagedDomains(fastify);
        const domainEntry = managedDomains.find(
          (item) => item.normalized === domainName
        );

        if (!domainEntry) {
          return reply.code(400).send({
            error: "Requested domain is not managed by this service.",
          });
        }

        // Verify ownership
        const [rows] = await fastify.mysql.execute(
          "SELECT id FROM subdomains WHERE subdomain = ? AND domain_id = ? AND user_id = ?",
          [subdomain, domainEntry.id, userId]
        );
        const record = rows[0];

        if (!record) {
          return reply.code(404).send({
            error: "Domain not found or you do not own this record.",
          });
        }
        const subdomainId = record.id;

        // Create/update TXT record in BIND
        await bindService.createOrUpdateTxtRecord(
          domainEntry.domain,
          hostPrefix,
          txtValue
        );

        // Upsert into the database
        await fastify.mysql.execute(
          "INSERT INTO subdomain_txt_records (subdomain_id, host_prefix, txt_value) VALUES (?, ?, ?) " +
            "ON DUPLICATE KEY UPDATE txt_value = VALUES(txt_value)",
          [subdomainId, hostPrefix, txtValue]
        );

        fastify.log.info(
          `TXT record updated by user ${userId}: ${hostPrefix}.${subdomain}.${domainEntry.domain}`
        );
        return reply
          .code(200)
          .send({ success: true, message: "TXT record updated successfully." });
      } catch (error) {
        fastify.log.error(error, "Failed to update TXT record");
        return reply
          .code(500)
          .send({ error: "Server error during TXT record update" });
      }
    }
  );
}

module.exports = domainRoutes;
