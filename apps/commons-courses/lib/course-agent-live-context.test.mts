import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as contextPolicy from "./live-copilot-context.ts";
import { presentationSlides } from "./presentation-content.ts";
import type { LiveActivity } from "../types/live-session.ts";

const courseId = "aaaaaaaaaaaaaaaaaaaaaaaa",
  materialId = "bbbbbbbbbbbbbbbbbbbbbbbb",
  workspaceId = "cccccccccccccccccccccccc";
const activity = {
  id: "setup",
  title: "Current worksheet",
  type: "worksheet",
  status: "open",
  prompt: "Keep the fictional dates",
  facilitatorNotes: "PRIVATE NOTES",
  options: [{ id: "one", label: "Public choice", isCorrect: true }],
  materialId,
  materialStartSlide: 1,
  labWorkspaceId: workspaceId,
  labEntryPath: "Setup",
} as LiveActivity;
const session = {
  _id: "session",
  courseId,
  title: "Workshop",
  status: "live",
  pace: "facilitator",
  currentActivityId: activity.id,
  activities: [activity],
  parts: [],
};
const policy = {
  enabled: true,
  explainCurrentActivity: true,
  coachResponses: true,
  useCourseMaterials: true,
  giveDirectExplanations: false,
};
const view = {
  page: "live_session",
  activityId: activity.id,
  slide: { materialId, number: 2 },
  workbookDraft: "My unsaved attempt",
  lab: { workspaceId, fileId: "worksheet", draft: "My unsaved file edit" },
};

function harness() {
  const reads: string[] = [];
  const query = (value: unknown) => ({
    select: () => ({ lean: async () => value }),
    lean: async () => value,
  });
  const mocks: Record<string, unknown> = {
    mongoose: {
      Types: {
        ObjectId: { isValid: (value: string) => /^[a-f0-9]{24}$/.test(value) },
      },
    },
    "@/models/LiveResponse": {
      find: (filter: Record<string, unknown>) => {
        assert.equal(filter.userId, "only-this-learner");
        assert.equal(filter.courseId, courseId);
        assert.equal(filter.sessionId, "session");
        return query([
          {
            activityId: "setup",
            value: "My saved attempt",
            submittedAt: "today",
          },
        ]);
      },
    },
    "@/models/LiveParticipant": { exists: async () => true },
    "@/models/CourseMaterial": {
      findOne: (filter: any) => {
        reads.push("material");
        assert.equal(filter.courseId, courseId);
        assert.equal(filter._id, materialId);
        assert.deepEqual(Array.from(filter.visibility.$in), ["course", "live"]);
        return query({
          name: "Learner deck",
          slideGridFsIds: [1, 2, 3],
          textPreview:
            "--- Original slide 1 ---\nOpening slide\n\n--- Original slide 3 ---\nExact currently viewed slide\n\n--- Original slide 4 ---\nNext slide",
        });
      },
    },
    "@/models/LabWorkspace": {
      findOne: (filter: any) => {
        reads.push("workspace");
        assert.equal(filter.courseId, courseId);
        assert.equal(filter._id, workspaceId);
        return query({
          _id: workspaceId,
          title: "Materials",
          files: [
            {
              id: "worksheet",
              path: "Setup/Worksheet.md",
              audience: "learner",
              preview:
                "Check source dates and do not resolve deliberate contradictions.",
            },
            {
              id: "guide",
              path: "Facilitator/Guide.md",
              audience: "facilitator",
              preview: "PRIVATE ANSWERS",
            },
            {
              id: "unsafe",
              path: "Setup/unsafe_request.txt",
              audience: "learner",
              preview: "RAW ADVERSARIAL SECRET",
            },
          ],
        });
      },
    },
    "./live-copilot-context.ts": contextPolicy,
    "./presentation-content.ts": { presentationSlides },
  };
  const compiled = ts.transpileModule(
    readFileSync(
      new URL("./course-agent-live-context.ts", import.meta.url),
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    },
  ).outputText;
  const module = { exports: {} as Record<string, any> };
  runInNewContext("(function(require,module,exports){" + compiled + "\n})")(
    (id: string) => {
      assert.ok(id in mocks, id);
      return mocks[id];
    },
    module,
    module.exports,
  );
  return {
    reads,
    build: (overrides: Record<string, unknown> = {}) =>
      module.exports.buildLiveLearnerContext({
        session,
        userId: "only-this-learner",
        courseId,
        view,
        policy,
        ...overrides,
      }),
  };
}

