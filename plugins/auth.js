// plugins/auth.js
const fp = require("fastify-plugin");
const fastifyJwt = require("fastify-jwt");
const bcrypt = require("bcrypt");
const config = require("../configs/index");

async function authPlugin(fastify, options) {
  fastify.register(fastifyJwt, {
    secret: config.jwt.secret,
  });

  fastify.decorate("bcrypt", bcrypt);

  fastify.decorate("authenticate", async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.code(401).send({
        error: "Unauthorized",
        message: "Authentication token is invalid.",
      });
    }
  });
}

module.exports = fp(authPlugin);
