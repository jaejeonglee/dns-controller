// routes/domain.js
const bindService = require("../services/bind"); // ⭐️ Updated import path (../)

const SUBDOMAIN_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const isValidSubdomain = (name) => SUBDOMAIN_REGEX.test(name);

// ⭐️ Load the managed domain list at startup (kept as a simple constant for now)
const MANAGED_DOMAINS = ["sitey.one", "sitey.my"];

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
      return reply.code(400).send({ error: "Invalid subdomain format" });
    }

    try {
      const results = [];
      // ⭐️ Use fastify.mysql instead of fileDbService because passwords live in the DB
      const connection = await fastify.mysql.getConnection();
      try {
        await Promise.all(
          MANAGED_DOMAINS.map(async (domain) => {
            const isTakenInBind = await bindService.findDnsRecord(
              subdomain,
              domain
            );

            const [rows] = await connection.execute(
              "SELECT 1 FROM subdomains WHERE subdomain = ? AND domain = ? LIMIT 1",
              [subdomain, domain]
            );
            const isTakenInDb = rows.length > 0;

            results.push({
              domain: domain,
              fullSubdomain: `${subdomain}.${domain}`,
              isAvailable: !isTakenInBind && !isTakenInDb,
            });
          })
        );
      } finally {
        connection.release();
      }
      return reply.code(200).send({ results });
    } catch (error) {
      fastify.log.error(error, "Failed to check multi-domain availability");
      return reply
        .code(500)
        .send({ error: "Error checking subdomain availability" });
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
          "SELECT s.id, s.subdomain, m.domain_name, s.ip " +
            "FROM subdomains s " +
            "JOIN managed_domains m ON s.domain_id = m.id " +
            "WHERE s.user_id = ? " +
            "ORDER BY m.domain_name, s.subdomain",
          [userId]
        );

        return reply.send(rows);
      } catch (error) {
        fastify.log.error(error, "Failed to fetch user subdomains");
        return reply
          .code(500)
          .send({ error: "Error fetching your subdomains" });
      }
    }
  );

  fastify.post(
    "/subdomains",
    {
      preHandler: [fastify.authenticate], // ⭐️ Add auth guard via route options
    },
    async (request, reply) => {
      const { subdomain: rawSubdomain, ip, domain } = request.body;
      const subdomain = (rawSubdomain || "").trim().toLowerCase();
      const userId = request.user.id; // ⭐️ Authenticated user ID

      if (!subdomain || !ip || !domain || !MANAGED_DOMAINS.includes(domain)) {
        return reply
          .code(400)
          .send({ error: "subdomain, ip, and domain are required" });
      }
      if (!isValidSubdomain(subdomain)) {
        return reply.code(400).send({ error: "Invalid subdomain format" });
      }

      const connection = await fastify.mysql.getConnection();
      try {
        // (Check for duplicates)
        const isTakenInBind = await bindService.findDnsRecord(
          subdomain,
          domain
        );
        const [rows] = await connection.execute(
          "SELECT 1 FROM subdomains WHERE subdomain = ? AND domain_id IN (SELECT id FROM managed_domains WHERE domain_name = ?)",
          [subdomain, domain]
        );
        if (isTakenInBind || rows.length > 0) {
          return reply.code(409).send({ error: "Already taken subdomain." });
        }

        // (Fetch managed domain ID)
        const [domainRows] = await connection.execute(
          "SELECT id FROM managed_domains WHERE domain_name = ?",
          [domain]
        );
        const domainId = domainRows[0].id;

        // (Create record in BIND9)
        const newRecord = await bindService.createDnsRecord(
          subdomain,
          ip,
          domain
        );
        fastify.log.info(`New subdomain created in BIND: ${newRecord.name}`);

        // (Insert record into DB)
        await connection.execute(
          "INSERT INTO subdomains (user_id, domain_id, subdomain, ip) VALUES (?, ?, ?, ?)",
          [userId, domainId, subdomain, ip]
        );

        return reply.code(201).send({
          success: true,
          domain: newRecord.name,
          ip: newRecord.content,
        });
      } catch (error) {
        fastify.log.error(error, "Failed to process subdomain creation");
        return reply
          .code(500)
          .send({ error: "Server error during subdomain creation" });
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
      const { ip: newIp, domain } = request.body;
      const subdomain = (rawSubdomain || "").trim().toLowerCase();
      const userId = request.user.id;

      if (!newIp || !domain || !MANAGED_DOMAINS.includes(domain)) {
        return reply
          .code(400)
          .send({ error: "new ip and domain are required" });
      }

      try {
        // (Verify ownership)
        const [rows] = await fastify.mysql.execute(
          "SELECT s.id FROM subdomains s JOIN managed_domains m ON s.domain_id = m.id WHERE s.subdomain = ? AND m.domain_name = ? AND s.user_id = ?",
          [subdomain, domain, userId]
        );
        const record = rows[0];

        if (!record) {
          return reply.code(404).send({
            error: "Subdomain not found or you do not own this record.",
          });
        }

        // (Update BIND9 record)
        await bindService.updateDnsRecord(subdomain, newIp, domain);

        // (Update DB record)
        await fastify.mysql.execute(
          "UPDATE subdomains SET ip = ? WHERE id = ?",
          [newIp, record.id]
        );

        fastify.log.info(
          `Subdomain IP updated by user ${userId}: ${subdomain}.${domain}`
        );
        return reply.code(200).send({
          success: true,
          message: "Subdomain IP updated successfully.",
        });
      } catch (error) {
        fastify.log.error(error, "Failed to update subdomain");
        return reply
          .code(500)
          .send({ error: "Server error during subdomain update" });
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
      const { domain } = request.body;
      const subdomain = (rawSubdomain || "").trim().toLowerCase();
      const userId = request.user.id;

      if (!domain || !MANAGED_DOMAINS.includes(domain)) {
        return reply.code(400).send({ error: "domain is required" });
      }

      try {
        // (Verify ownership)
        const [rows] = await fastify.mysql.execute(
          "SELECT s.id FROM subdomains s JOIN managed_domains m ON s.domain_id = m.id WHERE s.subdomain = ? AND m.domain_name = ? AND s.user_id = ?",
          [subdomain, domain, userId]
        );
        const record = rows[0];

        if (!record) {
          return reply.code(404).send({
            error: "Subdomain not found or you do not own this record.",
          });
        }

        // (Delete record from BIND9)
        await bindService.deleteDnsRecord(subdomain, domain);

        // (Delete record from DB)
        await fastify.mysql.execute("DELETE FROM subdomains WHERE id = ?", [
          record.id,
        ]);

        fastify.log.info(
          `Subdomain deleted by user ${userId}: ${subdomain}.${domain}`
        );
        return reply
          .code(200)
          .send({ success: true, message: "Subdomain deleted successfully." });
      } catch (error) {
        fastify.log.error(error, "Failed to delete subdomain");
        return reply
          .code(500)
          .send({ error: "Server error during subdomain deletion" });
      }
    }
  );
}

module.exports = domainRoutes;
