const { z } = require("zod");
const api = require("../lib/api-client");

module.exports = function registerUpdate(server, apiKey) {
  server.tool(
    "update_subdomain",
    "Update the DNS value for an existing subdomain",
    {
      subdomain: z.string().describe("Subdomain to update"),
      domain: z.string().describe("Root domain (e.g. sitey.one)"),
      value: z.string().describe("New IP address or target hostname"),
    },
    async ({ subdomain, domain, value }) => {
      try {
        const data = await api.patch(`/subdomains/${subdomain}/${domain}`, { value }, apiKey);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: err.message || "Failed to update subdomain" }], isError: true };
      }
    }
  );
};
