const fs = require("fs").promises;
const util = require("util");
const exec = util.promisify(require("child_process").exec);
const config = require("../configs/index");

const isBindDevMode = Boolean(config.bind.devMode);
const domainLocks = new Map();

async function withDomainLock(domain, task) {
  const normalizedDomain = String(domain || "").toLowerCase();
  const previous = domainLocks.get(normalizedDomain) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => (release = resolve));
  domainLocks.set(normalizedDomain, current);
  await previous;
  try {
    return await task();
  } finally {
    release();
    if (domainLocks.get(normalizedDomain) === current) {
      domainLocks.delete(normalizedDomain);
    }
  }
}

// BIND9 zone path
function getZoneFilePath(domain) {
  if (domain.includes("/") || domain.includes("..")) {
    throw new Error("Invalid domain name format");
  }
  return config.bind.zoneFilePath(domain);
}

// Reload BIND9
async function reloadBind(domain, zoneFilePath) {
  try {
    await exec("named-checkconf");
    await exec(`named-checkzone ${domain} ${zoneFilePath}`);
    await exec("systemctl reload named");
  } catch (error) {
    console.error("BIND reload failed:", error);
    throw new Error("Failed to reload BIND9 service.");
  }
}

/**
 * Manage zone file serial number
 */
async function incrementSerial(zoneFilePath) {
  let fileContent = await fs.readFile(zoneFilePath, "utf8");
  const serialRegex = /(\d+)\s+;\s+Serial/;
  const match = fileContent.match(serialRegex);

  if (match) {
    const currentSerial = parseInt(match[1], 10);
    const newSerial = currentSerial + 1;
    fileContent = fileContent.replace(
      serialRegex,
      `${newSerial}         ; Serial`
    );
    await fs.writeFile(zoneFilePath, fileContent);
  } else {
    throw new Error("Could not find or update serial number in zone file.");
  }
}

function escapeRegex(input) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeRecordType(recordType = "A") {
  const upper = String(recordType).trim().toUpperCase();
  if (!["A", "CNAME"].includes(upper)) {
    throw new Error(`Unsupported record type: ${recordType}`);
  }
  return upper;
}

function formatRecordValue(recordType, value) {
  const trimmed = String(value).trim();
  if (recordType === "CNAME") {
    if (!trimmed.endsWith(".")) {
      return `${trimmed}.`;
    }
  }
  return trimmed;
}

/**
 * Check if a subdomain record exists (A or CNAME)
 */
async function findDnsRecord(subdomain, domain, recordType) {
  if (isBindDevMode) {
    return false;
  }

  const zoneFilePath = getZoneFilePath(domain);
  let data;
  try {
    data = await fs.readFile(zoneFilePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      console.warn(
        `Zone file not found for ${domain}. Returning available status (set BIND_DEV_MODE=true to silence this warning).`
      );
      return false;
    }
    throw error;
  }

  const escapedName = escapeRegex(subdomain);
  const typePattern = recordType
    ? escapeRegex(normalizeRecordType(recordType))
    : "(?:A|CNAME)";
  const regex = new RegExp(`^${escapedName}\\s+IN\\s+${typePattern}\\s+`, "im");
  return regex.test(data);
}

/**
 * Add a new DNS record
 */
async function createDnsRecord(subdomain, value, domain, recordType = "A") {
  return withDomainLock(domain, async () => {
    const zoneFilePath = getZoneFilePath(domain);
    const type = normalizeRecordType(recordType);
    const recordValue = formatRecordValue(type, value);
    const newRecord = `\n${subdomain}\tIN\t${type}\t${recordValue}`;

    if (isBindDevMode) {
      console.warn(
        `BIND_DEV_MODE enabled. Skipping zone file write for ${subdomain}.${domain} (${type}).`
      );
    } else {
      try {
        await fs.appendFile(zoneFilePath, newRecord);
      } catch (error) {
        if (error.code === "ENOENT") {
          throw new Error(
            `Zone file not found at ${zoneFilePath}. Create the file or enable BIND_DEV_MODE=true for local development.`
          );
        }
        throw error;
      }
      await incrementSerial(zoneFilePath);
      await reloadBind(domain, zoneFilePath);
    }

    return { name: `${subdomain}.${domain}`, content: recordValue, type };
  });
}

/**
 * Update an existing DNS record value
 */
async function updateDnsRecord(subdomain, newValue, domain, recordType = "A") {
  return withDomainLock(domain, async () => {
    const zoneFilePath = getZoneFilePath(domain);
    const type = normalizeRecordType(recordType);
    const recordValue = formatRecordValue(type, newValue);

    if (isBindDevMode) {
      console.warn(
        `BIND_DEV_MODE enabled. Skipping zone file update for ${subdomain}.${domain} (${type}).`
      );
      return { name: `${subdomain}.${domain}`, content: recordValue, type };
    }

    let fileContent;
    try {
      fileContent = await fs.readFile(zoneFilePath, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") {
        throw new Error(
          `Zone file not found at ${zoneFilePath}. Create the file or enable BIND_DEV_MODE=true for local development.`
        );
      }
      throw error;
    }
    const escapedName = escapeRegex(subdomain);
    const regex = new RegExp(
      `^(${escapedName}\\s+IN\\s+${type}\\s+)(\\S+.*)$`,
      "im"
    );

    if (!regex.test(fileContent)) {
      throw new Error(`${type} record not found in zone file.`);
    }

    fileContent = fileContent.replace(regex, `$1${recordValue}`);
    await fs.writeFile(zoneFilePath, fileContent);
    await incrementSerial(zoneFilePath);
    await reloadBind(domain, zoneFilePath);

    return { name: `${subdomain}.${domain}`, content: recordValue, type };
  });
}

/**
 * Remove an existing DNS record
 */
async function deleteDnsRecord(subdomain, domain, recordType = "A") {
  return withDomainLock(domain, async () => {
    const zoneFilePath = getZoneFilePath(domain);
    const type = normalizeRecordType(recordType);

    if (isBindDevMode) {
      console.warn(
        `BIND_DEV_MODE enabled. Skipping zone file delete for ${subdomain}.${domain} (${type}).`
      );
      return { name: `${subdomain}.${domain}`, type };
    }

    let fileContent;
    try {
      fileContent = await fs.readFile(zoneFilePath, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") {
        throw new Error(
          `Zone file not found at ${zoneFilePath}. Create the file or enable BIND_DEV_MODE=true for local development.`
        );
      }
      throw error;
    }
    const escapedName = escapeRegex(subdomain);
    const regex = new RegExp(
      `^${escapedName}\\s+IN\\s+${type}\\s+.*\\n?`,
      "im"
    );

    if (!regex.test(fileContent)) {
      throw new Error(`${type} record not found in zone file.`);
    }

    fileContent = fileContent.replace(regex, "");
    await fs.writeFile(zoneFilePath, fileContent);
    await incrementSerial(zoneFilePath);
    await reloadBind(domain, zoneFilePath);

    return { name: `${subdomain}.${domain}`, type };
  });
}

module.exports = {
  findDnsRecord,
  createDnsRecord,
  updateDnsRecord,
  deleteDnsRecord,
  normalizeRecordType,
};
