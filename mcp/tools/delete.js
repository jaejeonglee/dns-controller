const { z } = require("zod");
const api = require("../lib/api-client");

module.exports = function registerDelete(server, apiKey) {
  server.tool(
    "delete_subdomain",
    "Delete an existing subdomain DNS record",
    {
      subdomain: z.string().describe("Subdomain to delete"),
      domain: z.string().describe("Root domain (e.g. sitey.one)"),
    },
    async ({ subdomain, domain }) => {
      try {
        const data = await api.del(`/subdomains/${subdomain}/${domain}`, apiKey);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: err.message || "Failed to delete subdomain" }], isError: true };
      }
    }
  );
};
