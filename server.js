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
const cfService = require("./services/cloudflare");
const fileDbService = require("./services/fileDataBase");
const privacyPolicy = require("./configs/privacyPolicy");

const SUBDOMAIN_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const isValidSubdomain = (name) => SUBDOMAIN_REGEX.test(name);

// static file
fastify.register(require("@fastify/static"), {
  root: path.join(__dirname, "public"),
  prefix: "/",
});

// GET /api/stats/active-domains
fastify.get("/api/stats/active-domains", async (request, reply) => {
  try {
    const activeDomains = await cfService.countManagedSubdomains();
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

  if (!subdomain || !isValidSubdomain(subdomain)) {
    return reply.code(400).send({ error: "Invalid subdomain format" });
  }

  try {
    const cfRecord = await cfService.findDnsRecord(subdomain);
    const fileRecord = await fileDbService.findRecord(subdomain);
    const exists = Boolean(cfRecord || fileRecord);

    return reply.code(200).send({
      exists,
      source: cfRecord ? "cloudflare" : fileRecord ? "database" : null,
      ip: cfRecord?.content || fileRecord?.ip || null,
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
  const { subdomain: rawSubdomain, ip, password } = request.body;
  const subdomain =
    typeof rawSubdomain === "string" ? rawSubdomain.trim().toLowerCase() : "";

  if (!subdomain || !ip || !password) {
    return reply
      .code(400)
      .send({ error: "subdomain, ip, password are required" });
  }

  if (!isValidSubdomain(subdomain)) {
    return reply.code(400).send({ error: "Invalid subdomain format" });
  }

  try {
    // 1. Cloudflare에 이미 있는지 확인
    const existingCf = await cfService.findDnsRecord(subdomain);
    if (existingCf) {
      return reply.code(409).send({ error: "Already taken subdomain." });
    }

    // 우리 db.json에도 있는지 확인 (CF와 동기화가 깨졌을 경우 대비)
    const existingDb = await fileDbService.findRecord(subdomain);
    if (existingDb) {
      return reply.code(409).send({ error: "Already taken subdomain." });
    }

    // 2. Cloudflare에 생성
    const newRecord = await cfService.createDnsRecord(subdomain, ip);
    fastify.log.info(`New subdomain created on Cloudflare: ${newRecord.name}`);

    // 3. 파일 DB에 저장
    await fileDbService.addRecord({
      subdomain: subdomain,
      ip: ip,
      password: password,
      cloudflare_id: newRecord.id,
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
  const { ip: newIp, password } = request.body;
  const subdomain = (rawSubdomain || "").trim().toLowerCase();

  if (!subdomain || !isValidSubdomain(subdomain)) {
    return reply.code(400).send({ error: "Invalid subdomain" });
  }

  if (!newIp || !password) {
    return reply.code(400).send({ error: "new ip and password are required" });
  }

  try {
    // 1. 파일 DB에서 레코드 찾기
    const record = await fileDbService.findRecord(subdomain);
    if (!record) {
      return reply.code(404).send({ error: "Could not find the subdomain." });
    }

    // 2. 비밀번호 확인
    if (record.password !== password) {
      return reply.code(401).send({ error: "Password does not match." });
    }

    // 3. Cloudflare IP 업데이트
    await cfService.updateDnsRecord(record.cloudflare_id, newIp);

    // 4. 파일 DB IP 업데이트
    await fileDbService.updateRecordIp(subdomain, newIp);

    fastify.log.info(`Subdomain IP updated: ${subdomain}`);
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
  const { password } = request.body;
  const subdomain = (rawSubdomain || "").trim().toLowerCase();

  if (!subdomain || !isValidSubdomain(subdomain)) {
    return reply.code(400).send({ error: "Invalid subdomain" });
  }

  if (!password) {
    return reply.code(400).send({ error: "password is required" });
  }

  try {
    // 1. DB에서 레코드 찾기
    const record = await fileDbService.findRecord(subdomain);
    if (!record) {
      return reply.code(404).send({ error: "Could not find the subdomain." });
    }

    // 2. 비밀번호 확인
    if (record.password !== password) {
      return reply.code(401).send({ error: "Password does not match." });
    }

    // 3. Cloudflare 레코드 삭제
    await cfService.deleteDnsRecord(record.cloudflare_id);

    // 4. 파일 DB 레코드 삭제
    await fileDbService.deleteRecord(subdomain);

    fastify.log.info(`Subdomain deleted: ${subdomain}`);
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
