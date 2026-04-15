// routes/api-key.js
const apiKeyService = require("../services/api-key");

async function apiKeyRoutes(fastify, options) {
  // POST /api/keys — create new API key (requires web auth)
  fastify.post(
    "/keys",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const userId = request.user.id;
      const { name } = request.body || {};

      try {
        const result = await apiKeyService.createKey(
          fastify,
          userId,
          name || "default"
        );
        return reply.code(201).send({
          success: true,
          key: result.key,
          prefix: result.prefix,
          name: result.name,
          message: "Save this key now. It will not be shown again.",
        });
      } catch (error) {
        if (error.statusCode === 400) {
          return reply.code(400).send({ error: error.message });
        }
        fastify.log.error(error, "Failed to create API key");
        return reply.code(500).send({ error: "Failed to create API key" });
      }
    }
  );

  // GET /api/keys — list my keys
  fastify.get(
    "/keys",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const userId = request.user.id;
      try {
        const keys = await apiKeyService.listKeys(fastify, userId);
        return reply.code(200).send({ keys });
      } catch (error) {
        fastify.log.error(error, "Failed to list API keys");
        return reply.code(500).send({ error: "Failed to list API keys" });
      }
    }
  );

  // DELETE /api/keys/:id — delete a key
  fastify.delete(
    "/keys/:id",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const userId = request.user.id;
      const keyId = Number(request.params.id);

      if (!Number.isInteger(keyId) || keyId <= 0) {
        return reply.code(400).send({ error: "Invalid key ID" });
      }

      try {
        await apiKeyService.deleteKey(fastify, userId, keyId);
        return reply.code(200).send({ success: true, message: "API key deleted." });
      } catch (error) {
        if (error.statusCode === 404) {
          return reply.code(404).send({ error: error.message });
        }
        fastify.log.error(error, "Failed to delete API key");
        return reply.code(500).send({ error: "Failed to delete API key" });
      }
    }
  );
}

module.exports = apiKeyRoutes;
