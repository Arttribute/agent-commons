---
name: build-commons-ui-plugin
description: Build a Commons app (a sandboxed page, widget, or in-chat widget) when a user asks for a custom dashboard, tool, integration with an external service, data-backed workflow, visualization, game, or other embedded app. Do not use for changes to the Commons host UI itself.
---

# Build a Commons app

Create a polished, working React app inside an isolated code project. The result
must feel at home in Commons, work at its real page or widget size, and use only
the host access the user actually needs. Match the Commons visual language by
default; depart from it only when the user explicitly requests another look and
feel. Never edit or reach into the Commons host DOM.

## Establish the app contract

Before writing code, identify:

- the primary job and the few actions that make it useful;
- whether it needs a `page`, a `widget`, or both;
- the exact widget width and height when applicable;
- which Commons data and actions it needs;
- what it must remember between visits (use `commons.data`);
- which external services it calls (declare `connections`);
- whether agents should bring it into a chat, and when; and
- what success looks like when tested.

Infer sensible details from the request instead of blocking on minor choices.
For a page and widget pair, build one adaptive interface and branch on
`useCommonsContext().surface` only where the information density must differ.

## Use the supported UI platform

Create or replace complete files with `createCodeProject` and
`writeCodeProjectFiles`. Use `app/page.tsx` as the entry and
`app/globals.css` for authored CSS. Global CSS and Tailwind utilities are
compiled into the published app; do not load Tailwind, fonts, scripts, images,
or packages from a browser CDN.

The builder bundles these libraries:

- `@agent-commons/ui` for Commons primitives, context, and the host bridge;
- `lucide-react` for icons;
- Radix Dialog, Dropdown Menu, Select, Tabs, and Tooltip for accessible
  interaction primitives;
- `recharts` for data visualization;
- `framer-motion` for purposeful motion;
- `clsx` and `tailwind-merge` for class composition;
- `three` and `@react-three/fiber` for a genuinely 3D experience; and
- `phaser` for a genuine game loop, physics, or game scene.

Use the smallest appropriate stack. Ordinary product interfaces do not need
3D or a game engine. Use local SVG, image, or font files when an asset is
essential. Remote imports, arbitrary npm packages, direct external requests,
and browser CDN dependencies are unavailable; move work that truly needs them
to a persistent computer.

Start with the source-owned primitives rather than recreating basic controls:

```tsx
import {
  AppShell,
  Badge,
  Button,
  Card,
  EmptyState,
  MetricCard,
  Skeleton,
  commons,
  useCommonsContext,
} from '@agent-commons/ui';
```

`@agent-commons/ui` also exports `PageHeader`, `CommonsProvider`, and `cn`.
Compose more specialized components locally with Tailwind and Radix; there is
no runtime `shadcn` package to import.

## Meet the visual and interaction bar

- By default, match Commons: Space Grotesk typography, warm stone semantic
  neutrals, restrained pastel brand accents, compact product density, subtle
  borders and elevation, rounded controls, and clear light/dark states. A
  user-requested visual direction may override the aesthetic, but never the
  accessibility, responsiveness, or host-integration rules.
- Use the semantic Tailwind colors `background`, `foreground`, `card`,
  `card-foreground`, `muted`, `muted-foreground`, `border`, `primary`,
  `primary-foreground`, `accent`, `destructive`, and `ring`. Avoid a hard-coded
  black canvas or an all-default browser-style interface.
- Establish a clear hierarchy, restrained palette, consistent spacing and
  radii, legible type scale, and useful density. Prefer a small number of strong
  sections over a wall of cards.
- Use Lucide icons consistently. Give icon-only controls accessible names and
  tooltips when their meaning is not obvious.
- Support light and dark themes through the semantic tokens. Do not infer the
  theme once and forget it; the host context can change while the app is open.
- Design from the container, not only the browser viewport. Use responsive grid
  and flex layouts, container-query utilities where useful, `min-w-0`, and
  fluid measurements.
- A widget must fit snugly inside its declared width and height: make its root
  height `100%`, avoid fixed desktop widths, and produce no outer horizontal or
  vertical scrollbar. If content can grow, scroll one clearly bounded inner
  region while keeping primary controls visible.
- Render only widget content. Commons owns the outer frame, title, placement,
  and window controls; do not build a second frame or title bar.
- Include intentional loading, empty, error, and populated states for live
  data. Never present sample values as real Commons data.
