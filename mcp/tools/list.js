const api = require("../lib/api-client");

module.exports = function registerList(server, apiKey) {
  server.tool(
    "list_subdomains",
    "List all subdomains owned by the current API key",
    {},
    async () => {
      try {
        const data = await api.get("/subdomains", apiKey);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: err.message || "Failed to list subdomains" }], isError: true };
      }
    }
  );
};
