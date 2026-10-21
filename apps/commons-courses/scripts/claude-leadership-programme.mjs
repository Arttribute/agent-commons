export const slug = "claude-for-everyday-work-for-senior-leadership";
export const title = "Claude for Everyday Work for Senior Leadership";
const folder = {
  setup: "01_Setup",
  scenario: "02_Scenario",
  ask: "03_Block1_Ask_Well",
  desk: "04_Block2_Assistant",
  gallery: "05_Block3_Gallery_Projects_Artifacts",
  skills: "06_Block4_Skills_and_Whole_Tasks",
  brain: "07_Block5_Company_Brain",
  safety: "08_Block6_Safety",
  plan: "09_Block7_Plan",
};
const f = (id, label, type = "long_text", extra = {}) => ({
  id,
  label,
  type,
  required: true,
  ...extra,
});
const scale = (id, label, max = 5) =>
  f(id, label, "scale", {
    min: 0,
    max,
    lowLabel: "Not yet",
    highLabel: "Complete",
  });
const a = (id, type, title, minutes, props = {}) => ({
  id,
  type,
  title,
  estimatedMinutes: minutes,
  status: "draft",
  required: !["content", "break"].includes(type),
  points: 0,
  options: [],
  worksheetFields: [],
  scoreCriteria: [],
  randomizeOptions: false,
  showResults: false,
  ...props,
});
const content = (id, title, min, slide, props = {}) =>
  a(id, "content", title, min, { originalSlide: slide, ...props });
const worksheet = (id, title, min, key, prompt, fields, criteria, notes) =>
  a(id, "worksheet", title, min, {
    labEntryPath: folder[key],
    prompt,
    instructions:
      "Open the worksheet and input files in the lab folder. Complete the exercise in Claude, then save your own evidence below. Use the fictional Zawadi materials. The source worksheet contains the full steps and stretch options.",
    worksheetFields: fields,
    successCriteria: criteria,
    facilitatorNotes: notes,
  });
const quiz = (id, title, min, slide, labels, correct, notes) =>
  a(id, "quiz", title, min, {
    originalSlide: slide,
    prompt: title,
    options: labels.map((label, i) => ({
      id: "option-" + (i + 1),
      label,
      isCorrect: i === correct,
    })),
    facilitatorNotes: notes,
    randomizeOptions: false,
    points: 1,
  });
