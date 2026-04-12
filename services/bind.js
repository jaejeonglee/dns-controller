const fs = require("fs").promises;
const util = require("util");
const execFile = util.promisify(require("child_process").execFile);
const config = require("../configs/index");

let logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, fatal: () => {} };
function setLogger(l) { logger = l; }

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
    await execFile("named-checkconf", []);
    await execFile("named-checkzone", [domain, zoneFilePath]);
    await execFile("systemctl", ["reload", "named"]);
  } catch (error) {
    logger.error({ err: error }, "BIND reload failed");
    throw Object.assign(new Error("Failed to reload BIND9 service."), { cause: error });
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
      // Dev mode already returns false before reaching fs.readFile (line 96).
      // In production, missing zone file is a hard error (fail-close).
      throw new Error("Zone file not found for " + domain + " at " + zoneFilePath + ". Check BIND_DB_PATH and zone file permissions.");
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
      logger.debug({ op: "createDnsRecord", subdomain, domain, type }, "BIND_DEV_MODE skip");
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
      logger.debug({ op: "updateDnsRecord", subdomain, domain, type }, "BIND_DEV_MODE skip");
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
      logger.debug({ op: "deleteDnsRecord", subdomain, domain, type }, "BIND_DEV_MODE skip");
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
      return { name: `${subdomain}.${domain}`, type, alreadyAbsent: true };
    }

    fileContent = fileContent.replace(regex, "");
    await fs.writeFile(zoneFilePath, fileContent);
    await incrementSerial(zoneFilePath);
    await reloadBind(domain, zoneFilePath);

    return { name: `${subdomain}.${domain}`, type };
  });
}

async function createOrUpdateTxtRecord(domain, hostPrefix, txtValue) {
  return withDomainLock(domain, async () => {
    const zoneFilePath = getZoneFilePath(domain);
    const recordName = hostPrefix; // dig TXT _vercel.sitey.one 시 value list가 추출되어야하기 때문에 subdomain이 아닌 hostPrefix 기준으로 레코드 생성
    const recordContent = `"${txtValue}"`;
    const newRecordLine = `${recordName}\tIN\tTXT\t${recordContent}`;

    if (isBindDevMode) {
      logger.debug({ op: "createOrUpdateTxtRecord", recordName, domain }, "BIND_DEV_MODE skip");
      return { name: `${recordName}.${domain}`, content: txtValue };
    }

    let fileContent;
    try {
      fileContent = await fs.readFile(zoneFilePath, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") {
        throw new Error(
          `Zone file not found at ${zoneFilePath}. Enable BIND_DEV_MODE=true for local dev.`
        );
      }
      throw error;
    }

    const escapedName = escapeRegex(recordName);
    const regex = new RegExp(
      `^(${escapedName}\\s+IN\\s+TXT\\s+)(?:".*")$`,
      "im"
    );

    if (regex.test(fileContent)) {
      // Update existing record
      fileContent = fileContent.replace(regex, `$1${recordContent}`);
    } else {
      // Add new record
      fileContent += `\n${newRecordLine}`;
    }

    await fs.writeFile(zoneFilePath, fileContent);
    await incrementSerial(zoneFilePath);
    await reloadBind(domain, zoneFilePath);

    return { name: `${recordName}.${domain}`, content: txtValue };
  });
}

/**
 * Read a single DNS record value (A or CNAME)
 */
async function readDnsRecord(subdomain, domain, recordType) {
  if (isBindDevMode) {
    return null;
  }

  const zoneFilePath = getZoneFilePath(domain);
  let data;
  try {
    data = await fs.readFile(zoneFilePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error("Zone file not found for " + domain + " at " + zoneFilePath + ". Check BIND_DB_PATH and zone file permissions.");
    }
    throw error;
  }

  const escapedName = escapeRegex(subdomain);
  const type = normalizeRecordType(recordType);
  const regex = new RegExp(`^${escapedName}\\s+IN\\s+${escapeRegex(type)}\\s+(\\S+.*)$`, "im");
  const match = data.match(regex);
  if (!match) {
    return null;
  }
  return { name: subdomain, type, value: match[1].trim() };
}

/**
 * List all A and CNAME records from a domain's zone file
 */
async function listDnsRecords(domain) {
  if (isBindDevMode) {
    return [];
  }

  return withDomainLock(domain, async () => {
    const zoneFilePath = getZoneFilePath(domain);
    let data;
    try {
      data = await fs.readFile(zoneFilePath, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") {
        throw new Error("Zone file not found for " + domain + " at " + zoneFilePath + ". Check BIND_DB_PATH and zone file permissions.");
      }
      throw error;
    }

    const results = [];
    const regex = /^(\S+)\s+IN\s+(A|CNAME)\s+(\S+.*)$/gim;
    let match;
    while ((match = regex.exec(data)) !== null) {
      results.push({
        name: match[1],
        type: match[2].toUpperCase(),
        value: match[3].trim(),
      });
    }
    return results;
  });
}

async function deleteTxtRecord(subdomain, domain, hostPrefix) {
  return withDomainLock(domain, async () => {
    const zoneFilePath = getZoneFilePath(domain);
    const recordName = hostPrefix ? `${hostPrefix}.${subdomain}` : subdomain;

    if (isBindDevMode) {
      logger.debug({ op: "deleteTxtRecord", recordName, domain }, "BIND_DEV_MODE skip");
      return { name: `${recordName}.${domain}` };
    }

    let fileContent;
    try {
      fileContent = await fs.readFile(zoneFilePath, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") {
        // If the file doesn't exist, there's nothing to delete.
        return { name: `${recordName}.${domain}` };
      }
      throw error;
    }

    const escapedName = escapeRegex(recordName);
    const regex = new RegExp(`^${escapedName}\\s+IN\\s+TXT\\s+.*\\n?`, "im");

    if (!regex.test(fileContent)) {
      // Record not found, consider it a success
      return { name: `${recordName}.${domain}` };
    }

    fileContent = fileContent.replace(regex, "");
    await fs.writeFile(zoneFilePath, fileContent);
    await incrementSerial(zoneFilePath);
    await reloadBind(domain, zoneFilePath);

    return { name: `${recordName}.${domain}` };
  });
}

module.exports = {
  setLogger,
  findDnsRecord,
  readDnsRecord,
  listDnsRecords,
  createDnsRecord,
  updateDnsRecord,
  deleteDnsRecord,
  normalizeRecordType,
  createOrUpdateTxtRecord,
  deleteTxtRecord,
};
