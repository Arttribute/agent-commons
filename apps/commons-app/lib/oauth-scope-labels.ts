const GOOGLE_SCOPES: Record<string, string> = {
  "gmail.readonly": "Read your email",
  "gmail.send": "Send email as you",
  "gmail.compose": "Draft and send email as you",
  "gmail.modify": "Read, organize, and send your email",
  "gmail.labels": "Manage your email labels",
  "calendar": "See and edit your calendar",
  "calendar.readonly": "See your calendar",
  "calendar.events": "See and edit your calendar events",
  "calendar.events.readonly": "See your calendar events",
  "drive": "See and edit all your Drive files",
  "drive.file": "See and edit files you open with Agent Commons",
  "drive.readonly": "See your Drive files",
  "documents": "See and edit your Google Docs",
  "documents.readonly": "See your Google Docs",
  "spreadsheets": "See and edit your Google Sheets",
  "spreadsheets.readonly": "See your Google Sheets",
  "presentations": "See and edit your Google Slides",
  "userinfo.email": "See your email address",
  "userinfo.profile": "See your basic profile",
};

/** Plain-language text for an OAuth scope, with a readable fallback. */
export function describeOAuthScope(scope: string) {
  if (scope === "oauth") return "Connect your HubSpot account";
  if (scope === "crm.objects.contacts.read") return "Read CRM contacts and notes";
  if (scope === "crm.objects.contacts.write") return "Create and update CRM contacts and notes";
  if (scope === "openid") return "Confirm who you are";
  if (scope === "email") return "See your email address";
  if (scope === "profile") return "See your basic profile";
  const google = /^https:\/\/www\.googleapis\.com\/auth\/(.+)$/.exec(scope)?.[1];
  if (google) return GOOGLE_SCOPES[google] ?? `Use ${google.replace(/[._]/g, " ")}`;
  const tail = scope.split(/[/:]/).filter(Boolean).at(-1) ?? scope;
  const readable = tail.replace(/[._-]+/g, " ").trim();
  return readable.charAt(0).toUpperCase() + readable.slice(1);
}
