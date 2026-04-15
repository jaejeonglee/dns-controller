const { z } = require("zod");
const api = require("../lib/api-client");

module.exports = function registerCreateTxt(server, apiKey) {
  server.tool(
    "create_txt_record",
    "Create a TXT record under a subdomain (e.g. for domain verification)",
    {
      subdomain: z.string().describe("Parent subdomain"),
      domain: z.string().describe("Root domain (e.g. sitey.one)"),
      host_prefix: z.string().describe("TXT record host prefix (e.g. _acme-challenge)"),
      value: z.string().describe("TXT record value"),
    },
    async ({ subdomain, domain, host_prefix, value }) => {
      try {
        const data = await api.post(
          `/subdomains/${subdomain}/${domain}/txt`,
          { host_prefix, value },
          apiKey
        );
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: err.message || "Failed to create TXT record" }], isError: true };
      }
    }
  );
};
