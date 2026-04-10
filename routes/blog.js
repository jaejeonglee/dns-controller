const { loadPost, listPosts } = require("../services/blog");

async function blogRoutes(fastify, options) {
  // GET /api/blog?lang=en
  fastify.get("/blog", async (request, reply) => {
    const lang = request.query.lang || "en";
    try {
      const posts = await listPosts(lang);
      return reply
        .header("Cache-Control", "public, max-age=300")
        .send({ posts });
    } catch (error) {
      fastify.log.error(error, "Failed to list blog posts");
      return reply.code(500).send({ error: "Failed to load blog posts" });
    }
  });

  // GET /api/blog/:slug?lang=en
  fastify.get("/blog/:slug", async (request, reply) => {
    const { slug } = request.params;
    const lang = request.query.lang || "en";

    try {
      const post = await loadPost(slug, lang);
      return reply
        .header("Cache-Control", "public, max-age=300")
        .send(post);
    } catch (error) {
      if (error.statusCode === 404) {
        return reply.code(404).send({ error: "Post not found" });
      }
      if (error.statusCode === 400) {
        return reply.code(400).send({ error: error.message });
      }
      fastify.log.error(error, "Failed to load blog post");
      return reply.code(500).send({ error: "Failed to load blog post" });
    }
  });
}

module.exports = blogRoutes;
