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

module.exports = { getManagedDomains };
