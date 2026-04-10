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
fastify.register(require("./plugins/validation-scheduler"));
fastify.register(require("@fastify/rate-limit"), {
  global: true,
  max: 100,
  timeWindow: "1 minute",
  keyGenerator: (request) =>
    request.headers["cf-connecting-ip"] ||
    request.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    request.ip,
});
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

// 3. Set not-found handler for client-side routing
fastify.setNotFoundHandler((request, reply) => {
  // For GET requests that are not API calls, serve index.html
  if (request.method === 'GET' && !request.url.startsWith('/api')) {
    return reply.sendFile('index.html');
  }
  // For other cases, send a 404
  reply.code(404).send({ error: 'Not Found' });
});

// 4. /api/* requests are handled by routes/index.js
fastify.register(apiRoutes, { prefix: "/api" });

// --- 5. Start server ---
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