export const activities = [
  content("welcome", "Welcome, outcomes, and the day ahead", 8, 1, {
    prompt:
      "Thursday 22 October · 8:30 AM–5:30 PM EAT. Download the learner pack, keep the live room open, and save your workbook responses during the day.",
    labEntryPath: "START_HERE.md",
  }),
  a(
    "warm-up",
    "poll",
    "Which repeated task would you most love to hand off?",
    2,
    {
      prompt: "Choose your biggest recurring burden.",
      allowOther: true,
      options: [
        "Morning inbox",
        "Meeting minutes",
        "Reports and updates",
        "Finding organisational knowledge",
      ].map((label, i) => ({ id: "warm-" + i, label, isCorrect: false })),
    },
  ),
  content("scenario", "Meet Zawadi and your leadership role", 6, 8, {
    labEntryPath: folder.scenario,
    prompt:
      "You are Zawadi’s Director of Client Operations. Read the company brief and use the same fictional world all day.",
  }),
  content(
    "setup-demo",
    "Set up Claude, files, and your local workspace",
    9,
    10,
    {
      labEntryPath: folder.setup,
      facilitatorNotes:
        "Check paid-plan access, file creation, desktop approval controls and trusted folders, and Obsidian. Interface labels and model names in the supplied October deck should be checked against the available account. Keep all exercise dates as fictional source facts.",
    },
  ),
  a("readiness", "setup_check", "Ready to work?", 5, {
    prompt: "Confirm your setup or name the blocker so your educator can help.",
    labEntryPath: folder.setup,
    allowOther: true,
    options: [
      "Signed in; files work; desktop app and Obsidian ready",
      "Signed in but files or desktop access need help",
      "Obsidian or the learner pack needs help",
      "I need sign-in or account help",
    ].map((label, i) => ({ id: "ready-" + i, label, isCorrect: false })),
    facilitatorNotes:
      "Use the fallback transcript if recording fails. Pair with a working laptop while resolving account/setup blockers. Do not let setup consume the first lab.",
  }),
  content(
    "ask-teaching",
    "Ask well: context, specifics, format, example, and leadership judgement",
    35,
    17,
    {
      labEntryPath: folder.ask,
      prompt:
        "Practise a clear request, improve it with follow-ups, and add judgement and a done-when check.",
    },
  ),
  worksheet(
    "lab-1",
    "Lab 1 · Ask well",
    20,
    "ask",
    "Compare the bare ask with a specific request, add a role, improve it with exactly two follow-ups, and save your reusable template.",
    [
      f(
        "differences",
        "Two output differences and the prompt change that caused each",
      ),
      f("role", "The word or phrase introduced by the role"),
      f("final", "Your final four-sentence draft"),
      f("followups", "Your two follow-ups: tighten, then adjust tone"),
      f(
        "template",
        "Your saved reusable request template and where you saved it",
      ),
      f("judgement", "Your leadership judgement request and done-when check"),
    ],
    "Your draft includes the promised report date and unchanged renewal timeline; two differences are explained, and your template is saved outside the chat.",
    "Use Lab_1_Worksheet.md. Preserve the scenario dates exactly rather than replacing them with the workshop calendar date. Ask learners to explain causes, not simply show outputs.",
  ),
  quiz(
    "prompt-check",
    "Which request is most likely to produce a send-ready draft?",
    5,
    27,
    [
      "Warm professional email about the delay; keep it short",
      "Mention the finance holdup and sound friendly",
      "Four sentences explaining the delay and offering a call",
      "Four sentences to David: three-day delay, Friday date, offer a call, warm tone",
    ],
    3,
    "Debrief with original slide 28: the request needs the new date, which the model cannot invent.",
  ),
  a("morning-break", "break", "Morning break · 10:00–10:15", 15, {
    prompt:
      "Return at 10:15. Keep the learner pack and your saved template ready.",
  }),
  content(
    "desk-teaching",
    "Run the desk: inbox, voice, minutes, prep, and whole tasks",
    25,
    29,
    {
      labEntryPath: folder.desk,
      prompt:
        "Learn to triage, draft, capture meetings, prepare a brief, and review a plan before file writes.",
    },
  ),
  worksheet(
    "lab-2a",
    "Lab 2A · Clear the inbox",
    15,
    "desk",
    "Triage the ten emails, make the uncertain judgement explicit, draft two urgent replies, and prepare the Kilele brief.",
    [
      f(
        "triage",
        "Your three buckets, email numbers, and actual deadline dates",
      ),
      f(
        "uncertainty",
        "The least-sure email, two possible buckets, and your reasoning",
      ),
      f("replies", "Your two urgent reply drafts"),
      f("brief", "Kilele prep brief: the important risk and its source"),
    ],
    "All ten emails appear once; deadlines have dates; two replies are at most four sentences and add no unsupported fact; the prep brief identifies the risk.",
    "Use zawadi_monday_inbox.md and .csv, voice samples from Block 1, and kilele_renewal_prep_pack.md.",
  ),
  worksheet(
    "lab-2b",
    "Lab 2B · Record a meeting and score the minutes",
    20,
    "desk",
    "Record the role-play in pairs, export text, produce four-section minutes, score them, and fix the worst failure. Use the supplied fallback transcript if recording is blocked.",
    [
      f("capture", "Capture tool used, or why you used the fallback"),
      f("minutes", "Your four-section minutes or a private file reference"),
      scale(
        "score",
        "Your score against the source scoring card (out of 11)",
        11,
      ),
      f("fix", "Your lowest-scoring check and the follow-up that fixed it"),
    ],
    "Transcript obtained, minutes produced, the source 11-point card applied, score recorded, and one follow-up used. Target: at least 9/11.",
    "Open Recording_Lab/Recording_Lab_Instructions.md and Roleplay_Script.md. Give recording problems at most five minutes; the fallback has the same scoring card. Do not infer missing owners or dates.",
  ),
  worksheet(
    "lab-2c",
    "Lab 2C · Hand over the whole desk",
    10,
    "desk",
    "With the desktop approval control set to Manual, grant only the Block 2 folder. Ask for a plan, then approve triage, drafts, and one deduplicated owner-dated task list in outputs/.",
    [
      f("plan", "Plan you reviewed and the folder you granted"),
      f("outputs", "The three output files and where they were saved"),
      f("verification", "One owner and one date checked against the source"),
      f("monday", "The output you would want waiting on Monday morning"),
    ],
    "All three outputs exist; you approved each write and verified one owner and date.",
    "The Monday-output choice feeds the scheduled task in Block 4. Never ask learners to send real email.",
  ),
  a(
    "desk-pulse",
    "poll",
    "Which desk output would save you the most time?",
    5,
    {
      options: [
        "Inbox triage",
        "Meeting minutes",
        "Prep brief",
        "Whole desk",
      ].map((label, i) => ({ id: "desk-" + i, label, isCorrect: false })),
      facilitatorNotes:
        "Use the choice to connect the afternoon Skill to a useful repeated task.",
    },
  ),
  content("gallery-teaching", "Gallery, Projects, and artifacts", 30, 38, {
    labEntryPath: folder.gallery,
    prompt:
      "Explore writing, research, policy reading, spreadsheet files, a standing Project, and a shareable artifact.",
  }),
  worksheet(
    "lab-3",
    "Lab 3 · Pick two, including one leadership option",
    25,
    "gallery",
    "Choose two options A–F; include a Project (E) or artifact (F). Check one output by hand and keep a Skill candidate.",
    [
      f("choices", "Your two choices and why they fit your leadership work"),
      f("output-one", "First output, evidence, and the manual check"),
      f("output-two", "Second output, evidence, and the manual check"),
      f(
        "project-test",
        "If E: six-question honesty test, contradictions and missing facts; otherwise write not selected",
      ),
      f(
        "artifact-check",
        "If F: three changes, formula checked, checklist, and partner access; otherwise write not selected",
      ),
      f(
        "skill-candidate",
        "The repeated output you will turn into a Skill after lunch",
      ),
    ],
    "Two checked outputs; at least one is E or F. The Project acknowledges conflicts and absent facts, or the artifact formula and partner access are checked.",
    "Source Lab_3_Worksheet.md contains all six options and done-when criteria. Do not resolve the deliberate seat-count disagreement by choosing a number. Keep Project/artifact private unless learners intentionally share with their partner.",
  ),
  a(
    "gallery-share",
    "reflection",
    "Share the output and commit to a Skill candidate",
    5,
    {
      prompt:
        "Show your partner one output, name the instruction that improved it, and save the one repeated output you will build into a Skill.",
      successCriteria: "A specific Skill candidate is written before lunch.",
    },
  ),
  a("lunch", "break", "Lunch · 12:30–1:15", 45, {
    prompt: "Return at 1:15 with your Skill candidate chosen.",
  }),
  content(
    "skills-teaching",
    "Skills, whole tasks, approval controls, and scheduling",
    30,
    52,
    {
      labEntryPath: folder.skills,
      prompt:
        "Give a repeated task a trigger and instructions; distinguish a passing positive test from a passing negative test.",
    },
  ),
  worksheet(
    "lab-4",
    "Lab 4 · Build, test, and use your Skill",
    25,
    "skills",
    "Build or adapt your chosen Skill, test both trigger cases in new chats, apply it to a whole task, and run then pause a scheduled brief.",
    [
      f("candidate", "Chosen Skill and the repeated output from before lunch"),
      f("description", "Final trigger description, word for word"),
      f("attempts", "Attempts: whether it fired, and what you changed"),
      f("positive", "Positive-test evidence: activation and source checklist"),
      f(
        "negative",
        "Negative-test evidence: the car-park notice stayed a normal reply",
      ),
      f(
        "whole-task",
        "Saved Word minutes and evidence that the Skill shaped the file",
      ),
      f(
        "scheduled",
        "Monday brief: trigger, one on-demand run, output reviewed, and paused status",
      ),
    ],
    "Both tests pass; the Skill shapes a saved file; the scheduled task runs once and is paused.",
    "Use source Lab_4_Worksheet.md, Skill_Gallery/, test files, Instructions_for_Claude_Template.md and Scheduled_Task_Card.md. Learners may adapt a non-minutes Skill but must specify equivalent positive and negative tests; do not apply the minutes counts blindly.",
  ),
  quiz(
    "skill-check",
    "Which description gives a Skill a clear trigger?",
    5,
    63,
    [
      "Paste a transcript without any prompt",
      "Process files to generate structured minutes",
      "Use when I paste a raw transcript and want minutes with decisions and owner-dated actions",
      "Automatically produce structured summaries of team discussions",
    ],
    2,
    "Original slide 64: the description names trigger, input, and output.",
  ),
  a("afternoon-break", "break", "Break · 2:15–2:30", 15, {
    prompt: "Return with Obsidian and the starter vault ready.",
  }),
  content(
    "brain-teaching",
    "Second brain and company brain: ingest, query, and lint",
    25,
    65,
    {
      labEntryPath: folder.brain,
      prompt:
        "Keep raw sources, cited wiki knowledge, and navigation separate. Observe the plan before approving file changes.",
    },
  ),
  worksheet(
    "lab-5",
    "Lab 5 · Build the Zawadi company brain",
    30,
    "brain",
    "Open the vault in Obsidian, connect only that folder, ingest the standup with citations, query commitments, and lint before fixing one conflict.",
    [
      f("orphan", "Unlinked page you found in the graph"),
      f(
        "rules",
        "The three operations and the rules Claude reported before making changes",
      ),
      f(
        "ingest",
        "At least three updated wiki pages, source links, archived transcript, and log entry",
      ),
      f(
        "query",
        "Your answer to what is owed to David this week, with wiki links",
      ),
      f(
        "lint",
        "Lint findings: contradiction, orphan, uncited claims, and superseded decision",
      ),
      f("repair", "The one contradiction fixed, with the newest source cited"),
      f(
        "canvas",
        "First ten approved sources, owner, and leadership knowledge for your design canvas",
      ),
    ],
    "A source is ingested with citations; a query names its wiki links; lint reports issues; one approved fix cites the newest source and preserves raw material.",
    "The vault .md and .base files must stay native. The exercise intentionally contains contradictory sources and an orphan; preserve them on import so the learning task works. Use Manual mode and review the plan.",
  ),
  quiz(
    "brain-check",
    "Where should a durable company decision live?",
    5,
    74,
    [
      "A new Skill",
      "Only a Claude Project chat",
      "A cited page in the company brain",
      "A published artifact",
    ],
    2,
    "Original slide 75: durable organisational knowledge needs a reason and source.",
  ),
  a("late-break", "break", "Break · 3:30–3:45", 15, {
    prompt:
      "Return at 3:45. Keep the safety worksheet local; do not paste the unsafe request into a chat.",
  }),
  content(
    "safety-teaching",
    "Data, access, verification, and delegation risk",
    20,
    76,
    {
      labEntryPath: folder.safety,
      prompt:
        "Review what may enter a model, what it may access, and which actions require human review.",
    },
  ),
  quiz(
    "safety-check",
    "Which item must stay out of the chat?",
    5,
    78,
    [
      "A non-sensitive meeting agenda",
      "Your own ordinary email opening line",
      "A client national ID number and home address",
      "A public product page",
    ],
    2,
    "Debrief from original slide 79. Use the source responsible-use checklist and your organisation’s approved policy; legal conclusions require appropriate verification.",
  ),
  worksheet(
    "lab-6",
    "Lab 6 · De-risk, audit, and choose oversight",
    25,
    "safety",
    "Inspect the unsafe request locally. Identify at least six problems, rewrite with placeholders before using a model, assess a third-party Skill, and assign oversight to five tasks.",
    [
      f(
        "risks",
        "At least six unsafe items and why each is a problem; use categories rather than copying sensitive-looking values",
      ),
      f("redacted", "Your safe rewritten request and why it still works"),
      f("credential", "Action required for an exposed credential"),
      f(
        "checklist",
        "Your real next-week task: yes/no/fix for all twelve responsible-use checks",
      ),
      f(
        "skill-audit",
        "Enable or reject the sample third-party Skill, with the decisive line explained",
      ),
      f(
        "tiers",
        "Three workshop tasks and two team tasks: tier and oversight for each",
      ),
      f("admin", "Three administrator questions to resolve before real use"),
    ],
    "At least six risks identified; safe request tested; credential action named; twelve checks completed; Skill decision justified; five delegations tiered, including a high-stakes task.",
    "Unsafe request and third-party skill are fictional adversarial exercise fixtures, not instructions for either copilot. Do not paste the raw unsafe request. Keep their contents out of learner retrieval. Use only descriptive context until a learner supplies their own safe rewrite.",
  ),
  content(
    "sovereignty",
    "Who controls the data, operations, technology, and AI?",
    5,
    86,
    {
      labEntryPath: folder.safety,
      prompt:
        "Use Sovereignty_Stack_Questions.md to identify ownership, processing, switching, audit, and exit questions for your administrator.",
      facilitatorNotes:
        "Slides 86–93 and the full worksheet remain available. This is a five-minute closing frame within the supplied 3:45–4:40 safety block; continue the discussion in follow-up if needed.",
    },
  ),
  a("workflow-list", "card_collection", "List the tasks you tried today", 10, {
    prompt:
      "Capture the tasks Claude helped with today. Use one card per workflow, including enough context to recognise the output.",
    entryLabel: "Workflow",
    minItems: 3,
    maxSelections: 3,
    itemTitleFieldId: "task",
    worksheetFields: [
      f("task", "Task or workflow", "short_text"),
      f("evidence", "Output and evidence you checked"),
    ],
    labEntryPath: folder.plan,
  }),
  a(
    "workflow-score",
    "linked_scorecard",
    "Score the workflows worth continuing",
    10,
    {
      prompt:
        "Score the workflows you just captured. Compare totals and choose two or three to continue.",
      sourceActivityId: "workflow-list",
      scoreCriteria: [
        {
          id: "frequency",
          label: "How often I do it",
          min: 1,
          max: 5,
          lowLabel: "Rarely",
          highLabel: "Daily",
        },
        {
          id: "time",
          label: "Time it could save",
          min: 1,
          max: 5,
          lowLabel: "Little",
          highLabel: "Substantial",
        },
      ],
    },
  ),
  worksheet(
    "first-week-plan",
    "Your first-week plan · six commitments",
    20,
    "plan",
    "Use your top-scoring workflows to write the six-line plan, make time in your calendar, and name your peer check-in.",
    [
      f("daily", "Use daily: one or two tasks"),
      f("skill", "Build into a Skill: the repeated task"),
      f("share", "Share with my team: one useful output"),
      f("project", "Set up as a Project: the workstream"),
      f("brain", "Start the company brain: first ten approved sources"),
      f("visible", "Lead it visibly: where the team will see you use it"),
      f("calendar", "Your two fifteen-minute calendar blocks"),
      f("peer", "Your check-in partner and follow-up channel"),
    ],
    "Six specific commitments, two calendar blocks, a peer check-in, and a saved plan.",
    "Read the plan aloud to a partner. Use the same tasks from the linked scorecard; do not create a fresh wish list.",
  ),
  a("showcase", "reflection", "Showcase: one workflow and one Skill", 5, {
    originalSlide: 98,
    prompt:
      "Name one workflow you will start next week, one Skill you will build, and where your team will see the change.",
    successCriteria:
      "A concrete workflow, Skill, and visible leadership action.",
  }),
  a("exit", "worksheet", "Exit check and save your workbook", 5, {
    prompt:
      "Rate your confidence, name your first action, and download your saved workbook before leaving.",
    worksheetFields: [
      scale("confidence", "Confidence using these habits responsibly", 5),
      f("action", "Your first action, owner, and date"),
      f("blocker", "Remaining blocker or question; write none if ready"),
    ],
    successCriteria:
      "Your plan and evidence are saved, and the workbook download opens.",
  }),
];
export const blocks = [
  [
    "setup",
    "Welcome and setup",
    ["welcome", "warm-up", "scenario", "setup-demo", "readiness"],
    30,
  ],
  [
    "ask",
    "1 · Getting useful results from Claude",
    ["ask-teaching", "lab-1", "prompt-check"],
    60,
  ],
  [
    "desk",
    "2 · Claude as your personal assistant",
    [
      "morning-break",
      "desk-teaching",
      "lab-2a",
      "lab-2b",
      "lab-2c",
      "desk-pulse",
    ],
    90,
  ],
  [
    "gallery",
    "3 · Gallery, Projects, and artifacts",
    ["gallery-teaching", "lab-3", "gallery-share"],
    60,
  ],
  [
    "skills",
    "4 · Skills and whole tasks",
    ["lunch", "skills-teaching", "lab-4", "skill-check"],
    105,
  ],
  [
    "brain",
    "5 · Second brain and company brain",
    ["afternoon-break", "brain-teaching", "lab-5", "brain-check"],
    75,
  ],
  [
    "safety",
    "6 · Responsible use, delegation, and sovereignty",
    ["late-break", "safety-teaching", "safety-check", "lab-6", "sovereignty"],
    70,
  ],
  [
    "plan",
    "7 · First-week plan and showcase",
    ["workflow-list", "workflow-score", "first-week-plan", "showcase", "exit"],
    50,
  ],
];
export function programme(deckId, workspaceId, slideMap) {
  return activities.map((item) => {
    const { originalSlide, ...activity } = item;
    return {
      ...activity,
      ...(originalSlide
        ? { materialId: deckId, materialStartSlide: slideMap[originalSlide] }
        : {}),
      ...(item.labEntryPath ? { labWorkspaceId: workspaceId } : {}),
    };
  });
}
export const modulePaths = [
  "START_HERE.md",
  "03_Block1_Ask_Well/Lab_1_Worksheet.md",
  "04_Block2_Assistant/Lab_2_Worksheet.md",
  "05_Block3_Gallery_Projects_Artifacts/Lab_3_Worksheet.md",
  "06_Block4_Skills_and_Whole_Tasks/Lab_4_Worksheet.md",
  "07_Block5_Company_Brain/Lab_5_Worksheet.md",
  "08_Block6_Safety/Lab_6_Worksheet.md",
  "09_Block7_Plan/First_Week_Plan.md",
];