test("live copilot receives the exact learner slide and own saved and unsaved work", async () => {
  const { build } = harness();
  const context = await build();
  assert.equal(context.slide.number, 2);
  assert.equal(context.slide.sourceNumber, 3);
  assert.equal(context.slide.text, "Exact currently viewed slide");
  assert.equal(context.slide.positionSource, "learner_viewer");
  assert.equal(context.ownSavedResponse, "My saved attempt");
  assert.equal(context.ownUnsavedWorkbookDraft, "My unsaved attempt");
  assert.equal(context.lab.openFile.path, "Setup/Worksheet.md");
  assert.equal(context.lab.ownUnsavedFileDraft, "My unsaved file edit");
  assert.doesNotMatch(
    JSON.stringify(context),
    /PRIVATE|Facilitator|isCorrect|facilitatorNotes|RAW ADVERSARIAL SECRET/,
  );
});
test("forged deck references cannot replace the activity's authorized deck", async () => {
  const { build } = harness();
  const context = await build({
    view: {
      ...view,
      slide: {
        materialId: "private-other-course",
        number: 2,
        text: "FORGED SLIDE",
      },
    },
  });
  assert.equal(context.slide.number, 1);
  assert.equal(context.slide.positionSource, "activity_start_only");
  assert.doesNotMatch(
    JSON.stringify(context),
    /FORGED SLIDE|private-other-course/,
  );
});
test("a forged facilitator file selection never supplies private content or an unsaved draft", async () => {
  const { build } = harness();
  const context = await build({
    view: {
      ...view,
      lab: { workspaceId, fileId: "guide", draft: "FORGED DRAFT" },
    },
  });
  assert.equal(context.lab.openFile, undefined);
  assert.equal(context.lab.ownUnsavedFileDraft, undefined);
  assert.doesNotMatch(
    JSON.stringify(context),
    /PRIVATE|Facilitator|FORGED DRAFT/,
  );
});

test("saved responses and unchanged source files are not mislabeled as unsaved work", async () => {
  const { build } = harness();
  const context = await build({
    view: {
      ...view,
      workbookDraft: "My saved attempt",
      lab: {
        workspaceId,
        fileId: "worksheet",
        draft:
          "Check source dates and do not resolve deliberate contradictions.",
      },
    },
  });
  assert.equal(context.ownSavedResponse, "My saved attempt");
  assert.equal(context.ownUnsavedWorkbookDraft, undefined);
  assert.equal(context.lab.ownUnsavedFileDraft, undefined);
});
test("educator material restrictions prevent additional file and slide reads", async () => {
  const { build, reads } = harness();
  const context = await build({
    policy: { ...policy, useCourseMaterials: false, coachResponses: false },
  });
  assert.deepEqual(reads, []);
  assert.equal(context.slide, undefined);
  assert.equal(context.lab, undefined);
  assert.equal(context.ownSavedResponse, undefined);
  assert.equal(context.ownUnsavedWorkbookDraft, undefined);
});
test("disabled activity explanations omit activity, drafts and sources", async () => {
  const { build, reads } = harness();
  const context = await build({
    policy: { ...policy, explainCurrentActivity: false },
  });
  assert.deepEqual(reads, []);
  assert.equal(context.activity, undefined);
  assert.equal(context.ownSavedResponse, undefined);
  assert.equal(context.slide, undefined);
});
