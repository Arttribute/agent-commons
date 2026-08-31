# Live learning in Commons Courses

Live sessions are a delivery layer inside a course, not a separate course type. A self-paced or cohort course can use any combination of lessons, skill paths, assignments, immersive experiences, and live rooms.

## Product model

Each room has three durable records:

- `LiveSession`: the reusable run of show and the facilitator-controlled room state.
- `LiveParticipant`: authenticated presence and re-entry for one learner.
- `LiveResponse`: one resumable response per learner and activity.

The activity vocabulary is intentionally small and composable:

- workbook page
- setup check
- poll
- quiz
- reflection
- practice task
- break

Facilitator-paced rooms reveal one activity at a time. Learner-paced rooms open the run of show as a workbook. The same session plan therefore works for an in-person workshop, a hybrid cohort, a guided lab, or an asynchronous follow-up.

## Access and entry

Educators can admit enrolled learners, invited email addresses, or anyone with the room link. Every room has a temporary six-digit code, a direct URL, and a QR code. Authentication preserves the intended `/live/<session>` callback, so a first-time learner returns to the room immediately after account creation.

Answer correctness is evaluated on the server. Correct options and aggregate results are not sent to learners until the activity is closed and result reveal is enabled. Randomized options use the learner ID as part of their stable order.

## Facilitation principles

The default workshop rhythm comes directly from the workshop review used to design this feature:

1. Resolve setup blockers before teaching starts.
2. Capture a short opening diagnostic.
3. Keep teaching segments concise and give learners a shared follow-along page.
4. Attach observable success criteria to practice.
5. Use retrieval and progressive reveal before showing an answer.
6. Make breaks and transitions visible in the run of show.
7. Collect exit evidence and a concrete next step.

The educator copilot can read live-room participation, use the current page as facilitation context, and create an approval-gated live plan from uploaded source material. The learner copilot receives only the currently visible activity and is instructed not to move ahead of the facilitator.

## Patterns borrowed, not cloned

- [Kahoot live hosting](https://support.kahoot.com/hc/en-us/articles/360039422694-How-to-host-a-live-kahoot) validates a lobby with a PIN, direct link, QR entry, late join, and post-session reports.
- [Kahoot assignments](https://support.kahoot.com/hc/en-us/articles/360039411334-How-to-assign-a-kahoot-in-web-platform) distinguishes host-paced delivery from learner-paced work and keeps the same link/code/QR entry model.
- [Pear Deck session entry](https://help.peardeck.com/migration/en/how-students-join-a-pear-deck-session) demonstrates why the educator must choose between identified login and lower-friction anonymous entry. Commons keeps identity because learner work, access, and copilot personalization need a durable owner, while making account creation return directly to the room.
- [Pear Deck presenting](https://help.peardeck.com/migration/en/how-to-present-a-pear-deck) supports the private-dashboard/shared-projector split used in the facilitator console.
- [Mentimeter QR sharing](https://help.mentimeter.com/en/articles/422271-share-the-qr-code) supports showing join instructions again at any point in a presentation.
- [Wooclap self-paced sessions](https://docs.wooclap.com/en/articles/674825-self-paced-session) supports using an opening diagnostic and letting learners practise independently before a shared correction or debrief.

The Commons distinction is that these patterns sit inside the existing course, identity, enrollment, evidence, and copilot system. Educators should not need a separate quiz product, workbook product, and classroom-management product to facilitate one coherent learning experience.
