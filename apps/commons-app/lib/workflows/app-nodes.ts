import type { WorkflowDataType } from "./type-mapping";

/**
 * App integration operations exposed as workflow tool nodes.
 *
 * The tools catalog lists integrations at the service level (Gmail, Linear,
 * Notion MCP, …) for connection management, but workflow steps operate at
 * the action level (send an email, create an issue). These definitions
 * bridge that gap: each op carries a ChatGPT-function-format schema so the
 * canvas can derive typed input ports, plus explicit outputs since return
 * shapes can't be inferred from the schema.
 *
 * `toolName` is the execution contract with the backend — a static tool
 * service (or the MCP bridge) must expose a method of the same name.
 *
 * Note: Google op ids keep the historical `google:` prefix so workflows
 * saved before the module covered non-Google apps still hydrate.
 */
export interface AppWorkflowOp {
  /** Stable id, used as the node's toolId (e.g. "app:linear.createIssue") */
  id: string;
  /** Service the op belongs to — matches the studio/tools catalog card */
  service: string;
  label: string;
  toolName: string;
  description: string;
  schema: {
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: {
        type: "object";
        properties: Record<string, any>;
        required?: string[];
      };
    };
  };
  outputs: Array<{ name: string; type: WorkflowDataType; description?: string }>;
}

function op(
  service: string,
  id: string,
  label: string,
  toolName: string,
  description: string,
  properties: Record<string, any>,
  required: string[],
  outputs: AppWorkflowOp["outputs"]
): AppWorkflowOp {
  return {
    id,
    service,
    label,
    toolName,
    description,
    schema: {
      type: "function",
      function: {
        name: toolName,
        description,
        parameters: { type: "object", properties, required },
      },
    },
    outputs,
  };
}

