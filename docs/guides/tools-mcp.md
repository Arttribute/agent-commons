# Tools & MCP

Everything about giving agents capabilities through tools and MCP servers.

---

## Built-in tools

Every agent has access to a set of static tools out of the box:

| Tool | What it does |
|---|---|
| `web_scraper` | Fetch and parse web pages |
| `api_caller` | Make HTTP requests to any URL |
| `code_interpreter` | Run Python or JavaScript code |
| `file_reader` | Read uploaded files |
| `search` | Web search |

Enable them by name in your agent config:

```json
{
  "commonTools": ["web_scraper", "api_caller", "search"]
}
```

---

## Creating custom tools

Custom tools let you wrap any HTTP API as a tool the agent can call.

### Simple GET tool

```bash
curl -X POST https://api.agentcommons.io/v1/tools \
  -H "x-api-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "IP Lookup",
    "description": "Get geolocation and ISP info for an IP address",
    "method": "GET",
    "endpoint": "https://ipapi.co/{{ip}}/json/",
    "schema": {
      "input": {
        "ip": {
          "type": "string",
          "description": "The IP address to look up"
        }
      },
      "output": {
        "city": { "type": "string" },
        "country": { "type": "string" },
        "org": { "type": "string" }
      }
    }
  }'
```

### POST tool with API key auth

```bash
curl -X POST https://api.agentcommons.io/v1/tools \
  -H "x-api-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Send Email",
    "description": "Send an email via SendGrid",
    "method": "POST",
    "endpoint": "https://api.sendgrid.com/v3/mail/send",
    "headers": {
      "Authorization": "Bearer {{SENDGRID_KEY}}",
      "Content-Type": "application/json"
    },
    "schema": {
      "input": {
        "to": { "type": "string", "description": "Recipient email" },
        "subject": { "type": "string" },
        "body": { "type": "string" }
      }
    }
  }'
```

Then add the API key:

```bash
curl -X POST https://api.agentcommons.io/v1/tools/tool_abc123/keys \
  -H "x-api-key: YOUR_KEY" \
  -d '{ "value": "SG.your-sendgrid-key", "label": "production" }'
```

The `{{SENDGRID_KEY}}` placeholder in the header is replaced automatically when the agent calls the tool.

---

## Tool access control

By default, only you can use your custom tools. Grant access to other agents or users:

```bash
curl -X POST https://api.agentcommons.io/v1/tools/tool_abc123/permissions \
  -H "x-api-key: YOUR_KEY" \
  -d '{
    "principalType": "agent",
    "principalId": "agent_def456",
    "permission": "invoke"
  }'
```

---

## MCP (Model Context Protocol)

MCP is an open standard for connecting AI agents to external tool servers. If a tool server speaks MCP, you can connect it to Agent Commons and all its tools become available.

### What you get from an MCP server

- **Tools** — callable functions (like a database query or file operation)
- **Resources** — data the server can expose (like files or database records)
- **Prompts** — reusable prompt templates the server provides

### Transport types

| Type | When to use |
|---|---|
| `sse` | Remote server over HTTP (most common) |
| `http` | Stateless HTTP, each call independent |
| `stdio` | Local process (e.g. CLI tools, local scripts) |

---

### Connecting a remote MCP server (SSE)

```bash
curl -X POST https://api.agentcommons.io/v1/mcp/servers \
  -H "x-api-key: YOUR_KEY" \
  -d '{
    "name": "Exa Search",
    "transportType": "sse",
    "url": "https://mcp.exa.ai/sse"
  }'
```

### Connecting a local stdio server

```bash
curl -X POST https://api.agentcommons.io/v1/mcp/servers \
  -H "x-api-key: YOUR_KEY" \
  -d '{
    "name": "Filesystem",
    "transportType": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/user/documents"]
  }'
```

### Connecting with environment variables

Some stdio servers need credentials passed as env vars:

