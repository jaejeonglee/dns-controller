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
const apiRoutes = require("./routes/index");

// --- 1. Register plugins ---
fastify.register(require("./plugins/db"));
fastify.register(require("./plugins/auth"));
fastify.register(require("@fastify/static"), {
  root: path.join(__dirname, "public"),
  prefix: "/",
});

// --- 2. onResponse hook (logging) ---
fastify.addHook("onResponse", (request, reply, done) => {
  const url = request.raw.url;
  if (url.startsWith("/api")) {
    const forwarded = request.headers["x-forwarded-for"];
    const remoteAddress =
      request.headers["cf-connecting-ip"] ||
      (forwarded ? forwarded.split(",")[0].trim() : null) ||
      request.headers["x-real-ip"] ||
      request.raw.socket?.remoteAddress ||
      request.ip;
    fastify.log.info(` ${url} | ${remoteAddress}`);
  }
  done();
});

// 3. /api/* requests are handled by routes/index.js
fastify.register(apiRoutes, { prefix: "/api" });

// --- 4. Start server ---
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
