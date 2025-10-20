const path = require("path");

const fastify = require("fastify")({
  logger: {
    transport: {
      target: "pino-pretty",
      options: {
        translateTime: "SYS:yyyy-mm-dd HH:MM:ss",
        ignore: "pid,hostname",
      },
    },
  },
});
const config = require("./configs/index");
const cfService = require("./services/cloudflare");
const fileDbService = require("./services/fileDataBase");

// static file
fastify.register(require("@fastify/static"), {
  root: path.join(__dirname, "public"),
  prefix: "/",
});

// POST /api/subdomains
fastify.post("/api/subdomains", async (request, reply) => {
  const { subdomain, ip, password } = request.body;

  if (!subdomain || !ip || !password) {
    return reply
      .code(400)
      .send({ error: "subdomain, ip, password are required" });
  }

  try {
    // 1. Cloudflare에 이미 있는지 확인
    const existingCf = await cfService.findDnsRecord(subdomain);
    if (existingCf) {
      return reply
        .code(409)
        .send({ error: "이미 사용 중인 서브도메인입니다." });
    }

    // 우리 db.json에도 있는지 확인 (CF와 동기화가 깨졌을 경우 대비)
    const existingDb = await fileDbService.findRecord(subdomain);
    if (existingDb) {
      return reply
        .code(409)
        .send({ error: "이미 사용 중인 서브도메인입니다." });
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
    return reply.code(500).send({ error: "서버 처리 중 오류가 발생했습니다." });
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
