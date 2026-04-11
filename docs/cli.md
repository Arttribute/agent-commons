# CLI Reference

The `agc` command-line tool gives you full access to Agent Commons from your terminal — with an interactive menu, streaming chat, and scriptable output.

---

## Installation

```bash
npm install -g @agent-commons/cli
```

---

## Interactive menu

Running `agc` with no arguments opens a full interactive menu — no commands to memorise:

```bash
agc
```

Use **↑ / ↓** arrow keys to navigate, **Enter** to select. The menu covers every feature: Chat, Run, Sessions, Agents, Tasks, Workflows, MCP, Skills, Wallet, Usage, Logs, and Config.

If no credentials are saved yet, the menu automatically launches the setup wizard.

---

## Authentication

### First-time setup

```bash
agc login
```

A three-step guided wizard runs:

1. **API Endpoint** — defaults to `https://api.agentcommons.io`. Press Enter to accept.
2. **API Key** — your browser opens automatically to **agentcommons.io/settings**. Generate a key there, paste it in the terminal.
3. **Wallet address** — your `0x…` identity used as the request initiator.

Credentials are stored in `~/.agc/config.json` (mode `0600`).

### Other auth commands

```bash
agc logout                         # clear stored credentials
agc whoami                         # show config + verify API connectivity
agc config get                     # show all config values
agc config set apiKey sk-ac-xxxx   # update a single value
```

### Environment variables

You can set credentials via env vars instead of running `agc login`:

```bash
export AGC_API_KEY=sk-ac-xxxx
export AGC_API_URL=https://api.agentcommons.io   # optional — this is the default
export AGC_INITIATOR=0xYourWalletAddress
export AGC_AGENT_ID=agent_abc123                 # optional default agent
```

Env vars take precedence over the config file.

---

## Agents

### List your agents

```bash
agc agents list
```

Output:
```
ID              NAME              MODEL          STATUS
agent_abc123    Research Bot      openai/gpt-4o  active
agent_def456    Writing Helper    anthropic/...  active
```

### Create an agent

```bash
agc agents create
```

Interactive prompts for name, instructions, model, etc.

Or pass flags:

```bash
agc agents create \
  --name "My Bot" \
  --instructions "You are helpful." \
  --model-provider openai \
  --model-id gpt-4o
```

### Get agent details

```bash
agc agents get agent_abc123
```

### Update an agent

```bash
agc agents update agent_abc123 --temperature 0.5
agc agents update agent_abc123 --instructions "New instructions"
```

### Delete an agent

```bash
agc agents delete agent_abc123
```

---

## Chat

### Interactive chat session

```bash
agc chat --agent agent_abc123
```

Opens a real-time streaming chat. Type messages and get responses. Exit with `/quit`.

```
you › What is the capital of Kenya?
agent › The capital of Kenya is Nairobi.

you › What's the population?
agent › Nairobi has a population of approximately 4.4 million people…

you › /quit
Session saved. Resume with: agc chat --resume <sessionId>
```

In-session slash commands:

| Command  | Description                                      |
|----------|--------------------------------------------------|
| /help    | Show available slash commands                    |
| /session | Print the current session ID (for later resume)  |
| /clear   | Clear the terminal screen                        |
| /quit    | Exit — session is preserved for future resume    |

Set a default agent to skip `--agent` every time:

```bash
agc config set defaultAgentId agent_abc123
agc chat   # uses defaultAgentId automatically
```

### Resume a session

```bash
agc chat --agent agent_abc123 --resume session_xyz
```

### Single one-shot run

```bash
agc run --agent agent_abc123 --message "Summarize https://example.com"
```

Useful for scripting:

```bash
agc run --agent agent_abc123 --message "Today's date?" | tee output.txt
```

---

## Sessions

```bash
agc sessions list                        # list all sessions
agc sessions list --agent agent_abc123   # for a specific agent
agc sessions get session_xyz             # show session details
```

