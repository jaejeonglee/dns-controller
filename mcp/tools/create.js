const { z } = require("zod");
const api = require("../lib/api-client");

module.exports = function registerCreate(server, apiKey) {
  server.tool(
    "create_subdomain",
    "Create a new subdomain DNS record (A or CNAME)",
    {
      subdomain: z.string().describe("Subdomain to create"),
      domain: z.string().describe("Root domain (e.g. sitey.one)"),
      type: z.enum(["A", "CNAME"]).describe("DNS record type"),
      value: z.string().describe("IP address (A) or target hostname (CNAME)"),
    },
    async ({ subdomain, domain, type, value }) => {
      try {
        const data = await api.post("/subdomains", { subdomain, domain, type, value }, apiKey);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: err.message || "Failed to create subdomain" }], isError: true };
      }
    }
  );
};