export const APP_WORKFLOW_OPS: AppWorkflowOp[] = [
  // ── Gmail ────────────────────────────────────────────────────────────
  op(
    "Gmail",
    "google:gmail.searchEmails",
    "Search emails",
    "gmailSearchEmails",
    "Search the connected Gmail inbox with a Gmail query (e.g. from:, subject:, newer_than:).",
    {
      query: { type: "string", description: "Gmail search query" },
      maxResults: { type: "number", description: "Maximum messages to return (default 10)" },
    },
    ["query"],
    [
      { name: "messages", type: "array", description: "Matching messages with id, from, subject, snippet" },
      { name: "resultCount", type: "number", description: "Number of messages returned" },
    ]
  ),
  op(
    "Gmail",
    "google:gmail.readEmail",
    "Read email",
    "gmailReadEmail",
    "Read a single email by message id, returning headers and the decoded body.",
    {
      messageId: { type: "string", description: "Gmail message id" },
    },
    ["messageId"],
    [
      { name: "message", type: "object", description: "Full message with headers and metadata" },
      { name: "body", type: "string", description: "Decoded plain-text body" },
    ]
  ),
  op(
    "Gmail",
    "google:gmail.sendEmail",
    "Send email",
    "gmailSendEmail",
    "Send an email from the connected Gmail account.",
    {
      to: { type: "string", description: "Recipient address (comma-separate multiple)" },
      subject: { type: "string", description: "Email subject" },
      body: { type: "string", description: "Plain-text or HTML body" },
      cc: { type: "string", description: "CC addresses (optional)" },
    },
    ["to", "subject", "body"],
    [
      { name: "messageId", type: "string", description: "Id of the sent message" },
      { name: "threadId", type: "string", description: "Thread the message belongs to" },
    ]
  ),
  op(
    "Gmail",
    "google:gmail.createDraft",
    "Create draft",
    "gmailCreateDraft",
    "Create a Gmail draft without sending it — useful before a human-approval step.",
    {
      to: { type: "string", description: "Recipient address" },
      subject: { type: "string", description: "Email subject" },
      body: { type: "string", description: "Draft body" },
    },
    ["to", "subject", "body"],
    [{ name: "draftId", type: "string", description: "Id of the created draft" }]
  ),

  // ── Google Drive ─────────────────────────────────────────────────────
  op(
    "Google Drive",
    "google:drive.searchFiles",
    "Search files",
    "driveSearchFiles",
    "Search Drive by name or full text and return matching files.",
    {
      query: { type: "string", description: "Search text or Drive query expression" },
      maxResults: { type: "number", description: "Maximum files to return (default 10)" },
    },
    ["query"],
    [{ name: "files", type: "array", description: "Files with id, name, mimeType, webViewLink" }]
  ),
  op(
    "Google Drive",
    "google:drive.readFile",
    "Read file",
    "driveReadFile",
    "Read a Drive file's content by id (Docs/Sheets exported as text, others downloaded).",
    {
      fileId: { type: "string", description: "Drive file id" },
    },
    ["fileId"],
    [
      { name: "content", type: "string", description: "File content as text" },
      { name: "file", type: "object", description: "File metadata" },
    ]
  ),
  op(
    "Google Drive",
    "google:drive.createFile",
    "Create file",
    "driveCreateFile",
    "Create a new file in Drive with the given content.",
    {
      name: { type: "string", description: "File name" },
      content: { type: "string", description: "File content" },
      mimeType: { type: "string", description: "MIME type (default text/plain)" },
      folderId: { type: "string", description: "Parent folder id (optional)" },
    },
    ["name", "content"],
    [
      { name: "fileId", type: "string", description: "Id of the created file" },
      { name: "webViewLink", type: "string", description: "Link to open the file" },
    ]
  ),

  // ── Google Calendar ──────────────────────────────────────────────────
  op(
    "Google Calendar",
    "google:calendar.listEvents",
    "List events",
    "calendarListEvents",
    "List upcoming events from a calendar within an optional time window.",
    {
      calendarId: { type: "string", description: "Calendar id (default: primary)" },
      timeMin: { type: "string", description: "ISO start of window (optional)" },
      timeMax: { type: "string", description: "ISO end of window (optional)" },
      maxResults: { type: "number", description: "Maximum events to return (default 10)" },
    },
    [],
    [{ name: "events", type: "array", description: "Events with id, summary, start, end, attendees" }]
  ),
  op(
    "Google Calendar",
    "google:calendar.createEvent",
    "Create event",
    "calendarCreateEvent",
    "Create a calendar event and optionally invite attendees.",
    {
      summary: { type: "string", description: "Event title" },
      startTime: { type: "string", description: "ISO start datetime" },
      endTime: { type: "string", description: "ISO end datetime" },
      description: { type: "string", description: "Event description (optional)" },
      attendees: {
        type: "array",
        items: { type: "string" },
        description: "Attendee email addresses (optional)",
      },
    },
    ["summary", "startTime", "endTime"],
    [
      { name: "eventId", type: "string", description: "Id of the created event" },
      { name: "htmlLink", type: "string", description: "Link to the event" },
    ]
  ),

  // ── Google Docs ──────────────────────────────────────────────────────
  op(
    "Google Docs",
    "google:docs.createDocument",
    "Create document",
    "docsCreateDocument",
    "Create a Google Doc, optionally seeded with initial content.",
    {
      title: { type: "string", description: "Document title" },
      content: { type: "string", description: "Initial body text (optional)" },
    },
    ["title"],
    [
      { name: "documentId", type: "string", description: "Id of the created document" },
      { name: "url", type: "string", description: "Link to open the document" },
    ]
  ),
  op(
    "Google Docs",
    "google:docs.readDocument",
    "Read document",
    "docsReadDocument",
    "Read a Google Doc's body as plain text.",
    {
      documentId: { type: "string", description: "Document id" },
    },
    ["documentId"],
    [{ name: "content", type: "string", description: "Document body as text" }]
  ),
  op(
    "Google Docs",
    "google:docs.appendText",
    "Append text",
    "docsAppendText",
    "Append text to the end of an existing Google Doc.",
    {
      documentId: { type: "string", description: "Document id" },
      text: { type: "string", description: "Text to append" },
    },
    ["documentId", "text"],
    [{ name: "result", type: "object", description: "Update result" }]
  ),

  // ── Google Sheets ────────────────────────────────────────────────────
  op(
    "Google Sheets",
    "google:sheets.readRange",
    "Read range",
    "sheetsReadRange",
    "Read cell values from a spreadsheet range in A1 notation.",
    {
      spreadsheetId: { type: "string", description: "Spreadsheet id" },
      range: { type: "string", description: "A1 range, e.g. Sheet1!A1:D20" },
    },
    ["spreadsheetId", "range"],
    [{ name: "values", type: "array", description: "Rows of cell values" }]
  ),
  op(
    "Google Sheets",
    "google:sheets.appendRow",
    "Append row",
    "sheetsAppendRow",
    "Append a row of values after the last row of a range.",
    {
      spreadsheetId: { type: "string", description: "Spreadsheet id" },
      range: { type: "string", description: "A1 range identifying the table, e.g. Sheet1!A:D" },
      values: {
        type: "array",
        items: { type: "string" },
        description: "Cell values for the new row",
      },
    },
    ["spreadsheetId", "range", "values"],
    [{ name: "result", type: "object", description: "Append result with updated range" }]
  ),
  op(
    "Google Sheets",
    "google:sheets.updateRange",
    "Update range",
    "sheetsUpdateRange",
    "Overwrite cell values in a spreadsheet range.",
    {
      spreadsheetId: { type: "string", description: "Spreadsheet id" },
      range: { type: "string", description: "A1 range to write" },
      values: {
        type: "array",
        items: { type: "array" },
        description: "2D array of rows and cell values",
      },
    },
    ["spreadsheetId", "range", "values"],
    [{ name: "result", type: "object", description: "Update result with cells changed" }]
  ),

  // ── Google Slides ────────────────────────────────────────────────────
  op(
    "Google Slides",
    "google:slides.createPresentation",
    "Create presentation",
    "slidesCreatePresentation",
    "Create an empty Google Slides presentation.",
    {
      title: { type: "string", description: "Presentation title" },
    },
    ["title"],
    [
      { name: "presentationId", type: "string", description: "Id of the created presentation" },
      { name: "url", type: "string", description: "Link to open the presentation" },
    ]
  ),

  // ── Google Tasks ─────────────────────────────────────────────────────
  op(
    "Google Tasks",
    "google:tasks.createTask",
    "Create task",
    "tasksCreateTask",
    "Create a task in the default Google Tasks list.",
    {
      title: { type: "string", description: "Task title" },
      notes: { type: "string", description: "Task notes (optional)" },
      due: { type: "string", description: "ISO due date (optional)" },
    },
    ["title"],
    [{ name: "taskId", type: "string", description: "Id of the created task" }]
  ),
  op(
    "Google Tasks",
    "google:tasks.listTasks",
    "List tasks",
    "tasksListTasks",
    "List tasks from the default Google Tasks list.",
    {
      maxResults: { type: "number", description: "Maximum tasks to return (default 20)" },
    },
    [],
    [{ name: "tasks", type: "array", description: "Tasks with id, title, status, due" }]
  ),

  // ── Google Contacts ──────────────────────────────────────────────────
  op(
    "Google Contacts",
    "google:contacts.search",
    "Search contacts",
    "contactsSearchContacts",
    "Search the connected account's contacts by name or email.",
    {
      query: { type: "string", description: "Name or email to search for" },
    },
    ["query"],
    [{ name: "contacts", type: "array", description: "Contacts with name, email, phone" }]
  ),

  // ── GitHub ───────────────────────────────────────────────────────────
  op(
    "GitHub",
    "app:github.createIssue",
    "Create issue",
    "githubCreateIssue",
    "Create an issue in a GitHub repository.",
    {
      repo: { type: "string", description: "Repository as owner/name" },
      title: { type: "string", description: "Issue title" },
      body: { type: "string", description: "Issue body in Markdown (optional)" },
      labels: {
        type: "array",
        items: { type: "string" },
        description: "Label names (optional)",
      },
    },
    ["repo", "title"],
    [
      { name: "issueNumber", type: "number", description: "Number of the created issue" },
      { name: "url", type: "string", description: "Link to the issue" },
    ]
  ),
  op(
    "GitHub",
    "app:github.searchIssues",
    "Search issues",
    "githubSearchIssues",
    "Search issues and pull requests with GitHub's search syntax.",
    {
      query: { type: "string", description: "GitHub search query, e.g. repo:o/r is:open label:bug" },
      maxResults: { type: "number", description: "Maximum results to return (default 10)" },
    },
    ["query"],
    [{ name: "issues", type: "array", description: "Issues with number, title, state, url" }]
  ),
  op(
    "GitHub",
    "app:github.listPullRequests",
    "List pull requests",
    "githubListPullRequests",
    "List pull requests for a repository.",
    {
      repo: { type: "string", description: "Repository as owner/name" },
      state: { type: "string", description: "open, closed, or all (default open)" },
    },
    ["repo"],
    [{ name: "pullRequests", type: "array", description: "PRs with number, title, author, state" }]
  ),
  op(
    "GitHub",
    "app:github.getFileContent",
    "Get file content",
    "githubGetFileContent",
    "Read a file from a repository at an optional ref.",
    {
      repo: { type: "string", description: "Repository as owner/name" },
      path: { type: "string", description: "File path within the repo" },
      ref: { type: "string", description: "Branch, tag, or commit (optional)" },
    },
    ["repo", "path"],
    [{ name: "content", type: "string", description: "File content as text" }]
  ),

  // ── Slack ────────────────────────────────────────────────────────────
  op(
    "Slack",
    "app:slack.sendMessage",
    "Send message",
    "slackSendMessage",
    "Send a message to a Slack channel or user.",
    {
      channel: { type: "string", description: "Channel name, channel id, or user id" },
      text: { type: "string", description: "Message text (Slack markdown supported)" },
    },
    ["channel", "text"],
    [
      { name: "messageTs", type: "string", description: "Timestamp id of the sent message" },
      { name: "channel", type: "string", description: "Channel the message was posted to" },
    ]
  ),
  op(
    "Slack",
    "app:slack.searchMessages",
    "Search messages",
    "slackSearchMessages",
    "Search workspace messages with Slack's search syntax.",
    {
      query: { type: "string", description: "Search query, e.g. in:#general from:@jane" },
      maxResults: { type: "number", description: "Maximum results to return (default 10)" },
    },
    ["query"],
    [{ name: "messages", type: "array", description: "Messages with text, user, channel, ts" }]
  ),

  // ── Linear ───────────────────────────────────────────────────────────
  op(
    "Linear",
    "app:linear.createIssue",
    "Create issue",
    "linearCreateIssue",
    "Create an issue in Linear.",
    {
      title: { type: "string", description: "Issue title" },
      description: { type: "string", description: "Issue description in Markdown (optional)" },
      teamKey: { type: "string", description: "Team key, e.g. ENG (optional, default team otherwise)" },
      priority: { type: "number", description: "0 none · 1 urgent · 2 high · 3 medium · 4 low" },
    },
    ["title"],
    [
      { name: "issueId", type: "string", description: "Id of the created issue" },
      { name: "identifier", type: "string", description: "Human identifier, e.g. ENG-142" },
      { name: "url", type: "string", description: "Link to the issue" },
    ]
  ),
  op(
    "Linear",
    "app:linear.searchIssues",
    "Search issues",
    "linearSearchIssues",
    "Search Linear issues by text.",
    {
      query: { type: "string", description: "Search text" },
      maxResults: { type: "number", description: "Maximum results to return (default 10)" },
    },
    ["query"],
    [{ name: "issues", type: "array", description: "Issues with identifier, title, state, assignee" }]
  ),
  op(
    "Linear",
    "app:linear.updateIssue",
    "Update issue",
    "linearUpdateIssue",
    "Update an existing Linear issue's title, description, or workflow state.",
    {
      issueId: { type: "string", description: "Issue id or identifier, e.g. ENG-142" },
      title: { type: "string", description: "New title (optional)" },
      description: { type: "string", description: "New description (optional)" },
      stateName: { type: "string", description: "Workflow state name, e.g. In Progress (optional)" },
    },
    ["issueId"],
    [{ name: "issue", type: "object", description: "Updated issue" }]
  ),

  // ── Notion ───────────────────────────────────────────────────────────
  op(
    "Notion",
    "app:notion.searchPages",
    "Search pages",
    "notionSearchPages",
    "Search pages and databases in the connected Notion workspace.",
    {
      query: { type: "string", description: "Search text" },
      maxResults: { type: "number", description: "Maximum results to return (default 10)" },
    },
    ["query"],
    [{ name: "pages", type: "array", description: "Pages with id, title, url" }]
  ),
  op(
    "Notion",
    "app:notion.createPage",
    "Create page",
    "notionCreatePage",
    "Create a Notion page, optionally under a parent page.",
    {
      title: { type: "string", description: "Page title" },
      content: { type: "string", description: "Initial content in Markdown (optional)" },
      parentPageId: { type: "string", description: "Parent page id (optional)" },
    },
    ["title"],
    [
      { name: "pageId", type: "string", description: "Id of the created page" },
      { name: "url", type: "string", description: "Link to the page" },
    ]
  ),
  op(
    "Notion",
    "app:notion.appendContent",
    "Append content",
    "notionAppendContent",
    "Append content blocks to an existing Notion page.",
    {
      pageId: { type: "string", description: "Page id" },
      content: { type: "string", description: "Content to append, in Markdown" },
    },
    ["pageId", "content"],
    [{ name: "result", type: "object", description: "Append result" }]
  ),

  // ── Canva ────────────────────────────────────────────────────────────
  op(
    "Canva",
    "app:canva.createDesign",
    "Create design",
    "canvaCreateDesign",
    "Create a new Canva design of a given type.",
    {
      designType: { type: "string", description: "Design type, e.g. presentation, instagram-post" },
      title: { type: "string", description: "Design title (optional)" },
    },
    ["designType"],
    [
      { name: "designId", type: "string", description: "Id of the created design" },
      { name: "editUrl", type: "string", description: "Link to edit the design in Canva" },
    ]
  ),
  op(
    "Canva",
    "app:canva.exportDesign",
    "Export design",
    "canvaExportDesign",
    "Export a Canva design to a downloadable file.",
    {
      designId: { type: "string", description: "Design id" },
      format: { type: "string", description: "pdf, png, or jpg (default pdf)" },
    },
    ["designId"],
    [{ name: "exportUrl", type: "string", description: "Download link for the export" }]
  ),

  // ── Stripe ───────────────────────────────────────────────────────────
  op(
    "Stripe",
    "app:stripe.createPaymentLink",
    "Create payment link",
    "stripeCreatePaymentLink",
    "Create a shareable Stripe payment link for a product and amount.",
    {
      productName: { type: "string", description: "What the customer is paying for" },
      amount: { type: "number", description: "Amount in the currency's minor units, e.g. cents" },
      currency: { type: "string", description: "ISO currency code, e.g. usd" },
    },
    ["productName", "amount", "currency"],
    [
      { name: "url", type: "string", description: "Shareable payment link" },
      { name: "paymentLinkId", type: "string", description: "Id of the payment link" },
    ]
  ),
  op(
    "Stripe",
    "app:stripe.listCustomers",
    "List customers",
    "stripeListCustomers",
    "List Stripe customers, optionally filtered by email.",
    {
      email: { type: "string", description: "Filter by exact email (optional)" },
      maxResults: { type: "number", description: "Maximum customers to return (default 10)" },
    },
    [],
    [{ name: "customers", type: "array", description: "Customers with id, email, name" }]
  ),

  // ── PostgreSQL ───────────────────────────────────────────────────────
  op(
    "PostgreSQL",
    "app:postgres.runQuery",
    "Run query",
    "postgresRunQuery",
    "Run a read-only SQL query against the connected Postgres database.",
    {
      query: { type: "string", description: "SQL query (SELECT)" },
      params: {
        type: "array",
        items: { type: "string" },
        description: "Positional query parameters (optional)",
      },
    },
    ["query"],
    [
      { name: "rows", type: "array", description: "Result rows" },
      { name: "rowCount", type: "number", description: "Number of rows returned" },
    ]
  ),

  // ── Fetch ────────────────────────────────────────────────────────────
  op(
    "Fetch",
    "app:fetch.webPage",
    "Fetch web page",
    "fetchWebPage",
    "Fetch a web page and return its content as model-friendly text.",
    {
      url: { type: "string", description: "Page URL" },
      maxLength: { type: "number", description: "Maximum characters to return (optional)" },
    },
    ["url"],
    [{ name: "content", type: "string", description: "Page content as text/markdown" }]
  ),

  // ── Filesystem ───────────────────────────────────────────────────────
  op(
    "Filesystem",
    "app:filesystem.readFile",
    "Read file",
    "filesystemReadFile",
    "Read a file from the server's allowed directories.",
    {
      path: { type: "string", description: "File path within an allowed directory" },
    },
    ["path"],
    [{ name: "content", type: "string", description: "File content as text" }]
  ),
  op(
    "Filesystem",
    "app:filesystem.writeFile",
    "Write file",
    "filesystemWriteFile",
    "Write content to a file in the server's allowed directories.",
    {
      path: { type: "string", description: "File path within an allowed directory" },
      content: { type: "string", description: "Content to write" },
    },
    ["path", "content"],
    [{ name: "result", type: "object", description: "Write result" }]
  ),
  op(
    "Filesystem",
    "app:filesystem.listDirectory",
    "List directory",
    "filesystemListDirectory",
    "List files and folders in an allowed directory.",
    {
      path: { type: "string", description: "Directory path" },
    },
    ["path"],
    [{ name: "entries", type: "array", description: "Directory entries with name and type" }]
  ),

  // ── Memory ───────────────────────────────────────────────────────────
  op(
    "Memory",
    "app:memory.store",
    "Store memory",
    "memoryStore",
    "Store a fact or observation in the knowledge-graph memory server.",
    {
      content: { type: "string", description: "The fact to remember" },
      entity: { type: "string", description: "Entity the fact is about (optional)" },
    },
    ["content"],
    [{ name: "result", type: "object", description: "Stored memory node" }]
  ),
  op(
    "Memory",
    "app:memory.search",
    "Search memory",
    "memorySearch",
    "Search stored memories by text.",
    {
      query: { type: "string", description: "Search text" },
    },
    ["query"],
    [{ name: "memories", type: "array", description: "Matching memories" }]
  ),

  // ── Time ─────────────────────────────────────────────────────────────
  op(
    "Time",
    "app:time.now",
    "Current time",
    "timeGetCurrentTime",
    "Get the current date and time in a given timezone.",
    {
      timezone: { type: "string", description: "IANA timezone, e.g. Africa/Nairobi (default UTC)" },
    },
    [],
    [{ name: "datetime", type: "string", description: "Current ISO datetime in the timezone" }]
  ),
  op(
    "Time",
    "app:time.convert",
    "Convert timezone",
    "timeConvertTimezone",
    "Convert a datetime from one timezone to another.",
    {
      datetime: { type: "string", description: "ISO datetime to convert" },
      fromTimezone: { type: "string", description: "Source IANA timezone" },
      toTimezone: { type: "string", description: "Target IANA timezone" },
    },
    ["datetime", "fromTimezone", "toTimezone"],
    [{ name: "datetime", type: "string", description: "Converted ISO datetime" }]
  ),

  // ── Playwright ───────────────────────────────────────────────────────
  op(
    "Playwright",
    "app:playwright.browsePage",
    "Browse page",
    "playwrightBrowsePage",
    "Open a page in a headless browser and return an accessibility snapshot of its content — handles JavaScript-rendered pages Fetch can't.",
    {
      url: { type: "string", description: "Page URL" },
      waitFor: { type: "string", description: "CSS selector to wait for before capturing (optional)" },
    },
    ["url"],
    [{ name: "snapshot", type: "string", description: "Accessibility snapshot of the page" }]
  ),
];

/** Distinct services in palette order, for grouped rendering */
export const APP_SERVICES: string[] = [
  ...new Set(APP_WORKFLOW_OPS.map((op) => op.service)),
];

/**
 * Look up an op for a saved workflow node, so ports and schema can be
 * restored on load (app ops have no backend `tool` row to hydrate from).
 */
export function findAppWorkflowOp(
  toolId?: string,
  toolName?: string
): AppWorkflowOp | undefined {
  if (!toolId && !toolName) return undefined;
  return APP_WORKFLOW_OPS.find(
    (op) => op.id === toolId || op.toolName === toolName || op.toolName === toolId
  );
}
