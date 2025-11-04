// routes/index.js
const userRoutes = require("./user.js");
const domainRoutes = require("./domain.js");
const privacyPolicy = require("../configs/privacyPolicy");

/**
 * Main plugin that wires up all /api routes
 */
async function apiRoutes(fastify, options) {
  // 1. Register /api/auth/* routes
  fastify.register(userRoutes, { prefix: "/auth" });

  // 2. Register domain-related /api/* routes
  fastify.register(domainRoutes);

  // 3. Register /api/policies/privacy route
  fastify.get("/policies/privacy", async (request, reply) => {
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
}

module.exports = apiRoutes;
