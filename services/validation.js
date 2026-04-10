const net = require("net");
const dns = require("dns/promises");
const bindService = require("./bind");
const { sendValidationWarningEmail } = require("./email");
const config = require("../configs/index");

/**
 * TCP connect check for A record validation
 */
function checkTcpReachable(ip, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, ip);
  });
}

/**
 * Validate A record: TCP connect on port 80, fallback to 443
 */
async function validateARecord(ip) {
  const timeout = config.validation.tcpTimeoutMs;
  if (await checkTcpReachable(ip, 80, timeout)) return true;
  if (await checkTcpReachable(ip, 443, timeout)) return true;
  return false;
}

/**
 * Validate CNAME record: DNS resolve
 */
async function validateCnameRecord(hostname) {
  try {
    const addresses = await dns.resolve(hostname);
    return addresses.length > 0;
  } catch {
    return false;
  }
}

/**
 * Validate a record based on its type
 */
async function validateRecord(recordType, recordValue) {
  if (recordType === "A") return validateARecord(recordValue);
  if (recordType === "CNAME") return validateCnameRecord(recordValue);
  return true;
}

/**
 * Run concurrency-limited async tasks
 */
async function processWithConcurrency(items, concurrency, fn) {
  const results = [];
  let failCount = 0;
  let index = 0;

  async function next() {
    const i = index++;
    if (i >= items.length) return;
    try {
      await fn(items[i]);
    } catch {
      failCount++;
    }
    await next();
  }

  const workers = [];
  for (let w = 0; w < Math.min(concurrency, items.length); w++) {
    workers.push(next());
  }
  await Promise.all(workers);

  return { total: items.length, failCount };
}

/**
 * Remove a subdomain record (reuses existing DELETE pattern)
 * DB first (transaction) → BIND9 → commit/rollback
 */
async function removeSubdomainRecord(fastify, record) {
  const connection = await fastify.mysql.getConnection();
  try {
    const [txtRows] = await connection.execute(
      "SELECT host_prefix FROM subdomain_txt_records WHERE subdomain_id = ?",
      [record.id]
    );

    await connection.beginTransaction();
    await connection.execute(
      "DELETE FROM subdomain_txt_records WHERE subdomain_id = ?",
      [record.id]
    );
    await connection.execute("DELETE FROM subdomains WHERE id = ?", [
      record.id,
    ]);

    await bindService.deleteDnsRecord(
      record.subdomain,
      record.domain_name,
      bindService.normalizeRecordType(record.record_type)
    );

    for (const txt of txtRows) {
      await bindService.deleteTxtRecord(
        record.subdomain,
        record.domain_name,
        txt.host_prefix
      );
    }

    await connection.commit();
    return true;
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rbErr) {
      fastify.log.error(rbErr, "Rollback failed during validation cleanup");
    }
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Handle validation result for a single record
 */
async function handleValidationResult(fastify, record, isValid) {
  if (isValid) {
    // Reset warning if previously warned
    if (record.warning_count > 0) {
      await fastify.mysql.execute(
        "UPDATE subdomains SET warning_count = 0, last_checked_at = NOW() WHERE id = ?",
        [record.id]
      );
      fastify.log.info(
        `Validation recovered: ${record.subdomain}.${record.domain_name}`
      );
    } else {
      await fastify.mysql.execute(
        "UPDATE subdomains SET last_checked_at = NOW() WHERE id = ?",
        [record.id]
      );
    }
    return;
  }

  // Validation failed
  if (record.warning_count === 0) {
    // First failure: set warning
    await fastify.mysql.execute(
      "UPDATE subdomains SET warning_count = 1, last_warning_at = NOW(), last_checked_at = NOW() WHERE id = ?",
      [record.id]
    );
    fastify.log.warn(
      `Validation warning (1st): ${record.subdomain}.${record.domain_name} → ${record.record_value}`
    );
  } else {
    // Second failure: send email + delete
    fastify.log.warn(
      `Validation failed (2nd): deleting ${record.subdomain}.${record.domain_name}`
    );

    // Try to send warning email (failure doesn't block deletion)
    try {
      const [userRows] = await fastify.mysql.execute(
        "SELECT email FROM users WHERE id = ?",
        [record.user_id]
      );
      if (userRows[0]) {
        await sendValidationWarningEmail(userRows[0].email, {
          subdomain: record.subdomain,
          domain: record.domain_name,
          recordType: record.record_type,
          recordValue: record.record_value,
        });
      }
    } catch (emailErr) {
      fastify.log.error(
        emailErr,
        `Failed to send warning email for ${record.subdomain}.${record.domain_name}`
      );
    }

    // Delete record regardless of email result
    await removeSubdomainRecord(fastify, record);
    fastify.log.info(
      `Deleted invalid record: ${record.subdomain}.${record.domain_name}`
    );
  }
}

/**
 * Main periodic validation job
 */
async function runPeriodicValidation(fastify) {
  if (config.bind.devMode) {
    fastify.log.info("Skipping periodic validation in dev mode");
    return;
  }

  const { batchSize, concurrency } = config.validation;
  let offset = 0;
  let totalChecked = 0;
  let totalFailed = 0;

  fastify.log.info("Starting periodic DNS validation...");

  while (true) {
    const [rows] = await fastify.mysql.query(
      `SELECT s.id, s.subdomain, s.record_value, s.record_type,
              s.warning_count, s.user_id, m.domain_name
       FROM subdomains s
       JOIN managed_domains m ON s.domain_id = m.id
       ORDER BY s.id
       LIMIT ${Number(batchSize)} OFFSET ${Number(offset)}`
    );

    if (rows.length === 0) break;

    let batchFailCount = 0;

    await processWithConcurrency(rows, concurrency, async (record) => {
      const isValid = await validateRecord(
        bindService.normalizeRecordType(record.record_type),
        record.record_value
      );

      if (!isValid) batchFailCount++;

      try {
        await handleValidationResult(fastify, record, isValid);
      } catch (err) {
        fastify.log.error(
          err,
          `Validation handling failed for ${record.subdomain}.${record.domain_name}`
        );
      }
    });

    totalChecked += rows.length;
    totalFailed += batchFailCount;

    // Circuit breaker: if >80% of batch failed, likely network issue
    const failRate = batchFailCount / rows.length;
    if (failRate > 0.8) {
      fastify.log.error(
        `Circuit breaker triggered: ${batchFailCount}/${rows.length} failed in batch. Stopping validation.`
      );
      break;
    }

    offset += batchSize;

    // Delay between batches to reduce load
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  fastify.log.info(
    `Periodic validation complete: ${totalChecked} checked, ${totalFailed} failed`
  );
}

module.exports = {
  validateARecord,
  validateCnameRecord,
  validateRecord,
  runPeriodicValidation,
};
