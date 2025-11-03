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

// BIND9 리로드
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
 * Serial 번호 관리
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
 * 서브도메인 존재여부 확인
 */
async function findDnsRecord(subdomain, domain) {
  const zoneFilePath = getZoneFilePath(domain);
  const data = await fs.readFile(zoneFilePath, "utf8");
  const regex = new RegExp(`^${subdomain}\\s+IN\\s+A\\s+`, "i");
  return data.split("\n").some((line) => regex.test(line.trim()));
}

/**
 * A 레코드 추가
 */
async function createDnsRecord(subdomain, ip, domain) {
  const zoneFilePath = getZoneFilePath(domain);
  const newRecord = `\n${subdomain}    IN      A       ${ip}`;

  // 1. A 레코드 추가
  await fs.appendFile(zoneFilePath, newRecord);

  // 2. Serial 번호 증가
  await incrementSerial(zoneFilePath);

  // 3. BIND9 리로드
  await reloadBind(domain, zoneFilePath);
  return { name: `${subdomain}.${domain}`, content: ip };
}

/**
 * 기존 A 레코드의 IP 수정
 */
async function updateDnsRecord(subdomain, newIp, domain) {
  const zoneFilePath = getZoneFilePath(domain);
  let fileContent = await fs.readFile(zoneFilePath, "utf8");
  const regex = new RegExp(`^(${subdomain}\\s+IN\\s+A\\s+)(.*)$`, "im");

  if (!regex.test(fileContent)) {
    throw new Error("Subdomain A record not found in zone file.");
  }

  // 1. IP 주소 변경
  fileContent = fileContent.replace(regex, `$1${newIp}`);
  await fs.writeFile(zoneFilePath, fileContent);

  // 2. Serial 번호 증가
  await incrementSerial(zoneFilePath);

  // 3. BIND9 리로드
  await reloadBind(domain, zoneFilePath);
  return { name: `${subdomain}.${domain}`, content: newIp };
}

/**
 * 기존 A 레코드 삭제
 */
async function deleteDnsRecord(subdomain, domain) {
  const zoneFilePath = getZoneFilePath(domain);
  let fileContent = await fs.readFile(zoneFilePath, "utf8");
  const regex = new RegExp(`^${subdomain}\\s+IN\\s+A\\s+.*\\n?`, "im");

  if (!regex.test(fileContent)) {
    throw new Error("Subdomain A record not found in zone file.");
  }

  // 1. A 레코드 라인 삭제
  fileContent = fileContent.replace(regex, "");
  await fs.writeFile(zoneFilePath, fileContent);

  // 2. Serial 번호 증가
  await incrementSerial(zoneFilePath);

  // 3. BIND9 리로드
  await reloadBind(domain, zoneFilePath);
  return { name: `${subdomain}.${domain}` };
}

/**
 * 도메인 개수 조회
 */
async function countManagedSubdomains() {
  const domains = ["sitey.one", "sitey.my"];
  let total = 0;
  for (const domain of domains) {
    const zoneFilePath = getZoneFilePath(domain);
    const data = await fs.readFile(zoneFilePath, "utf8");
    const count = (data.match(/IN\s+A/g) || []).length;
    total += count > 4 ? count - 4 : 0;
  }
  return total;
}

module.exports = {
  findDnsRecord,
  createDnsRecord,
  updateDnsRecord,
  deleteDnsRecord,
  countManagedSubdomains,
};
