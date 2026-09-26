# UI guidelines

How interfaces across Agent Commons projects should look and behave: the commons app, CommonLab, the arcade, the desktop app and anything new. The goal is one product family, not five house styles.

The short version: one job per view, one primary action, and nothing on screen that the person does not need for the job in front of them.

---

## Principles

**One task per view.** A view exists to help someone do one thing. If a page answers three questions, split it into three views and let people move between them.

**Show the next level on demand.** A list shows what each item is. Opening an item shows the detail. Never render every item expanded.

**Put forms behind an action.** Creating something opens a drawer or its own page from a button. A form that sits on a list page competes with the list.

**Explain in place, not in paragraphs.** If a control needs explaining, attach an info tip to its label. Long instructional copy on a working screen becomes noise after the first visit.

**Scroll sections, not pages.** A workspace should fit the viewport. If something is longer than its space, that one pane scrolls. Chrome such as headers, tabs, navigators and action bars stays put.

**The primary thing keeps its place.** Slides, an image, a video or a canvas hold their own pane. Text and forms scroll beside them. Media should not scroll away while someone reads about it.

**Progressive disclosure over density.** Prefer tabs, disclosures and popovers to stacking. Prefer a second view to a longer first one.

**Say what happened.** Every action reports success, failure or progress. Nothing silently no-ops.

---

## Layout patterns

Pick the pattern that fits the job. Do not invent a fourth.

**App shell.** One sidebar for navigation, a content area that scrolls, the account menu pinned to the bottom. Group sidebar items so the list never scrolls. Collapse it to an icon rail on narrow screens and in focus modes.

**List then detail.** A list of rows, each a summary. Clicking a row opens its own view with a back link. Put the item id in the URL so the view is linkable.

**Section with tabs.** One section, several sibling views. Tabs live in the URL (`?tab=`) so people can link to and reload a view.

**Master and detail side by side.** A navigator pane plus one editor, for ordered content like modules, activities or challenges. The navigator scrolls on its own.

**Study layout.** A stage (media, slides, lab) beside a reading or answer column, with a fixed action bar. Use `split` when the answer is short, and `tabs` when the task is itself a workspace. On small screens both become tabs so only one surface shows at a time. See `components/learning/study-shell.tsx` in CommonLab.

---

## Scrolling

- The page root owns the height (`h-dvh`), hides its own overflow, and hands scrolling to panes.
- Exactly one pane scrolls at a time in a given region. Add `overscroll-contain` so scroll does not chain to the page.
- Headers, tab bars, navigators and action bars are `shrink-0`.
- Use `min-h-0` on every flex parent of a scrolling child, or the child will not scroll.
- Marketing and reading pages may scroll as a page. Working surfaces should not.

---

## Type

- Space Grotesk everywhere. One family.
- Weight carries hierarchy, not size alone. `font-medium` for titles and emphasis, normal for body. Avoid `font-bold` and heavier in product UI.
- Page title `text-lg`, section title `text-sm font-medium`, body `text-sm`, meta `text-xs`.
- Sentence case for every label, button and heading.
- No uppercase micro labels and no wide letter spacing. They read as decoration.
- Long-form learning and marketing copy may go up to `text-base` with generous line height.

---

## Color

Warm neutrals carry the interface. Color means something.

- Surfaces: page canvas `bg-page`, cards and panes white, muted fills `bg-muted`, selected rows `bg-accent`.
- Text: `text-foreground` for primary, `text-muted-foreground` for secondary. Borders `border-border`.
- Primary action: `bg-stone-900` with white text. One per view.
- Brand highlight: the teal highlight block behind a page title. One per page.
- Status only: emerald for success or live progress, amber for waiting or draft, red for errors and destructive actions, sky or blue for informational counts.
- Do not color rows, cards or icons for decoration. A colored thing should mean something different from the thing next to it.
- Course and game themes may override surface variables. Respect the theme variables rather than hardcoding brand colors inside themed screens.

---

## Space, shape, elevation

- Radius: `rounded-lg` for controls, `rounded-xl` for cards and panes, `rounded-full` for pills and avatars.
- Shadows: `shadow-card` for resting surfaces, `shadow-floating` for popovers, drawers and anything above the page. Nothing heavier.
- Controls are `h-9` (`h-8` for small). Keep tap targets at least 36px.
- Space in multiples of 4. Card padding 16 to 20. Gaps between cards 16.
- Borders over shadows for separation inside a pane.

---

## Components

Use the shared kit. Do not hand-roll a second version of these.

| Need | Use |
|---|---|
| Buttons, icon buttons | `ui/button` |
| Page and section headers | `ui/surface` (`PageHeader`, `SectionTitle`) |
| Cards, lists, rows, badges, stats, empty states | `ui/surface` |
| Tabs, query tabs, segmented controls | `ui/tabs` |
| Labels, inputs, selects, switches | `ui/field` |
| Popovers and menus | `ui/popover` |
| Tooltips and info tips | `ui/tooltip` |
| Side sheets for forms and detail | `ui/drawer` |
| Collapsible groups | `ui/disclosure` |
| Save state for editors | `ui/save-bar` |

Keep presentational components free of `"use client"` when they take no state, so server pages can pass them icons and data directly.

---

## Icons

- Lucide only, `strokeWidth={1.75}`, `h-4 w-4` inline and `h-5 w-5` for feature marks.
- One icon per concept across the product. Skills are `Zap`, scheduled tasks are `ClipboardClock`, sparkles are reserved for credits and copilot surfaces.
- Icons support labels. An icon-only control needs a tooltip and an `aria-label`.

---

## Writing in the interface

- Plain, short, matter of fact. No marketing voice inside the product.
- Buttons name the action: "Create course", "Save plan", "Send check-in".
- Titles name the thing, not the activity around it: "Assignments", not "Manage your assignments".
- Avoid dashes as asides. Use a period or a colon.
- Say what a number means. "3 to review" beats a bare badge.
- Empty states say what the thing is and offer the action that creates the first one.

---

## States

- **Loading:** skeletons shaped like the content for first loads, a small spinner for actions in flight. Never shift layout when data arrives.
- **Empty:** icon, one line naming the thing, one line of context, the create action.
- **Error:** plain sentence and a retry where retrying helps. Keep the person's input.
- **Saving:** editors show unsaved state and keep the save control in reach. Do not autosave silently where the person expects to confirm.
- **Live:** anything running shows a quiet pulsing dot, not an animated banner.

---

## Responsive

- Design the working screen at 1440 wide, then check 1024, 768 and 390.
- Below `lg`, side-by-side panes become tabs, navigators become a drawer or sheet, and the sidebar collapses behind a menu button.
- Keep a 16px side gutter on phones. No horizontal page scroll.
- Hide secondary meta before hiding a control. Never hide the primary action.

---

## Accessibility

- Every control is reachable and operable by keyboard, and Escape closes overlays.
- Icon-only controls carry `aria-label`. Tabs carry `aria-current`. Switches carry `role="switch"` and `aria-checked`.
- Keep visible focus. Do not remove outlines without replacing them.
- Do not use color alone to carry meaning. Pair it with a label, icon or shape.
- Respect `prefers-reduced-motion`. Animation stays under 200ms and never blocks reading.

---

## Before you ship a view

1. What is the one job of this view? Can a newcomer tell within a few seconds?
2. Is there exactly one primary action?
3. Does anything scroll that should not? Does the media stay put?
4. Could any block become a tab, a drawer, a detail view or an info tip?
5. Does it hold at 390 wide?
6. Empty, loading, error and saving states all handled?
7. Does it look like it belongs beside the commons app studio?
