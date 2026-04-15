const { z } = require("zod");
const api = require("../lib/api-client");

module.exports = function registerCheck(server, apiKey) {
  server.tool(
    "check_availability",
    "Check if a subdomain is available on a given root domain",
    {
      subdomain: z.string().describe("Subdomain to check"),
      domain: z.string().describe("Root domain (e.g. sitey.one)"),
    },
    async ({ subdomain, domain }) => {
      try {
        const data = await api.get(`/check/${subdomain}/${domain}`, apiKey);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: err.message || "Failed to check availability" }], isError: true };
      }
    }
  );
};
