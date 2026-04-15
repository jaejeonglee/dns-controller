const api = require("../lib/api-client");

module.exports = function registerDomains(server, apiKey) {
  server.tool(
    "list_domains",
    "List all available root domains on sitey.one",
    {},
    async () => {
      try {
        const data = await api.get("/domains", apiKey);
        return { content: [{ type: "text", text: JSON.stringify({ domains: data }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: err.message || "Failed to list domains" }], isError: true };
      }
    }
  );
};
