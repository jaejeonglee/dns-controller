const fs = require("fs").promises;
const util = require("util");
const exec = util.promisify(require("child_process").exec);
const config = require("../configs/index");

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

/**
 * Check if a subdomain A record exists
 */
async function findDnsRecord(subdomain, domain) {
  const zoneFilePath = getZoneFilePath(domain);
  const data = await fs.readFile(zoneFilePath, "utf8");
  const regex = new RegExp(`^${subdomain}\\s+IN\\s+A\\s+`, "i");
  return data.split("\n").some((line) => regex.test(line.trim()));
}

/**
 * Add a new A record
 */
async function createDnsRecord(subdomain, ip, domain) {
  const zoneFilePath = getZoneFilePath(domain);
  const newRecord = `\n${subdomain}    IN      A       ${ip}`;

  // 1. Append A record entry
  await fs.appendFile(zoneFilePath, newRecord);

  // 2. Increment serial number
  await incrementSerial(zoneFilePath);

  // 3. Reload BIND9
  await reloadBind(domain, zoneFilePath);
  return { name: `${subdomain}.${domain}`, content: ip };
}

/**
 * Update an existing A record IP
 */
async function updateDnsRecord(subdomain, newIp, domain) {
  const zoneFilePath = getZoneFilePath(domain);
  let fileContent = await fs.readFile(zoneFilePath, "utf8");
  const regex = new RegExp(`^(${subdomain}\\s+IN\\s+A\\s+)(.*)$`, "im");

  if (!regex.test(fileContent)) {
    throw new Error("Subdomain A record not found in zone file.");
  }

  // 1. Update IP address
  fileContent = fileContent.replace(regex, `$1${newIp}`);
  await fs.writeFile(zoneFilePath, fileContent);

  // 2. Increment serial number
  await incrementSerial(zoneFilePath);

  // 3. Reload BIND9
  await reloadBind(domain, zoneFilePath);
  return { name: `${subdomain}.${domain}`, content: newIp };
}

/**
 * Remove an existing A record
 */
async function deleteDnsRecord(subdomain, domain) {
  const zoneFilePath = getZoneFilePath(domain);
  let fileContent = await fs.readFile(zoneFilePath, "utf8");
  const regex = new RegExp(`^${subdomain}\\s+IN\\s+A\\s+.*\\n?`, "im");

  if (!regex.test(fileContent)) {
    throw new Error("Subdomain A record not found in zone file.");
  }

  // 1. Remove A record line
  fileContent = fileContent.replace(regex, "");
  await fs.writeFile(zoneFilePath, fileContent);

  // 2. Increment serial number
  await incrementSerial(zoneFilePath);

  // 3. Reload BIND9
  await reloadBind(domain, zoneFilePath);
  return { name: `${subdomain}.${domain}` };
}

module.exports = {
  findDnsRecord,
  createDnsRecord,
  updateDnsRecord,
  deleteDnsRecord,
};
