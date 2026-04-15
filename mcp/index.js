const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const http = require("http");

const registerDomains = require("./tools/domains");
const registerCheck = require("./tools/check");
const registerCreate = require("./tools/create");
const registerList = require("./tools/list");
const registerUpdate = require("./tools/update");
const registerDelete = require("./tools/delete");
const registerCreateTxt = require("./tools/create-txt");
const registerDeleteTxt = require("./tools/delete-txt");

function createServer(apiKey) {
  const server = new McpServer({
    name: "free-domain-mcp",
    version: "1.0.0",
  });

  registerDomains(server, apiKey);
  registerCheck(server, apiKey);
  registerCreate(server, apiKey);
  registerList(server, apiKey);
  registerUpdate(server, apiKey);
  registerDelete(server, apiKey);
  registerCreateTxt(server, apiKey);
  registerDeleteTxt(server, apiKey);

  return server;
}

function extractApiKey(req) {
  const auth = req.headers["authorization"];
  if (auth && auth.startsWith("Bearer ")) {
    return auth.slice(7);
  }
  return process.env.SITEY_API_KEY || undefined;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const body = Buffer.concat(chunks).toString();
        resolve(body ? JSON.parse(body) : undefined);
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

const httpServer = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname !== "/mcp") {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  if (req.method === "POST") {
    try {
      const body = await readBody(req);
      const apiKey = extractApiKey(req);
      const server = createServer(apiKey);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });

      await server.connect(transport);
      await transport.handleRequest(req, res, body);

      res.on("close", () => {
        transport.close();
        server.close();
      });
    } catch (err) {
      console.error("Error handling MCP request:", err);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        }));
      }
    }
  } else if (req.method === "GET") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed." },
      id: null,
    }));
  } else if (req.method === "DELETE") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed." },
      id: null,
    }));
  } else {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed." },
      id: null,
    }));
  }
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.error(`free-domain-mcp listening on port ${PORT}`);
});

process.on("SIGINT", () => {
  console.error("Shutting down...");
  httpServer.close();
  process.exit(0);
});