```bash
curl -X POST https://api.agentcommons.io/v1/mcp/servers \
  -H "x-api-key: YOUR_KEY" \
  -d '{
    "name": "GitHub MCP",
    "transportType": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": {
      "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_your_token_here"
    }
  }'
```

---

### Syncing tools from a server

After connecting, sync to discover all tools:

```bash
curl -X POST https://api.agentcommons.io/v1/mcp/servers/server_abc123/sync \
  -H "x-api-key: YOUR_KEY"
```

Then check what tools were found:

```bash
curl https://api.agentcommons.io/v1/mcp/servers/server_abc123/tools \
  -H "x-api-key: YOUR_KEY"
```

---

### Checking server status

```bash
curl https://api.agentcommons.io/v1/mcp/servers/server_abc123/status \
  -H "x-api-key: YOUR_KEY"
```

```json
{
  "serverId": "server_abc123",
  "status": "connected",
  "toolsCount": 12,
  "lastConnectedAt": "2026-04-10T08:00:00Z"
}
```

---

### Reading MCP resources

MCP servers can expose readable resources (files, database records, etc.):

```bash
# List available resources
curl https://api.agentcommons.io/v1/mcp/servers/server_abc123/resources \
  -H "x-api-key: YOUR_KEY"

# Read a specific resource
curl "https://api.agentcommons.io/v1/mcp/servers/server_abc123/resources/read?uri=file:///docs/readme.md" \
  -H "x-api-key: YOUR_KEY"
```

---

### Using MCP prompts

MCP servers can expose reusable prompt templates:

```bash
# List available prompts
curl https://api.agentcommons.io/v1/mcp/servers/server_abc123/prompts \
  -H "x-api-key: YOUR_KEY"

# Render a prompt
curl -X POST https://api.agentcommons.io/v1/mcp/servers/server_abc123/prompts/summarize \
  -H "x-api-key: YOUR_KEY" \
  -d '{ "arguments": { "url": "https://example.com" } }'
```

---

### MCP Marketplace

Browse and connect curated MCP servers:

```bash
curl https://api.agentcommons.io/v1/mcp/servers/marketplace \
  -H "x-api-key: YOUR_KEY"
```

Popular MCP servers to connect:

| Server | Capabilities |
|---|---|
| `@modelcontextprotocol/server-filesystem` | Read/write local files |
| `@modelcontextprotocol/server-github` | GitHub repos, issues, PRs |
| `@modelcontextprotocol/server-postgres` | Query a PostgreSQL database |
| `@modelcontextprotocol/server-brave-search` | Brave web search |
| `@modelcontextprotocol/server-slack` | Send Slack messages, read channels |
| `@modelcontextprotocol/server-google-maps` | Maps, geocoding, place search |

---

## Tool invocation flow

When an agent decides to use a tool, here's what happens:

```
Agent decides to call "web_scraper" with { url: "..." }
        │
        ▼
Tool Loader checks: space tools → agent tools → MCP tools → built-in tools
        │
        ▼
If OAuth required: inject token automatically
        │
        ▼
Execute the tool (HTTP call, stdio call, etc.)
        │
        ▼
Return result to agent
        │
        ▼
Agent uses result to continue generating its response
```

---

## Tool precedence

If multiple tools share the same name, this is the resolution order:

1. Space tools (scoped to the current collaborative space)
2. Agent-specific tools (linked directly to the agent)
3. MCP tools (from connected MCP servers)
4. Built-in / static tools

---

## Invoking tools directly (without an agent)

You can call tools directly via the API for testing:

```bash
curl -X POST https://api.agentcommons.io/v1/tools/tool_abc123/invoke \
  -H "x-api-key: YOUR_KEY" \
  -d '{ "input": { "city": "Nairobi" } }'
```

Or with the CLI:

```bash
agc tools invoke tool_abc123 --input '{"city":"Nairobi"}'
```
