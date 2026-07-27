# `@agent-commons/cli`

The official command-line interface for Agent Commons. Build, run, inspect, and
operate agents without leaving the terminal.

```text
        ◇
    ╭───┴────────────────────────────────╮
    │  AGENT COMMONS  //  CLI            │
    ╰────────────────────────────────────╯
       Build · run · connect · collaborate
```

## Install

Install globally:

```bash
npm install --global @agent-commons/cli
```

Or run without installing:

```bash
npx @agent-commons/cli --help
```

The executable is `agc`. Node.js 18 or newer is required.

## Sign in

```bash
agc login
```

The CLI opens Commons Identity in your browser and displays a one-time device
code. Approve it with your existing Commons account; your password never enters
the terminal.

Credentials are stored in `~/.agc/config.json` with user-only file permissions.
Short-lived API access tokens are refreshed from the Commons account session.

Verify the active account:

```bash
agc whoami
```

Sign out:

```bash
agc logout
```

For CI or other non-interactive automation, use a project-scoped developer key:

```bash
agc login --api-key "$AGENT_COMMONS_API_KEY"
```

Interactive CLI use should prefer account sign-in. API keys are designed for
SDKs, servers, CI, and automation.

## Command center

Run `agc` with no arguments to open the interactive command center:

```bash
agc
```

It guides first-time sign-in, lets you select an agent, and provides shortcuts
to the main platform areas.

## Everyday commands

```bash
# Agents
agc agents list
agc agents create --name "Researcher" --instructions "Research carefully"
agc agents runtime status agt_...

# Run and chat
agc run --agent agt_... "Summarize this week"
agc chat --agent agt_...

# Sessions and tasks
agc sessions list
agc sessions rename ses_... "Launch research"
agc task list

# Workflows
agc workflow list
agc workflow run wfl_... --input '{"topic":"agents"}'

# Persistent agent computer
agc computer status --agent agt_...
agc computer wake --agent agt_...
agc computer exec --agent agt_... pnpm test

# Platform resources
agc library list
agc library upload ./brief.pdf --agent agt_...
agc projects list --agent agt_...
agc connections list
agc mcp list
agc skills list
agc memory stats --agent agt_...
agc logs list --agent agt_...
```

Most list and detail commands support `--json` for scripts and pipelines.

## Developer projects and API keys

Developer keys are project-scoped `csk_*` credentials. Projects isolate
environments, scopes, usage, and revocation.

```bash
# List projects and supported scopes
agc keys projects list
agc keys scopes

# Create a development project
agc keys projects create \
  --name "Local development" \
  --environment development

# Create a least-privilege key
agc keys create \
  --name "Nightly agent run" \
  --project prj_... \
  --scopes agents:read,agents:run \
  --expires 2027-01-01T00:00:00Z

# Inspect and revoke
agc keys list --project prj_...
agc keys revoke key_...
```

The plaintext key is shown once. Store it in a secret manager or protected
environment variable.

## Connected accounts

Agents use Commons-managed OAuth connections instead of copied third-party
tokens:

```bash
agc connections providers
agc connections connect github
agc connections list
agc connections test conn_...
agc connections refresh conn_...
agc connections revoke conn_...
```

## Local tools

`agc run` and `agc chat` can expose approved local terminal, file, and Git
operations to an agent. Use the relevant local-tool flags shown by
`agc run --help` and review the requested scope before enabling write or
execution access.

## Configuration and environment variables

```bash
agc config get
agc config set defaultAgentId agt_...
```

| Variable | Purpose |
| --- | --- |
| `AGC_API_URL` | Override the Agent Commons API origin |
| `AGC_API_KEY` | Project API key for non-interactive use |
| `AGC_AGENT_ID` | Default agent ID |
| `AGC_INITIATOR` | Optional delegated principal |
| `COMMONS_IDENTITY_URL` | Override the Commons Identity origin |
| `COMMONS_ACCESS_TOKEN` | Supply an existing short-lived access token |

Environment variables override the local configuration file and are not copied
into it when preferences are updated.

## Security

- Prefer `agc login` on developer machines.
- Use project-scoped keys for CI and servers.
- Keep production and development keys in different projects.
- Grant only the required scopes and set an expiration where practical.
- Run `agc logout` before sharing or decommissioning a machine.

## Help and links

```bash
agc --help
agc <command> --help
```

- [Documentation](https://docs.agentcommons.io)
- [Agent Commons](https://www.agentcommons.io)
- [GitHub](https://github.com/Arttribute/agent-commons)
- [Issues](https://github.com/Arttribute/agent-commons/issues)

## License

MIT
