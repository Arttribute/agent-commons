import type { WorkflowDataType } from "./type-mapping";

/**
 * Google Workspace operations exposed as workflow tool nodes.
 *
 * The tools catalog lists Google Workspace at the service level (Gmail,
 * Drive, …) for OAuth connection management, but workflow steps operate at
 * the action level (send an email, append a row). These definitions bridge
 * that gap: each op carries a ChatGPT-function-format schema so the canvas
 * can derive typed input ports, plus explicit outputs since return shapes
 * can't be inferred from the schema.
 *
 * `toolName` is the execution contract with the backend — a static Google
 * Workspace tool service must expose a method of the same name.
 */
export interface GoogleWorkspaceOp {
  /** Stable id, used as the node's toolId (e.g. "google:gmail.sendEmail") */
  id: string;
  /** Service the op belongs to (matches brand icon + catalog card) */
  service:
    | "Gmail"
    | "Google Drive"
    | "Google Calendar"
    | "Google Docs"
    | "Google Sheets"
    | "Google Slides"
    | "Google Tasks"
    | "Google Contacts";
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
  service: GoogleWorkspaceOp["service"],
  key: string,
  label: string,
  toolName: string,
  description: string,
  properties: Record<string, any>,
  required: string[],
  outputs: GoogleWorkspaceOp["outputs"]
): GoogleWorkspaceOp {
  return {
    id: `google:${key}`,
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

export const GOOGLE_WORKSPACE_OPS: GoogleWorkspaceOp[] = [
  // ── Gmail ────────────────────────────────────────────────────────────
  op(
    "Gmail",
    "gmail.searchEmails",
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
    "gmail.readEmail",
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
    "gmail.sendEmail",
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
    "gmail.createDraft",
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
    "drive.searchFiles",
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
    "drive.readFile",
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
    "drive.createFile",
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
    "calendar.listEvents",
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
    "calendar.createEvent",
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
    "docs.createDocument",
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
    "docs.readDocument",
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
    "docs.appendText",
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
    "sheets.readRange",
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
    "sheets.appendRow",
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
    "sheets.updateRange",
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
    "slides.createPresentation",
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
    "tasks.createTask",
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
    "tasks.listTasks",
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
    "contacts.search",
    "Search contacts",
    "contactsSearchContacts",
    "Search the connected account's contacts by name or email.",
    {
      query: { type: "string", description: "Name or email to search for" },
    },
    ["query"],
    [{ name: "contacts", type: "array", description: "Contacts with name, email, phone" }]
  ),
];

/**
 * Look up an op for a saved workflow node, so ports and schema can be
 * restored on load (Google ops have no backend `tool` row to hydrate from).
 */
export function findGoogleWorkspaceOp(
  toolId?: string,
  toolName?: string
): GoogleWorkspaceOp | undefined {
  if (!toolId && !toolName) return undefined;
  return GOOGLE_WORKSPACE_OPS.find(
    (op) => op.id === toolId || op.toolName === toolName || op.toolName === toolId
  );
}
