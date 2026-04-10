// plugins/auth.js
const fp = require("fastify-plugin");
const fastifyJwt = require("@fastify/jwt");
const fastifyCookie = require("@fastify/cookie");
const config = require("../configs/index");

const COOKIE_NAME = "sitey_token";

async function authPlugin(fastify, options) {
  fastify.register(fastifyCookie);

  fastify.register(fastifyJwt, {
    secret: config.jwt.secret,
    sign: { algorithm: "HS256", expiresIn: "24h" },
    verify: { algorithms: ["HS256"] },
    cookie: {
      cookieName: COOKIE_NAME,
      signed: false,
    },
  });

  fastify.decorate("COOKIE_NAME", COOKIE_NAME);

  fastify.decorate("authenticate", async (request, reply) => {
    try {
      // Try cookie first, then Authorization header
      const token =
        request.cookies[COOKIE_NAME] ||
        request.headers.authorization?.replace("Bearer ", "");

      if (!token) {
        return reply.code(401).send({
          error: "Unauthorized",
          message: "Authentication required.",
        });
      }

      const decoded = fastify.jwt.verify(token);
      request.user = decoded;

      // Validate session exists and not expired
      if (decoded.sessionId) {
        const [rows] = await fastify.mysql.execute(
          "SELECT 1 FROM user_sessions WHERE id = ? AND user_id = ? AND expires_at > NOW()",
          [decoded.sessionId, decoded.id]
        );
        if (rows.length === 0) {
          return reply.code(401).send({
            error: "Unauthorized",
            message: "Session expired or invalidated.",
          });
        }
      }
    } catch (err) {
      return reply.code(401).send({
        error: "Unauthorized",
        message: "Authentication token is invalid.",
      });
    }
  });
}

module.exports = fp(authPlugin);
