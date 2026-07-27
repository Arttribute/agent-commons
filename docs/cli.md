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

Use **↑ / ↓** arrow keys to navigate and **Enter** to select. The menu covers
chat, runs, sessions, agents, tasks, workflows, MCP, skills, library files, code
projects, developer keys, wallets, usage, logs, and configuration.

If no credentials are saved yet, the menu automatically launches the setup wizard.

---

## Authentication

### Commons account sign-in

```bash
agc login
```

The CLI starts a standard device authorization flow. It opens Commons Identity
in your browser and displays a one-time code. Approve the request with your
Commons account; your password and API keys never enter the terminal.

Credentials are stored in `~/.agc/config.json` with user-only permissions. The
CLI exchanges the account session for short-lived platform access tokens.

### Other auth commands

```bash
agc logout                         # clear local credentials
agc whoami                         # show account + verify API access
agc config get                     # show non-secret configuration
agc config set defaultAgentId ...  # set a preferred agent
```

### Environment variables

For CI or other non-interactive automation, create a project-scoped `csk_*`
developer key and supply it through the environment:

```bash
export AGC_API_KEY=csk_test_xxxx
export AGC_API_URL=https://api.agentcommons.io   # optional — this is the default
export AGC_AGENT_ID=agent_abc123                 # optional default agent
```

Env vars take precedence over the config file.

### Developer projects and API keys

```bash
agc keys projects list
agc keys scopes
agc keys create \
  --name "CI" \
  --project prj_... \
  --scopes agents:read,agents:run
agc keys list --project prj_...
agc keys revoke key_...
```

Interactive use should prefer `agc login`. Developer keys are for SDKs,
servers, CI, and automation.

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
agc run --agent agent_abc123 "Summarize https://example.com"
```

The prompt is a positional argument (not a flag). Optional flags:

| Flag | Description |
|---|---|
| `--agent <agentId>` | Agent to run (falls back to `defaultAgentId` in config) |
| `--session <sessionId>` | Attach run to an existing session |
| `--no-stream` | Wait for the full response instead of streaming tokens |
| `--json` | Output raw event stream as JSON lines |

Useful for scripting:

```bash
agc run --agent agent_abc123 "Today's date?" | tee output.txt
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
  --agent agent_abc123 \
  --input '{"topic":"overnight news"}'
```

### Execute a task

```bash
agc task execute task_abc123 --watch
```

Runs the task immediately and streams output to the terminal.

### List tasks

```bash
agc task list
agc task list --agent agent_abc123
agc task list --status running
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
agc workflow run workflow_abc123 --input '{"url":"https://example.com"}' --watch
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
agc tools exec weather --agent agent_abc123 --args '{"city":"Nairobi"}'
```

---

## MCP Servers

### Add and connect an MCP server

```bash
# SSE/HTTP server
agc mcp add --name "GitHub Tools" --type sse --url https://mcp.example.com/sse

# stdio server
agc mcp add --name "Filesystem" --type stdio \
  --command "npx -y @modelcontextprotocol/server-filesystem /data"

agc mcp connect server_abc123
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
agc wallet balance --agent agent_abc123
agc wallet list --agent agent_abc123
agc wallet send --agent agent_abc123 --to 0xADDRESS --amount 5.0 --token USDC
```

---

## Memory

```bash
agc memory list --agent agent_abc123
agc memory create --agent agent_abc123 --content "User prefers bullet lists" --type semantic
agc memory search --agent agent_abc123 "user preferences"
agc memory delete memory_abc123
```

---

## Models

```bash
agc models ls                   # all supported models
agc models ls --provider openai
```

---

## Skills

```bash
agc skills list                   # all available skills
agc skills get skill_abc123
agc skills create --slug concise-review --name "Concise review" \
  --instructions "Review changes and report actionable findings."
```

---

## Usage and Logs

```bash
agc usage agents                   # usage across your agents
agc usage agent agent_abc123       # usage for a specific agent

agc logs list --agent agent_abc123
agc logs errors --agent agent_abc123
```

---

## Output formats

All commands default to a human-readable table or text output. Add `--json` to get raw JSON:

```bash
agc agents list --json
agc run --agent agent_abc123 "Hello" --json
```

---

## Scripting and piping

`agc` is designed to be used in shell scripts:

```bash
#!/bin/bash
# Run an agent and save output
RESULT=$(agc run --agent agent_abc123 "Summarize: $(cat input.txt)" --json)
echo $RESULT | jq '.response' > summary.txt

# Chain tasks
agc task execute task_123 && agc task execute task_456
```
