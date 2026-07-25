---
name: use-agent-computers
description: Execute and verify computer-backed work in the agent's persistent CommonOS environment, including repositories, terminals, browsers, local applications, media processing, and long-running workflows. Use when a request requires an operating system, filesystem, browser, runtime, or application-level inspection.
---

# Use Agent Computers

Use the assigned persistent computer as an execution environment, not as a reason to hand instructions back to the user.

## Workflow

1. Start or reuse the assigned computer and inspect its current state.
2. Continue in the existing workspace. Read relevant files and repository guidance before editing.
3. Run finite, task-scoped commands. Keep long-running servers in a reusable session and continue after startup is confirmed.
4. Use structured file tools for source edits.
5. Verify outputs with the appropriate application or browser, including console, page, and network failures.
6. Preserve useful existing work and report exact artifact paths, URLs, commands, and validation evidence.

## Quality rules

- Do not claim computer access before a tool confirms it.
- Do not create competing computers or discard unrelated work.
- Do not stop at code generation when execution and inspection are possible.
- Retry recoverable tool failures with a changed approach.
- Treat a browser-open result as preparation; use browser testing for verification.
