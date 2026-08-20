---
name: build-commons-ui-plugin
description: Build a sandboxed custom page or floating widget for the Commons app when a user asks for a custom UI, dashboard, control, or visualization inside Commons.
---

# Build a Commons UI plugin

Create custom UI as an isolated code project. Never edit the Commons host UI or
try to reach into its DOM.

1. Clarify the smallest useful page, widget, or both from the user's request.
2. Use `createCodeProject` and `writeCodeProjectFiles` to build an accessible,
   responsive React interface that follows the Commons visual language.
3. Use `publishCodeProject`, then `testCodeProject`. Fix failures before moving
   on.
4. Call `registerUiPlugin` with the published project. Request only the minimum
   permissions needed:
   - `theme.read` receives the current light/dark theme.
   - `navigation` may ask the host to navigate to a safe internal path.
5. Tell the user the plugin is a draft and must be reviewed and enabled in
   Studio Apps.

The plugin can post `{ type: "commons:ready" }` to its parent. The host replies
with `{ type: "commons:context", theme, pluginId }`. With the `navigation`
permission, post `{ type: "commons:navigate", path: "/safe/internal/path" }`.
Never request secrets, authentication tokens, raw cookies, or unrestricted host
APIs.
