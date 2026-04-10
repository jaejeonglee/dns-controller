const bindService = require("./bind");

/**
 * Create a subdomain record (DB + BIND9)
 * DB first (transaction) → BIND9 → commit / rollback
 *
 * @param {object} fastify - Fastify instance (for mysql + log)
 * @param {object} params
 * @param {number} params.userId
 * @param {number} params.domainId
 * @param {string} params.subdomain
 * @param {string} params.domain - e.g. "sitey.one"
 * @param {string} params.recordValue
 * @param {string} params.recordType - "A" or "CNAME"
 * @returns {{ name: string, content: string, type: string }}
 */
async function createSubdomain(fastify, params) {
  const { userId, domainId, subdomain, domain, recordValue, recordType } =
    params;

  const connection = await fastify.mysql.getConnection();
  try {
    // Check for duplicates
    const isTakenInBind = await bindService.findDnsRecord(subdomain, domain);
    const [rows] = await connection.execute(
      "SELECT 1 FROM subdomains WHERE subdomain = ? AND domain_id = ? LIMIT 1",
      [subdomain, domainId]
    );
    if (isTakenInBind || rows.length > 0) {
      throw Object.assign(new Error("Domain is already in use."), {
        statusCode: 409,
      });
    }

    await connection.beginTransaction();
    await connection.execute(
      "INSERT INTO subdomains (user_id, domain_id, subdomain, record_value, record_type) VALUES (?, ?, ?, ?, ?)",
      [userId, domainId, subdomain, recordValue, recordType]
    );

    const newRecord = await bindService.createDnsRecord(
      subdomain,
      recordValue,
      domain,
      recordType
    );

    await connection.commit();
    fastify.log.info(`Subdomain created: ${newRecord.name}`);
    return newRecord;
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rbErr) {
      fastify.log.error(rbErr, "Rollback failed during subdomain creation");
    }
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Update a subdomain record (DB + BIND9)
 *
 * @param {object} fastify
 * @param {object} params
 * @param {number} params.recordId - subdomains.id
 * @param {string} params.subdomain
 * @param {string} params.domain
 * @param {string} params.recordValue
 * @param {string} params.recordType
 * @param {string|undefined} params.txtValue - TXT value for CNAME verification
 */
async function updateSubdomain(fastify, params) {
  const { recordId, subdomain, domain, recordValue, recordType, txtValue } =
    params;

  const connection = await fastify.mysql.getConnection();
  try {
    await connection.beginTransaction();

    // Update main record in DB
    await connection.execute(
      "UPDATE subdomains SET record_value = ? WHERE id = ?",
      [recordValue, recordId]
    );

    // Handle TXT record in DB
    if (recordType === "CNAME" && typeof txtValue !== "undefined") {
      const hostPrefix = "_vercel";
      if (txtValue) {
        await connection.execute(
          "INSERT INTO subdomain_txt_records (subdomain_id, host_prefix, txt_value) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE txt_value = VALUES(txt_value)",
          [recordId, hostPrefix, txtValue]
        );
      } else {
        await connection.execute(
          "DELETE FROM subdomain_txt_records WHERE subdomain_id = ? AND host_prefix = ?",
          [recordId, hostPrefix]
        );
      }
    }

    // BIND9: update main record
    await bindService.updateDnsRecord(subdomain, recordValue, domain, recordType);

    // BIND9: handle TXT record
    if (recordType === "CNAME" && typeof txtValue !== "undefined") {
      const hostPrefix = "_vercel";
      if (txtValue) {
        await bindService.createOrUpdateTxtRecord(domain, hostPrefix, txtValue);
      } else {
        await bindService.deleteTxtRecord(subdomain, domain, hostPrefix);
      }
    }

    await connection.commit();
    fastify.log.info(`Subdomain updated: ${subdomain}.${domain} (${recordType})`);
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rbErr) {
      fastify.log.error(rbErr, "Rollback failed during subdomain update");
    }
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Delete a subdomain record + associated TXT records (DB + BIND9)
 *
 * @param {object} fastify
 * @param {object} params
 * @param {number} params.recordId - subdomains.id
 * @param {string} params.subdomain
 * @param {string} params.domain
 * @param {string} params.recordType
 */
async function deleteSubdomain(fastify, params) {
  const { recordId, subdomain, domain, recordType } = params;

  const connection = await fastify.mysql.getConnection();
  try {
    // Get associated TXT records before deleting
    const [txtRows] = await connection.execute(
      "SELECT host_prefix FROM subdomain_txt_records WHERE subdomain_id = ?",
      [recordId]
    );

    await connection.beginTransaction();
    await connection.execute(
      "DELETE FROM subdomain_txt_records WHERE subdomain_id = ?",
      [recordId]
    );
    await connection.execute("DELETE FROM subdomains WHERE id = ?", [recordId]);

    // BIND9: delete main record
    await bindService.deleteDnsRecord(subdomain, domain, recordType);

    // BIND9: delete TXT records
    for (const txt of txtRows) {
      await bindService.deleteTxtRecord(subdomain, domain, txt.host_prefix);
    }

    await connection.commit();
    fastify.log.info(`Subdomain deleted: ${subdomain}.${domain} (${recordType})`);
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rbErr) {
      fastify.log.error(rbErr, "Rollback failed during subdomain deletion");
    }
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  createSubdomain,
  updateSubdomain,
  deleteSubdomain,
};
