// server.js
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
const config = require("./config");
const cfService = require("./services/cloudflare");

// POST /api/subdomains
fastify.post("/api/subdomains", async (request, reply) => {
  const { subdomain, ip } = request.body;
  if (!subdomain || !ip) {
    return reply.code(400).send({ error: "subdomain and ip are required" });
  }

  try {
    const existingRecord = await cfService.findDnsRecord(subdomain);

    if (existingRecord) {
      fastify.log.warn(`Subdomain already exists: ${subdomain}`);
      return reply.code(409).send({ error: "Already exist. Try another one." });
    }

    const newRecord = await cfService.createDnsRecord(subdomain, ip);
    fastify.log.info(`New subdomain created: ${newRecord.name}`);

    return reply.code(201).send({
      success: true,
      domain: newRecord.name,
      ip: newRecord.content,
    });
  } catch (error) {
    fastify.log.error(error, "Failed to process subdomain creation");
    return reply.code(500).send({ error: "Internal Server Error" });
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
