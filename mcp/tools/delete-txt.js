const { z } = require("zod");
const api = require("../lib/api-client");

module.exports = function registerDeleteTxt(server, apiKey) {
  server.tool(
    "delete_txt_record",
    "Delete a TXT record under a subdomain",
    {
      subdomain: z.string().describe("Parent subdomain"),
      domain: z.string().describe("Root domain (e.g. sitey.one)"),
      host_prefix: z.string().describe("TXT record host prefix to delete"),
    },
    async ({ subdomain, domain, host_prefix }) => {
      try {
        const data = await api.del(
          `/subdomains/${subdomain}/${domain}/txt/${host_prefix}`,
          apiKey
        );
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: err.message || "Failed to delete TXT record" }], isError: true };
      }
    }
  );
};