- Preserve keyboard operation, visible focus, semantic headings and controls,
  meaningful labels, sufficient contrast, reduced-motion behavior, and useful
  error feedback. Do not make hover the only way to discover an action.
- Keep animation subtle and functional. Size Three/R3F or Phaser canvases from
  their container, clean up loops/listeners, pause when hidden, and keep input
  usable at the widget size.

## Connect to Commons through the bridge

The app receives `{ theme, surface, viewport, capabilities, placement, chat }`
through `useCommonsContext()`. `placement` is `panel` (apps bar or page) or
`chat`. The `commons` client exposes correlated host calls; it never exposes
cookies, credentials, or raw host APIs.

| App call                                                  | Manifest grant          |
| --------------------------------------------------------- | ----------------------- |
| `commons.agents.list(params)`                             | `agents.read`           |
| `commons.agents.run({ agentId, prompt, sessionId? })`     | `agents.run`            |
| `commons.sessions.list(params)` / `.get({ sessionId })`   | `sessions.read`         |
| `commons.memory.list({ agentId })`                        | `memory.read`           |
| `commons.memory.create({ agentId, content, tags? })`      | `memory.write`          |
| `commons.skills.list(params)`                             | `skills.read`           |
| `commons.spaces.list(params)`                             | `spaces.read`           |
| `commons.credits.get()`                                   | `credits.read`          |
| `commons.tasks.list(params)`                              | `tasks.read`            |
| `commons.tasks.create(params)` / `.update(params)`        | `tasks.write`           |
| `commons.workflows.list(params)`                          | `workflows.read`        |
| `commons.workflows.execute(params)`                       | `workflows.execute`     |
| `commons.library.list(params)`                            | `library.read`          |
| `commons.tools.list(params)`                              | `tools.read`            |
| `commons.data.collections()` / `.get()` / `.query()`      | `data.read`             |
| `commons.data.insert()` / `.update()` / `.delete()`       | `data.write`            |
| `commons.http.request({ connection, method, path, ... })` | `network.request`       |
| `commons.copilot.open({ prompt })`                        | `copilot.prompt`        |
| `commons.chat.getInput()` / `.respond({ message, data })` | no additional grant     |
| `commons.navigation.open({ path })`                       | `navigation` permission |
| `commons.storage.get/set/remove({ key, value })`          | `storage` permission    |
| `commons.ui.resize({ width, height })`                    | no additional grant     |

The owner decides what the app may actually do. When they enable the app they
can turn off any requested capability, narrow it to specific resources, and
choose whether writes ask for approval each time. Treat a denied call
(`This app was not granted ...`) and a cancelled approval as normal states.

Use the bridge's narrow wire contracts instead of guessing at host APIs:

- List calls return `{ items, total }`. They accept `query` and `limit` (1–100).
  `tasks.list` also accepts `status` and `agentId`; `workflows.list` accepts
  `triggerType`; `library.list` accepts `view`, `source`, and `favorite`;
  `tools.list` accepts `category` and `visibility`; `sessions.list` accepts
  `agentId`.
- Sanitized records expose display-safe IDs, names/titles, descriptions,
  statuses, and relevant summary fields plus safe Commons paths. They do not
  contain credentials, arbitrary metadata, file contents, or signed URLs.
- `tasks.create` requires `title` and an owned `agentId`. It may receive an
  owned `sessionId`; when omitted, the host creates a task session after the
  user confirms. Workflow task creation also requires `workflows.execute`, and
  tool assignment requires `tools.read`; every referenced resource is checked
  against the current user and the grant scope.
- `tasks.update` requires `taskId` and at least one of `title`, `description`,
  or `priority`. It cannot complete, resolve, cancel, or delete a task. For an
  unsupported task action, navigate to its `studioPath` or open Copilot; never
  pretend the update succeeded.
- `workflows.execute` requires `workflowId` and accepts a small JSON
  `inputData` object.
- `agents.run` sends one prompt and resolves with `{ agentId, sessionId, reply }`
  once the agent finishes. It uses the owner's credits; show progress and keep
  it user-initiated.
- By default, task writes, workflow runs, agent runs, memory writes, Copilot
  prompts, and non-GET external requests ask the user to approve. Reads and
  writes to the app's own data do not.
- `navigation.open` accepts only a safe internal Commons path. `ui.resize`
  accepts widget sizes between 280–520 px wide and 240–720 px high.