---

## Tasks

### Create a task

```bash
agc task create \
  --title "Summarize Hacker News" \
  --description "Get top 10 stories and write a 1-line summary of each" \
  --agent agent_abc123
```

### Schedule a recurring task

```bash
agc task create \
  --title "Morning briefing" \
  --description "Summarize overnight news" \
  --agent agent_abc123 \
  --cron "0 8 * * 1-5" \
  --recurring
```

### Execute a task

```bash
agc task execute task_abc123
```

Runs the task immediately and streams output to the terminal.

### List tasks

```bash
agc task list
agc task list --agent agent_abc123
agc task list --status running
```

### Monitor a task

```bash
agc task stream task_abc123
```

### Cancel a task

```bash
agc task cancel task_abc123
```

---

## Workflows

### List workflows

```bash
agc workflow list
```

### Create a workflow (from file)

```bash
agc workflow create --file workflow.json
```

Where `workflow.json` is a workflow definition:

```json
{
  "name": "My Workflow",
  "definition": {
    "nodes": [...],
    "edges": [...]
  }
}
```

### Get workflow details

```bash
agc workflow get workflow_abc123
```

### Execute a workflow

```bash
agc workflow execute workflow_abc123 --inputs '{"url":"https://example.com"}'
```

Streams output as each node completes.

---

## Tools

### List tools

```bash
agc tools list
agc tools list --type mcp
agc tools list --type custom
```

### Create a tool (from file)

```bash
agc tools create --file tool.json
```

### Invoke a tool

```bash
agc tools invoke tool_abc123 --input '{"city":"Nairobi"}'
```

### Add an API key to a tool

```bash
agc tools add-key tool_abc123 --value "sk-abc123" --label "prod"
```

---

## MCP Servers

### Connect an MCP server

```bash
# SSE/HTTP server
agc mcp connect --name "GitHub Tools" --type sse --url https://mcp.example.com/sse

# stdio server
agc mcp connect --name "Filesystem" --type stdio \
  --command "npx -y @modelcontextprotocol/server-filesystem /data"
```

### Sync tools

```bash
agc mcp sync server_abc123
```

### List server tools

```bash
agc mcp tools server_abc123
```

### List all connected servers

```bash
agc mcp list
```

### Disconnect

```bash
agc mcp disconnect server_abc123
```

---

## Wallets

```bash
agc wallet create --agent agent_abc123 --label main
agc wallet balance wallet_abc123
agc wallet list --agent agent_abc123
agc wallet transfer wallet_abc123 --to 0xADDRESS --amount 5.0 --token USDC
```

---

## Memory

```bash
agc memory list --agent agent_abc123
agc memory add --agent agent_abc123 --content "User prefers bullet lists" --type semantic
agc memory search --agent agent_abc123 --query "user preferences"
agc memory delete memory_abc123
```

---

## Models

```bash
agc models list                   # all supported models
agc models list --provider openai
agc models info anthropic         # details about a provider
```

---

## Skills

```bash
agc skills list                   # all available skills
agc skills get skill_abc123
agc skills create --file skill.yaml
```

---

## Usage and Logs

```bash
agc usage                          # your overall usage
agc usage --agent agent_abc123     # usage for a specific agent

agc logs                           # stream live logs
agc logs --agent agent_abc123      # logs for a specific agent
agc logs --task task_abc123        # logs for a task
```

---

## Output formats

All commands default to a human-readable table or text output. Add `--json` to get raw JSON:

```bash
agc agents list --json
agc run --agent agent_abc123 --message "Hello" --json
```

---

## Scripting and piping

`agc` is designed to be used in shell scripts:

```bash
#!/bin/bash
# Run an agent and save output
RESULT=$(agc run --agent agent_abc123 --message "Summarize: $(cat input.txt)" --json)
echo $RESULT | jq '.response' > summary.txt

# Chain tasks
agc task execute task_123 && agc task execute task_456
```
