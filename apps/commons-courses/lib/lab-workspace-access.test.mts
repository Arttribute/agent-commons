import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { serializeLabWorkspace } from "./lab-workspace-data.ts";

const workspace = {
  _id: "workspace",
  courseId: "course",
  courseSlug: "workshop",
  title: "Workshop",
  visibility: "course",
  sourceFileName: "materials.zip",
  learnerPackSize: 200,
  sourcePackSize: 300,
  learnerPackGridFsId: "safe-pack",
  sourcePackGridFsId: "private-pack",
  createdAt: new Date(),
  updatedAt: new Date(),
  files: [
    {
      id: "worksheet",
      path: "Exercises/worksheet.md",
      name: "worksheet.md",
      audience: "learner",
      gridFsId: "safe-file",
      mimeType: "text/markdown",
      size: 100,
    },
    {
      id: "guide",
      path: "Facilitator/guide.md",
      name: "guide.md",
      audience: "facilitator",
      gridFsId: "private-file",
      mimeType: "text/markdown",
      size: 100,
      preview: "Private answers",
    },
  ],
};

function route(file: string, manages: boolean, denied = false) {
  const compiled = ts.transpileModule(
    readFileSync(new URL(file, import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  const streamed: { id: string; options: Record<string, unknown> }[] = [];
  const mocks: Record<string, unknown> = {
    "next/server": { NextResponse: Response },
    "@/lib/lab-workspace-access": {
      authorizeLabWorkspace: async () =>
        denied
          ? { error: Response.json({ error: "Unauthorized" }, { status: 401 }) }
          : { error: null, workspace, manages },
    },
    "@/lib/lab-workspace-data": { serializeLabWorkspace },
    "@/lib/lab-workspace-storage": {
      streamResponse: async (id: string, options: Record<string, unknown>) => {
        streamed.push({ id, options });
        return new Response("file bytes");
      },
    },
  };
  const module = { exports: {} as Record<string, any> };
  runInNewContext("(function(require,module,exports){" + compiled + "\n})")(
    (id: string) => {
      assert.ok(id in mocks, `Unexpected route dependency: ${id}`);
      return mocks[id];
    },
    module,
    module.exports,
  );
  return { GET: module.exports.GET, streamed };
}

for (const manages of [false, true]) {
  test(`learner workspace excludes facilitator data when manages=${manages}`, async () => {
    const { GET } = route("../app/api/lab-workspaces/[id]/route.ts", manages);
    const response = await GET(
      {},
      { params: Promise.resolve({ id: "workspace" }) },
    );
    const body = await response.json();
    assert.deepEqual(
      body.workspace.files.map((file: any) => file.id),
      ["worksheet"],
    );
    assert.equal(body.workspace.learnerFileCount, 1);
    assert.equal(body.workspace.facilitatorFileCount, 0);
    assert.equal(body.workspace.facilitatorPackDownloadUrl, undefined);
    assert.doesNotMatch(
      JSON.stringify(body),
      /Private answers|Facilitator\/|private-pack/,
    );
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  });
}

test("educator library serialization retains facilitator materials", () => {
  const result = serializeLabWorkspace(workspace as any, { educator: true });
  assert.equal(result.files.length, 2);
  assert.equal(result.facilitatorFileCount, 1);
  assert.match(result.facilitatorPackDownloadUrl!, /audience=facilitator$/);
});

test("learner workspace requires authorization", async () => {
  const { GET } = route("../app/api/lab-workspaces/[id]/route.ts", false, true);
  assert.equal(
    (await GET({}, { params: Promise.resolve({ id: "workspace" }) })).status,
    401,
  );
});

for (const download of [false, true]) {
  test(`learner cannot read a facilitator file with download=${download}`, async () => {
    const { GET, streamed } = route(
      "../app/api/lab-workspaces/[id]/files/[fileId]/route.ts",
      false,
    );
    const response = await GET(
      {
        nextUrl: new URL(
          `https://example.com/file?download=${download ? 1 : 0}`,
        ),
      },
      { params: Promise.resolve({ id: "workspace", fileId: "guide" }) },
    );
    assert.equal(response.status, 404);
    assert.equal(streamed.length, 0);
  });
}

test("learner can read a learner worksheet", async () => {
  const { GET, streamed } = route(
    "../app/api/lab-workspaces/[id]/files/[fileId]/route.ts",
    false,
  );
  const response = await GET(
    { nextUrl: new URL("https://example.com/file") },
    { params: Promise.resolve({ id: "workspace", fileId: "worksheet" }) },
  );
  assert.equal(response.status, 200);
  assert.equal(streamed[0].id, "safe-file");
});

test("learner cannot request the facilitator archive", async () => {
  const { GET, streamed } = route(
    "../app/api/lab-workspaces/[id]/download/route.ts",
    false,
  );
  const response = await GET(
    { nextUrl: new URL("https://example.com/download?audience=facilitator") },
    { params: Promise.resolve({ id: "workspace" }) },
  );
  assert.equal(response.status, 403);
  assert.equal(streamed.length, 0);
});

for (const manages of [false, true]) {
  test(`default pack download always uses the learner archive when manages=${manages}`, async () => {
    const { GET, streamed } = route(
      "../app/api/lab-workspaces/[id]/download/route.ts",
      manages,
    );
    const response = await GET(
      { nextUrl: new URL("https://example.com/download") },
      { params: Promise.resolve({ id: "workspace" }) },
    );
    assert.equal(response.status, 200);
    assert.equal(streamed[0].id, "safe-pack");
  });
}

test("facilitator archive remains available to an authorized educator", async () => {
  const { GET, streamed } = route(
    "../app/api/lab-workspaces/[id]/download/route.ts",
    true,
  );
  const response = await GET(
    { nextUrl: new URL("https://example.com/download?audience=facilitator") },
    { params: Promise.resolve({ id: "workspace" }) },
  );
  assert.equal(response.status, 200);
  assert.equal(streamed[0].id, "private-pack");
});
