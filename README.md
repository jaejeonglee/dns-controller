# sitey.one

Free subdomain service for developers. Get a subdomain in seconds — no credit card, no hassle.

> **NEW**: AI agents can now create subdomains via [MCP](#-mcp-for-ai-agents). Just connect `https://sitey.one/mcp` to your agent.

## Features

- **Instant DNS** — A and CNAME records, live in seconds
- **Google sign-in** — No passwords to manage
- **MCP support** — AI agents (Claude, Cursor, etc.) can create subdomains automatically
- **Auto-cleanup** — Unreachable subdomains are removed after two warnings
- **Free** — No cost, no catch

## Quick Start

### For humans

1. Visit [sitey.one](https://sitey.one)
2. Sign in with Google
3. Type a subdomain + IP address → done

### For AI agents

Add to your MCP settings:

```json
{
  "mcpServers": {
    "sitey": {
      "url": "https://sitey.one/mcp"
    }
  }
}
```

Then tell your agent:

```
"Create demo.sitey.one pointing to 1.2.3.4"
```

No sign-up needed. IP-based limit: 3 subdomains. Sign in for unlimited + API key.

## 🤖 MCP for AI Agents

sitey.one implements the [Model Context Protocol](https://modelcontextprotocol.io) so AI agents can manage DNS records programmatically.

**Endpoint:** `https://sitey.one/mcp`
**Discovery:** `https://sitey.one/.well-known/mcp.json`

### Tools

| Tool | Description |
|------|-------------|
| `check_availability` | Check if a subdomain is free |
| `create_subdomain` | Create A or CNAME record |
| `list_subdomains` | List your subdomains |
| `update_subdomain` | Change record value |
| `delete_subdomain` | Remove a subdomain |

### Authentication

| Mode | Auth | Limit |
|------|------|-------|
| Anonymous | None (IP-based) | 3 subdomains |
| API key | `Authorization: Bearer styo_xxx` | Unlimited |

Get an API key: sign in at sitey.one → Dashboard → API Keys.

## Tech Stack

- **Runtime**: Node.js + Fastify
- **DNS**: Self-hosted BIND9 (authoritative nameserver)
- **Database**: MySQL
- **Auth**: Google OAuth2 + JWT
- **MCP**: `@modelcontextprotocol/sdk` (Streamable HTTP)

## How It Works

1. User (or agent) requests a subdomain
2. Server validates input + checks availability
3. A/CNAME record is appended to the BIND9 zone file
4. `named-checkzone` validates → `systemctl reload named` applies
5. DNS is live within seconds

We run our own authoritative nameservers (`ns1.sitey.one`, `ns2.sitey.one`) — no third-party DNS provider.

## Use Cases

- Deploy a side project to `myapp.sitey.one`
- Give hackathon demos a real URL
- Let your AI coding agent handle deployment end-to-end
- Share staging environments with teammates

## Support

- ☕ [Buy me a coffee](https://www.buymeacoffee.com/helpmeup)
- 💬 [Telegram community](https://t.me/+yvrIFDbssJ0wNDJl)

## License

[ISC](LICENSE)
