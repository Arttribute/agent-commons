import { normalizeCourseTheme, type CourseTheme } from "./course-theme.ts";
import {
  decodeOtherResponse,
  isCardCollectionResponse,
  isLinkedScorecardResponse,
  isPrioritizationResponse,
  isWorksheetResponse,
} from "./live-response-policy.ts";
import type {
  LiveActivity,
  LiveResponseRecord,
  LiveSessionPart,
} from "../types/live-session.ts";

type WorkbookExportInput = {
  courseTitle: string;
  sessionTitle: string;
  learnerName: string;
  activities: LiveActivity[];
  parts: LiveSessionPart[];
  responses: Record<string, LiveResponseRecord>;
  courseTheme?: Partial<CourseTheme> | null;
  activityId?: string;
  generatedAt?: Date;
};

export function createLearnerWorkbookHtml(input: WorkbookExportInput) {
  const theme = normalizeCourseTheme(input.courseTheme);
  const activityById = new Map(
    input.activities.map((activity) => [activity.id, activity]),
  );
  const includedActivities = input.activities.filter(
    (activity) =>
      Boolean(input.responses[activity.id]) &&
      (!input.activityId || activity.id === input.activityId),
  );
  const includedIds = new Set(
    includedActivities.map((activity) => activity.id),
  );
  const grouped = input.parts.flatMap((part) => {
    const activities = part.activityIds.flatMap((id) => {
      const activity = activityById.get(id);
      return activity && includedIds.has(id) ? [activity] : [];
    });
    return activities.length ? [{ title: part.title, activities }] : [];
  });
  const groupedIds = new Set(
    grouped.flatMap((group) => group.activities.map((activity) => activity.id)),
  );
  const ungrouped = includedActivities.filter(
    (activity) => !groupedIds.has(activity.id),
  );
  if (ungrouped.length) {
    grouped.push({
      title: input.parts.length ? "Other activities" : "Activities",
      activities: ungrouped,
    });
  }
  const generatedAt = input.generatedAt || new Date();
  const activityCount = includedActivities.length;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(input.sessionTitle)} · My workbook</title>
  <style>
    :root { --primary: ${theme.primary}; --accent: ${theme.accent}; --highlight: ${theme.highlight}; --background: ${theme.background}; --surface: ${theme.surface}; --text: ${theme.text}; }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--background); color: var(--text); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.55; }
    main { width: min(920px, calc(100% - 32px)); margin: 40px auto 72px; }
    .cover { overflow: hidden; border-radius: 24px; background: var(--primary); color: white; padding: 42px; box-shadow: 0 16px 45px rgba(15, 23, 42, .12); }
    .eyebrow { margin: 0 0 14px; color: var(--accent); font-size: 12px; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; }
    h1 { max-width: 720px; margin: 0; font-size: clamp(30px, 5vw, 48px); line-height: 1.08; letter-spacing: -.035em; }
    .cover-meta { display: flex; flex-wrap: wrap; gap: 10px 26px; margin-top: 28px; font-size: 13px; opacity: .78; }
    .print-note { margin: 18px 0 0; font-size: 12px; opacity: .66; }
    .part { margin-top: 40px; }
    .part-title { margin: 0 0 14px; font-size: 13px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; opacity: .58; }
    .activity { break-inside: avoid; margin: 0 0 18px; overflow: hidden; border: 1px solid rgba(148, 163, 184, .32); border-radius: 18px; background: var(--surface); box-shadow: 0 8px 28px rgba(15, 23, 42, .05); }
    .activity-head { padding: 24px 26px 18px; border-bottom: 1px solid rgba(148, 163, 184, .22); }
    .activity-kind { display: inline-block; border-radius: 999px; background: var(--accent); color: #0f172a; padding: 5px 9px; font-size: 10px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
    h2 { margin: 14px 0 0; font-size: 24px; line-height: 1.25; letter-spacing: -.02em; }
    .prompt { margin: 10px 0 0; color: color-mix(in srgb, var(--text) 74%, transparent); white-space: pre-wrap; }
    .response-meta { margin: 9px 0 0; font-size: 11px; opacity: .55; }
    .answer { padding: 22px 26px 26px; }
    .prose-answer { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
    .answer-list { margin: 0; padding-left: 20px; }
    .answer-list li + li { margin-top: 7px; }
    .card { margin-top: 14px; border: 1px solid rgba(148, 163, 184, .3); border-radius: 14px; padding: 17px; }
    .card:first-child { margin-top: 0; }
    .card h3 { margin: 0 0 12px; font-size: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 10px 12px; border-bottom: 1px solid rgba(148, 163, 184, .24); text-align: left; vertical-align: top; overflow-wrap: anywhere; }
    th { width: 32%; color: color-mix(in srgb, var(--text) 62%, transparent); font-size: 11px; letter-spacing: .05em; text-transform: uppercase; }
    tr:last-child th, tr:last-child td { border-bottom: 0; }
    .selected { border-left: 4px solid var(--highlight); background: color-mix(in srgb, var(--highlight) 13%, var(--surface)); }
    .pill { display: inline-flex; border-radius: 999px; padding: 3px 8px; background: color-mix(in srgb, var(--highlight) 22%, var(--surface)); font-size: 11px; font-weight: 800; }
    .empty { opacity: .5; font-style: italic; }
    footer { margin-top: 28px; text-align: center; font-size: 11px; opacity: .5; }
    @media (max-width: 600px) { main { width: min(100% - 20px, 920px); margin-top: 10px; } .cover { padding: 28px 22px; border-radius: 18px; } .activity-head, .answer { padding-left: 18px; padding-right: 18px; } th, td { display: block; width: 100%; padding-left: 0; padding-right: 0; } th { border-bottom: 0; padding-bottom: 2px; } td { padding-top: 2px; } }
    @media print { body { background: white; } main { width: 100%; margin: 0; } .cover { box-shadow: none; print-color-adjust: exact; -webkit-print-color-adjust: exact; } .activity { box-shadow: none; } .print-note { display: none; } }
  </style>
</head>
<body>
  <main>
    <header class="cover">
      <p class="eyebrow">${escapeHtml(input.courseTitle)}</p>
      <h1>${escapeHtml(input.activityId ? includedActivities[0]?.title || "My response" : "My live workbook")}</h1>
      <div class="cover-meta">
        <span>${escapeHtml(input.learnerName)}</span>
        <span>${activityCount} saved ${activityCount === 1 ? "activity" : "activities"}</span>
        <span>Downloaded ${escapeHtml(formatDate(generatedAt))}</span>
      </div>
      <p class="print-note">This file works offline. Open it in a browser and choose Print → Save as PDF for a PDF copy.</p>
    </header>
    ${grouped.map((group) => renderGroup(group.title, group.activities, input.responses, activityById)).join("\n")}
    <footer>Downloaded from CommonLab · ${escapeHtml(input.sessionTitle)}</footer>
  </main>
</body>
</html>`;
}

export function learnerWorkbookFilename(
  sessionTitle: string,
  activityTitle?: string,
) {
  const stem = activityTitle
    ? `${sessionTitle}-${activityTitle}-response`
    : `${sessionTitle}-my-workbook`;
  const slug = stem
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
  return `${slug || "my-live-workbook"}.html`;
}

function renderGroup(
  title: string,
  activities: LiveActivity[],
  responses: Record<string, LiveResponseRecord>,
  activityById: Map<string, LiveActivity>,
) {
  return `<section class="part">
    <h2 class="part-title">${escapeHtml(title)}</h2>
    ${activities.map((activity) => renderActivity(activity, responses[activity.id], responses, activityById)).join("\n")}
  </section>`;
}

function renderActivity(
  activity: LiveActivity,
  response: LiveResponseRecord,
  responses: Record<string, LiveResponseRecord>,
  activityById: Map<string, LiveActivity>,
) {
  const value = response.value;
  const finalized = responseState(value);
  return `<article class="activity">
    <header class="activity-head">
      <span class="activity-kind">${escapeHtml(activityLabel(activity))}</span>
      <h2>${escapeHtml(activity.title || activityLabel(activity))}</h2>
      ${activity.prompt ? `<p class="prompt">${escapeHtml(activity.prompt)}</p>` : ""}
      <p class="response-meta">${escapeHtml(finalized)} · Saved ${escapeHtml(formatDate(new Date(response.submittedAt)))}</p>
    </header>
    <div class="answer">${renderValue(activity, value, responses, activityById)}</div>
  </article>`;
}

function renderValue(
  activity: LiveActivity,
  value: LiveResponseRecord["value"],
  responses: Record<string, LiveResponseRecord>,
  activityById: Map<string, LiveActivity>,
) {
  if (isPrioritizationResponse(value)) {
    return `<table><tbody>${value.items
      .map(
        (item) =>
          `<tr${item.selected ? ' class="selected"' : ""}><th>${item.selected ? "Selected" : "Captured"}</th><td>${escapeHtml(item.text)}</td></tr>`,
      )
      .join("")}</tbody></table>`;
  }
  if (isWorksheetResponse(value)) {
    return renderFields(activity, value.values);
  }
  if (isCardCollectionResponse(value)) {
    return value.items
      .map((item, index) => {
        const titleField = activity.itemTitleFieldId;
        const title = titleField ? item.values[titleField] : undefined;
        return `<section class="card"><h3>${escapeHtml(String(title || `Entry ${index + 1}`))}</h3>${renderFields(activity, item.values)}</section>`;
      })
      .join("");
  }
  if (isLinkedScorecardResponse(value)) {
    const sourceActivity = activity.sourceActivityId
      ? activityById.get(activity.sourceActivityId)
      : undefined;
    const sourceValue = activity.sourceActivityId
      ? responses[activity.sourceActivityId]?.value
      : undefined;
    const sourceItems = isCardCollectionResponse(sourceValue)
      ? new Map(
          sourceValue.items.map((item, index) => [
            item.id,
            String(
              (sourceActivity?.itemTitleFieldId
                ? item.values[sourceActivity.itemTitleFieldId]
                : undefined) || `Entry ${index + 1}`,
            ),
          ]),
        )
      : new Map<string, string>();
    const cards = value.items
      .map((item) => {
        const selected = item.sourceItemId === value.selectedItemId;
        const title = sourceItems.get(item.sourceItemId) || "Task";
        return `<section class="card${selected ? " selected" : ""}"><h3>${escapeHtml(title)} ${selected ? '<span class="pill">Selected priority</span>' : ""}</h3><table><tbody>${(
          activity.scoreCriteria || []
        )
          .map(
            (criterion) =>
              `<tr><th>${escapeHtml(criterion.label)}</th><td>${escapeHtml(displayValue(item.scores[criterion.id]))}</td></tr>`,
          )
          .join("")}</tbody></table></section>`;
      })
      .join("");
    const reason = value.selectionReason
      ? `<section class="card"><h3>Why I chose this priority</h3><p class="prose-answer">${escapeHtml(value.selectionReason)}</p></section>`
      : "";
    return cards + reason;
  }
  const values = Array.isArray(value) ? value : [value];
  const labels = values.map((item) => {
    const other = decodeOtherResponse(item);
    if (other !== undefined) return other;
    return activity.options.find((option) => option.id === item)?.label || item;
  });
  if (labels.length > 1) {
    return `<ul class="answer-list">${labels.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
  }
  return `<p class="prose-answer">${escapeHtml(labels[0] || "")}</p>`;
}

function renderFields(
  activity: LiveActivity,
  values: Record<string, string | number>,
) {
  const fields = activity.worksheetFields || [];
  return `<table><tbody>${fields
    .map(
      (field) =>
        `<tr><th>${escapeHtml(field.label)}</th><td>${escapeHtml(displayValue(values[field.id]))}</td></tr>`,
    )
    .join("")}</tbody></table>`;
}

function responseState(value: LiveResponseRecord["value"]) {
  if (
    typeof value === "object" &&
    !Array.isArray(value) &&
    "finalized" in value
  ) {
    return value.finalized ? "Completed" : "Saved in progress";
  }
  return "Completed";
}

function activityLabel(activity: LiveActivity) {
  return activity.type.replaceAll("_", " ");
}

function displayValue(value: unknown) {
  if (value === undefined || value === null || value === "") return "—";
  return String(value);
}

function formatDate(date: Date) {
  if (Number.isNaN(date.getTime())) return "recently";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
