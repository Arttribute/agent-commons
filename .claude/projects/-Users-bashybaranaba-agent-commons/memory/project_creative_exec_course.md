---
name: AI for Creative Executives — Course Format Decision
description: Delivery format for the creative executives course is undecided; founder has a bias toward live cohort
type: project
---

The "AI for Creative Executives" course is currently coded as `courseType: "self-paced"` in courses.ts as a placeholder — the format has not been decided yet.

**Why:** Decision is pending. No timeline set.

**Founder bias:** Toward a live cohort format.

**Why live makes sense:**
- Target audience (CCOs, CMOs, agency principals) learns better through peer exchange
- Closest competitor (IDEO U AI x Design Thinking Certificate) is live cohort at $2,250 — live format is a differentiator, not a commodity
- Assignments (live brief sprints, workflow builds, policy drafts) benefit from facilitated peer feedback
- Live cohort justifies a higher price point ($1,500–$2,500), more appropriate for executive seniority than the current $149

**How to apply:** When the format decision comes up, default recommendation should be live cohort. If switching, change `courseType` to `"live"` and add `nextSessionDate`, `sessionDates`, and `maxEnrollments` to the course data — and reprice accordingly.
