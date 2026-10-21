import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url);
function load(file: string, mocks: Record<string, unknown>) {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} as Record<string, any> };
  runInNewContext("(function(require,module,exports){" + compiled + "\n})", {
    console,
    Buffer,
    process: { env: {} },
  })(
    (id: string) =>
      id in mocks ? mocks[id] : id.startsWith("@/") ? {} : require(id),
    module,
    module.exports,
  );
  return module.exports;
}

test("course copilot agents are isolated by user, course, role and linked principal", async () => {
  const saved = new Map<string, any>();
  let created = 0;
  const Runtime = {
    findById: async (key: string) => saved.get(key),
    findOneAndUpdate: async ({ _id }: any, update: any) => {
      if (!saved.has(_id))
        saved.set(_id, { ...update.$setOnInsert, save: async () => {} });
      return saved.get(_id);
    },
  };
  const client = {
    agents: {
      create: async (config: any) => {
        assert.equal(config.commonTools.length, 0);
        return { data: { agentId: "agent-" + ++created } };
      },
      update: async () => {},
    },
  };
  const { courseCopilotConnection } = load("./course-copilot-connection.ts", {
    mongoose: { models: { CourseCopilotRuntime: Runtime }, Schema: class {} },
    "@/lib/agent-commons": { getAgentCommonsClient: () => client },
    "@/lib/platform-service-token": {
      platformServiceToken: async (_platform: string, scope: string) => {
        assert.ok(scope.split(" ").includes("agents:create"));
        return "service-token";
      },
    },
  });
  const input = {
    courseId: "course-a",
    course: { title: "Course" },
    agent: { id: "guide", name: "Guide", instructions: "Help" },
    role: "learner",
    actor: { userId: "one", principalId: "identity-one" },
  };
  const first = await courseCopilotConnection(input);
  assert.equal((await courseCopilotConnection(input)).agentId, first.agentId);
  for (const variant of [
    { ...input, actor: { userId: "two", principalId: "identity-one" } },
    { ...input, courseId: "course-b" },
    { ...input, role: "educator" },
    { ...input, actor: { userId: "one", principalId: "relinked-identity" } },
  ])
    assert.notEqual(
      (await courseCopilotConnection(variant)).agentId,
      first.agentId,
    );
  await assert.rejects(
    courseCopilotConnection({ ...input, actor: { userId: "unlinked" } }),
    /Sign in with Commons/,
  );
  assert.equal(created, 5);
});

test("educator resource reads enforce managed course and resource ownership and support full pagination", async () => {
  const body = "Source document\n".repeat(2000);
  const ctx = { user: { id: "educator", role: "educator" } };
  const mocks = {
    "@/lib/educator-auth": {
      buildManagedCoursesFilter: () => ({ "educator.userId": "educator" }),
    },
    "@/models/Course": {
      findOne: async (filter: any) => {
        assert.equal(filter["educator.userId"], "educator");
        return filter.slug === "managed" ? { _id: "owned-course" } : null;
      },
    },
    "@/models/CourseMaterial": {
      findOne: (filter: any) => ({
        lean: async () => {
          assert.equal(filter.courseId, "owned-course");
          return filter._id === "aaaaaaaaaaaaaaaaaaaaaaaa"
            ? { name: "Deck", textPreview: body }
            : null;
        },
      }),
    },
    "@/models/LabWorkspace": {
      findOne: (filter: any) => ({
        lean: async () => {
          assert.equal(filter.courseId, "owned-course");
          return filter._id === "bbbbbbbbbbbbbbbbbbbbbbbb"
            ? {
                files: [
                  { path: "Facilitator/guide.md", preview: "Private notes" },
                ],
              }
            : null;
        },
      }),
    },
  };
  const { executeEducatorCopilotTool } = load(
    "./educator-copilot-tools.ts",
    mocks,
  );
  const read = async (args: any) =>
    JSON.parse(
      await executeEducatorCopilotTool(ctx, "read_course_resource", args),
    );
  assert.ok(
    (
      await read({
        courseSlug: "someone-else",
        materialId: "aaaaaaaaaaaaaaaaaaaaaaaa",
      })
    ).error,
  );
  assert.ok(
    (
      await read({
        courseSlug: "managed",
        materialId: "cccccccccccccccccccccccc",
      })
    ).error,
  );
  const one = await read({
    courseSlug: "managed",
    materialId: "aaaaaaaaaaaaaaaaaaaaaaaa",
  });
  const two = await read({
    courseSlug: "managed",
    materialId: "aaaaaaaaaaaaaaaaaaaaaaaa",
    offset: one.nextOffset,
  });
  assert.equal(one.content + two.content, body);
  assert.equal(two.nextOffset, null);
  assert.equal(
    (
      await read({
        courseSlug: "managed",
        workspaceId: "bbbbbbbbbbbbbbbbbbbbbbbb",
        filePath: "Facilitator/guide.md",
      })
    ).content,
    "Private notes",
  );
  assert.ok(
    (
      await read({
        courseSlug: "managed",
        workspaceId: "bbbbbbbbbbbbbbbbbbbbbbbb",
        filePath: "missing",
      })
    ).error,
  );
});
