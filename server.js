const path = require("path");

const fastify = require("fastify")({
  disableRequestLogging: true,
  trustProxy: true,
  logger: {
    transport: {
      target: "pino-pretty",
      options: {
        ignore: "pid,hostname",
      },
    },
  },
});
const config = require("./configs/index");
const bindService = require("./services/bind");
const fileDbService = require("./services/fileDataBase");
const privacyPolicy = require("./configs/privacyPolicy");

const SUBDOMAIN_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const isValidSubdomain = (name) => SUBDOMAIN_REGEX.test(name);
const VALID_DOMAINS = ["sitey.one", "sitey.my", "sitey.lol"];

// static file
fastify.register(require("@fastify/static"), {
  root: path.join(__dirname, "public"),
  prefix: "/",
});

// GET /api/stats/active-domains
fastify.get("/api/stats/active-domains", async (request, reply) => {
  try {
    const activeDomains = await bindService.countManagedSubdomains();
    return reply.code(200).send({ activeDomains });
  } catch (error) {
    fastify.log.error(error, "Failed to load active domain stats");
    return reply.code(500).send({ error: "Error loading active domains" });
  }
});

// GET /api/policies/privacy
fastify.get("/api/policies/privacy", async (request, reply) => {
  try {
    return reply
      .code(200)
      .header("Cache-Control", "public, max-age=3600")
      .send(privacyPolicy);
  } catch (error) {
    fastify.log.error(error, "Failed to load privacy policy");
    return reply.code(500).send({ error: "Error loading privacy policy" });
  }
});

fastify.addHook("onResponse", (request, reply, done) => {
  const forwarded = request.headers["x-forwarded-for"];
  const remoteAddress =
    request.headers["cf-connecting-ip"] ||
    (forwarded ? forwarded.split(",")[0].trim() : null) ||
    request.headers["x-real-ip"] ||
    request.raw.socket?.remoteAddress ||
    request.ip;
  const url = request.raw.url;
  fastify.log.info(` ${url} | ${remoteAddress}`);
  done();
});

// GET /api/subdomains/:subdomain
fastify.get("/api/subdomains/:subdomain", async (request, reply) => {
  const { subdomain: rawSubdomain } = request.params;
  const subdomain = (rawSubdomain || "").trim().toLowerCase();

  const { domain } = request.query;

  if (
    !subdomain ||
    !isValidSubdomain(subdomain) ||
    !domain ||
    !VALID_DOMAINS.includes(domain)
  ) {
    return reply
      .code(400)
      .send({ error: "Invalid subdomain or domain format" });
  }

  try {
    const bindRecordExists = await bindService.findDnsRecord(subdomain, domain);
    const fileRecord = await fileDbService.findRecord(subdomain, domain);
    const exists = Boolean(bindRecordExists || fileRecord);

    return reply.code(200).send({
      exists,
      source: bindRecordExists ? "bind9" : fileRecord ? "database" : null,
      ip: fileRecord?.ip || null,
    });
  } catch (error) {
    fastify.log.error(error, "Failed to check subdomain existence");
    return reply.code(500).send({ error: "Error checking subdomain" });
  }
});

