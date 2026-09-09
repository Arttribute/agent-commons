# Changelog

## 0.2.0 — 2026-09-09

- Replace terminal launches with a complete streaming chat in the sidebar.
- Add a compact Commons composer with attachment chips, file picker, drag and drop,
  pasted images, current-file context, and unsaved selections.
- Browse, search, filter, rename, and resume conversations across agents.
- Expand tool activity and file-change summaries; review before/after snapshots in
  VS Code's native diff editor and open referenced project files.
- Approve or decline edits and commands in chat; switch between ask, read-only,
  and tools-off modes. Stop a response without closing the sidebar.
- Add browser sign-in, a device-code screen, and account management.
- Preserve conversations, change snapshots, and drafts across reloads. Keep runtime
  credentials out of the webview and protect local history with user-only permissions.
- Add background-runtime integration tests, browser interaction coverage, and a real
  extension-host test that verifies sessions never open a terminal.

## 0.1.0 — 2026-09-09

Initial release: bundled CLI, coding workspace, local tools, editor context, and
resumable terminal sessions.
