---
"@agent-commons/ui": minor
---

ProjectPageFrame accepts a server-created `session` (nonce and host origin) so hosts can render the page frame in their server HTML and start loading it before hydration. `@agent-commons/ui/page-bridge` exports `projectPageRequestOrigin` for server components.