- Schema-v2 app code runs at an opaque origin. Do not use `localStorage`,
  cookies, or IndexedDB directly.

Request only the grants used by the code. Restrict a grant with `resourceIds`
when the app only needs specific agents, workflows, collections, connections,
or other records. Keep write and execution actions explicit, user-initiated,
and accompanied by clear pending, success, and failure feedback.

### Store data with `commons.data`

`commons.data` is the standard storage for Commons apps. Records are JSON
documents in named collections, private to the app and its owner. The owner
chooses where they live: Commons-managed storage by default, or their own
Supabase project or MongoDB database. App code is the same for all three.

```ts
const { items, hasMore } = await commons.data.query('notes', {
  where: { status: 'open', priority: { gte: 2 } },
  orderBy: 'createdAt',
  direction: 'desc',
  limit: 20,
});
const note = await commons.data.insert('notes', { title, status: 'open', priority: 2 });
await commons.data.update('notes', note.id, { status: 'done' });
await commons.data.delete('notes', note.id);
```

- A record is `{ id, data, createdAt, updatedAt }`.
- Filters apply to top-level fields with `eq`, `ne`, `gt`, `gte`, `lt`,
  `lte`, `in`, and `contains`. Sort by one field. Keep documents under 64 KB.
- Declare every collection in the manifest with `data.collections`, including
  field types for fields the app relies on. Undeclared collections are
  rejected.
- For Supabase, the owner creates one table per collection with an `id`
  primary key (with a default such as `gen_random_uuid()`), plus `created_at`
  and `updated_at` columns. Name the tables and columns the app needs in its
  description.
- Use `commons.storage` only for tiny per-device preferences (string keys and
  values, up to 32 keys and 64 KB per app).

### Call external services with `commons.http.request`

Declare each external API as a connection. The owner adds the key in Commons;
Commons attaches it on the server and it never reaches the app.

```ts
const response = await commons.http.request({
  connection: 'weather',
  method: 'GET',
  path: '/weather',
  query: { q: city, units: 'metric' },
});
if (!response.ok) throw new Error(`Weather service returned ${response.status}`);
```

The response is `{ status, ok, headers, body }`, with JSON bodies parsed.
Requests stay inside the declared `baseUrl`, `methods`, and `pathPrefixes`,
redirects are not followed, and only public https hosts are reachable. Handle
`is not connected yet` by asking the user to connect the service in the app
settings. Never ask users to paste keys into the app.

### Work inside chat

When `chat.when` is set, agents can show the app's widget inside a
conversation. Read the agent's input with `commons.chat.getInput()` and send
the user's decision back with `commons.chat.respond({ message, data })`.
`message` becomes the user's reply in the chat and `data` travels with it as
structured context. Respond once, after an explicit user action, and show a
clear sent state afterwards.

Catch bridge errors and render a useful unavailable or retry state. A published
preview can run outside the Commons host during testing, so it must remain
coherent when host data is unavailable.

## Build with complete project files

Pass complete source through `createCodeProject.files`, or create the starter
and replace `app/page.tsx` and `app/globals.css` together with
`writeCodeProjectFiles`. A compact `app/page.tsx` starting shape is:

```tsx
// app/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { ListChecks } from 'lucide-react';
import {
  AppShell,
  Card,
  EmptyState,
  PageHeader,
  Skeleton,
  commons,
  useCommonsContext,
} from '@agent-commons/ui';

type QueueTask = { taskId: string; title: string };
type QueueState = {
  status: 'loading' | 'ready' | 'error';
  items: QueueTask[];
};

export default function Page() {
  const { surface } = useCommonsContext();
  const [state, setState] = useState<QueueState>({
    status: 'loading',
    items: [],
  });

  useEffect(() => {
    let current = true;
    commons.tasks
      .list({ limit: surface === 'widget' ? 5 : 20 })
      .then(
        (result) =>
          current && setState({ status: 'ready', items: result.items ?? [] }),
      )
      .catch(() => current && setState({ status: 'error', items: [] }));
    return () => {
      current = false;
    };
  }, [surface]);

  return (
    <AppShell>
      <PageHeader title="Work queue" description="Tasks that need attention" />
      {state.status === 'loading' ? <Skeleton className="h-32" /> : null}
      {state.status === 'error' ? (
        <EmptyState
          icon={<ListChecks />}
          title="Tasks are unavailable"
          description="Open this app in Commons or try again."
        />
      ) : null}
      {state.status === 'ready' && state.items.length === 0 ? (
        <EmptyState
          icon={<ListChecks />}
          title="Nothing queued"
          description="New tasks will appear here."
        />
      ) : null}
      {state.items.map((item) => (
        <Card key={item.taskId} className="p-4">
          {item.title}
        </Card>
      ))}
    </AppShell>
  );
}
```