// POST /api/subdomains/:subdomain/verify
fastify.post("/api/subdomains/:subdomain/verify", async (request, reply) => {
  const { subdomain: rawSubdomain } = request.params;
  const { password } = request.body || {};
  const subdomain = (rawSubdomain || "").trim().toLowerCase();

  if (!subdomain || !isValidSubdomain(subdomain) || !password) {
    return reply
      .code(400)
      .send({ error: "subdomain and password are required" });
  }

  try {
    const record = await fileDbService.findRecord(subdomain);
    if (!record) {
      return reply.code(404).send({ error: "Could not find the subdomain" });
    }

    if (record.password !== password) {
      return reply.code(401).send({ error: "Password does not match" });
    }

    return reply.code(200).send({
      success: true,
      subdomain: record.subdomain,
      ip: record.ip,
    });
  } catch (error) {
    fastify.log.error(error, "Failed to verify subdomain password");
    return reply.code(500).send({ error: "Error verifying password" });
  }
});
// POST /api/subdomains
fastify.post("/api/subdomains", async (request, reply) => {
  const { subdomain: rawSubdomain, ip, password, domain } = request.body;
  const subdomain =
    typeof rawSubdomain === "string" ? rawSubdomain.trim().toLowerCase() : "";

  if (
    !subdomain ||
    !ip ||
    !password ||
    !domain ||
    !VALID_DOMAINS.includes(domain)
  ) {
    return reply
      .code(400)
      .send({ error: "subdomain, ip, password, domain are required" });
  }

  if (!isValidSubdomain(subdomain)) {
    return reply.code(400).send({ error: "Invalid subdomain format" });
  }

  try {
    // 1. BIND9 확인
    const existingBind = await bindService.findDnsRecord(subdomain, domain);
    if (existingBind) {
      return reply.code(409).send({ error: "Already taken subdomain." });
    }

    // 2. 파일 확인
    const existingDb = await fileDbService.findRecord(subdomain, domain);
    if (existingDb) {
      return reply.code(409).send({ error: "Already taken subdomain." });
    }

    // 3. BIND9 레코드 생성
    const newRecord = await bindService.createDnsRecord(subdomain, ip, domain);
    fastify.log.info(`New subdomain created in BIND: ${newRecord.name}`);

    // 4. 파일 저장
    await fileDbService.addRecord({
      subdomain: subdomain,
      domain: domain,
      ip: ip,
      password: password,
    });

    return reply.code(201).send({
      success: true,
      domain: newRecord.name,
      ip: newRecord.content,
      message:
        "Success! Please save your password. You will need it to modify or delete this.",
    });
  } catch (error) {
    fastify.log.error(error, "Failed to process subdomain creation");
    return reply
      .code(500)
      .send({ error: "Server error during subdomain creation" });
  }
});

// PUT /api/subdomains/:subdomain
fastify.put("/api/subdomains/:subdomain", async (request, reply) => {
  const { subdomain: rawSubdomain } = request.params;
  const { ip: newIp, password, domain } = request.body;
  const subdomain = (rawSubdomain || "").trim().toLowerCase();

  if (!subdomain || !isValidSubdomain(subdomain)) {
    return reply.code(400).send({ error: "Invalid subdomain" });
  }

  if (!newIp || !password) {
    return reply.code(400).send({ error: "new ip and password are required" });
  }
  try {
    // 1. 파일에서 레코드 찾기
    const record = await fileDbService.findRecord(subdomain, domain);
    if (!record) {
      return reply.code(404).send({ error: "Could not find the subdomain." });
    }

    // 2. 비밀번호 확인
    if (record.password !== password) {
      return reply.code(401).send({ error: "Password does not match." });
    }

    // 3. BIND9 IP 업데이트
    await bindService.updateDnsRecord(subdomain, newIp, domain);

    // 4. 파일 IP 업데이트
    await fileDbService.updateRecordIp(subdomain, newIp, domain);

    fastify.log.info(`Subdomain IP updated: ${subdomain}.${domain}`);
    return reply
      .code(200)
      .send({ success: true, message: "Subdomain IP updated successfully." });
  } catch (error) {
    fastify.log.error(error, "Failed to update subdomain");
    return reply
      .code(500)
      .send({ error: "Server error during subdomain update" });
  }
});

// DELETE /api/subdomains/:subdomain
fastify.delete("/api/subdomains/:subdomain", async (request, reply) => {
  const { subdomain: rawSubdomain } = request.params;
  const { password, domain } = request.body;
  const subdomain = (rawSubdomain || "").trim().toLowerCase();

  if (!subdomain || !isValidSubdomain(subdomain)) {
    return reply.code(400).send({ error: "Invalid subdomain" });
  }

  if (!password) {
    return reply.code(400).send({ error: "password is required" });
  }
  try {
    // 1.  레코드 찾기
    const record = await fileDbService.findRecord(subdomain, domain);
    if (!record) {
      return reply.code(404).send({ error: "Could not find the subdomain." });
    }

    // 2. 비밀번호 확인
    if (record.password !== password) {
      return reply.code(401).send({ error: "Password does not match." });
    }

    // 3. BIND9 레코드 삭제
    await bindService.deleteDnsRecord(subdomain, domain);

    // 4. 파일  레코드 삭제
    await fileDbService.deleteRecord(subdomain, domain);

    fastify.log.info(`Subdomain deleted: ${subdomain}.${domain}`);
    return reply.code(200).send({
      success: true,
      message: "Subdomain deleted successfully.",
    });
  } catch (error) {
    fastify.log.error(error, "Failed to delete subdomain");
    return reply
      .code(500)
      .send({ error: "Server error during subdomain deletion" });
  }
});

const start = async () => {
  try {
    await fastify.listen({
      port: config.server.port,
      host: config.server.host,
    });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