Keep `app/globals.css` focused on app-specific composition; the platform already
provides a reset, semantic tokens, Tailwind, and the `ac-*` primitive styles.

## Publish, test, inspect, and fix

Publishing proves only that the project compiled. After every meaningful
change:

1. Call `publishCodeProject`.
2. Call `testCodeProject` with every intended surface and actions for each
   locally testable control. Use the exact widget dimensions that will be
   registered:

```json
{
  "projectId": "<project-id>",
  "surfaces": [
    { "type": "page" },
    { "type": "widget", "width": 380, "height": 480 }
  ],
  "capabilities": [{ "name": "tasks.read" }],
  "actions": [
    { "type": "click", "text": "Open tasks" },
    { "type": "expectText", "text": "Work queue" }
  ]
}
```

3. Inspect the returned screenshots and every console, page, request,
   interaction, embedding, overflow, style, and accessibility result. Testing
   covers page desktop/mobile and light/dark modes plus each widget at its exact
   size in light/dark mode.
4. Read the project, fix the cause, publish a new deployment, and test again.
   Continue until `passed` is `true` and the screenshots are visually coherent.

`testCodeProject` runs the preview inside the real opaque-origin sandbox and a
synthetic Commons host. It supplies deterministic, display-safe fixture records
for only the capabilities passed to the test and simulates writes without side
effects. Exercise every requested capability through the app's actual controls;
registration rejects grants that the passing verification did not exercise.
This proves the bridge contract and UI behavior, while real owner data and
mutations remain protected until the owner enables and confirms them. Never add
hard-coded sample values to the app or call a failing path complete.

## Ship an icon

Every app needs an icon. Write a square SVG to `icon.svg` in the project: a
single simple glyph on a `viewBox="0 0 24 24"`, with no scripts, event
handlers, external references, or embedded fonts, under 96 KB. Pass
`"icon": "icon.svg"` when registering. The owner can replace it later.

## Register the verified deployment

Register with exactly the tested surfaces and capabilities. For example:

```json
{
  "codeProjectId": "<project-id>",
  "name": "Trip Planner",
  "slug": "trip-planner",
  "description": "Compare trip options and save the chosen plan.",
  "version": "1.0.0",
  "icon": "icon.svg",
  "category": "planning",
  "surfaces": [
    { "type": "page", "title": "Trip Planner" },
    { "type": "widget", "title": "Trip Planner", "width": 380, "height": 480 }
  ],
  "permissions": ["theme.read"],
  "capabilities": [
    { "name": "data.read" },
    { "name": "data.write" },
    { "name": "network.request" }
  ],
  "data": {
    "collections": [
      {
        "name": "trips",
        "description": "Saved trip plans",
        "fields": {
          "destination": { "type": "string", "required": true },
          "budget": { "type": "number" }
        }
      }
    ]
  },
  "connections": [
    {
      "key": "flights",
      "name": "Flight search API",
      "baseUrl": "https://api.example-flights.com/v2",
      "auth": { "type": "header", "name": "X-API-Key" },
      "methods": ["GET"],
      "pathPrefixes": ["/search"]
    }
  ],
  "chat": {
    "when": "The user is choosing between travel options or needs to confirm a trip plan.",
    "inputDescription": "{ destination: string, dates?: string, options?: Array<{ label: string, price: number }> }"
  }
}
```

Omit unused permissions, capabilities, connections, and chat guidance.
Registration pins the verified deployment and creates a draft. Agents cannot
grant permissions. The owner reviews access, connects external services,
chooses storage, and enables the app in Studio → Customize → Apps, where they
can also pin it to the apps bar. Report the app's surfaces, tested sizes and
interactions, requested access, services the owner must connect, review
status, and any honest limitation.

## Use enabled apps

`listCommonsApps` shows the apps the user enabled. Call `showCommonsApp` when an
app's chat guidance matches the moment, with a one-sentence `reason` and the
`input` it describes, then wait for the user's response. Use
`queryCommonsAppData` and `writeCommonsAppData` only when the owner allowed
agent data access for that app.
