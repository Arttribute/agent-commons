import { NextRequest, NextResponse } from "next/server";
import { identityPlatformFetch } from "@/lib/identity-platform";

async function payload(response: Response) {
  return response.status === 204
    ? null
    : response.json().catch(() => ({ error: "Invalid identity response" }));
}

// Project-scoped developer keys. Legacy principal key query parameters are
// intentionally ignored; ownership comes from the signed-in Commons identity.
export async function GET(request: NextRequest) {
  const requestedProjectId = new URL(request.url).searchParams.get("projectId");
  const [projectsResponse, scopesResponse] = await Promise.all([
    identityPlatformFetch("/projects"),
    identityPlatformFetch("/scopes"),
  ]);
  if (!projectsResponse.ok) {
    return NextResponse.json(await payload(projectsResponse), {
      status: projectsResponse.status,
    });
  }

  const projectsPayload = (await payload(projectsResponse)) as {
    data?: Array<{ id: string }>;
  };
  const projects = projectsPayload?.data ?? [];
  const selected = requestedProjectId
    ? projects.filter((project) => project.id === requestedProjectId)
    : projects;
  if (requestedProjectId && selected.length === 0) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const keyResponses = await Promise.all(
    selected.map(async (project) => {
      const response = await identityPlatformFetch(
        `/projects/${encodeURIComponent(project.id)}/api-keys`,
      );
      return {
        projectId: project.id,
        response,
        body: await payload(response),
      };
    }),
  );
  const failed = keyResponses.find(({ response }) => !response.ok);
  if (failed) {
    return NextResponse.json(failed.body, { status: failed.response.status });
  }

  const keys = keyResponses.flatMap(({ body }) =>
    Array.isArray((body as { data?: unknown[] })?.data)
      ? (body as { data: unknown[] }).data
      : [],
  );
  const scopes = scopesResponse.ok
    ? ((await payload(scopesResponse)) as { data?: string[] })?.data ?? []
    : [];
  return NextResponse.json({ data: keys, projects, scopes });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    projectId?: string;
    name?: string;
    scopes?: string[];
    expiresAt?: string | null;
  };
  if (!body.projectId || !body.name?.trim()) {
    return NextResponse.json(
      { error: "projectId and name are required" },
      { status: 400 },
    );
  }
  const response = await identityPlatformFetch(
    `/projects/${encodeURIComponent(body.projectId)}/api-keys`,
    {
      method: "POST",
      body: JSON.stringify({
        name: body.name.trim(),
        scopes: body.scopes,
        expiresAt: body.expiresAt,
      }),
    },
  );
  return NextResponse.json(await payload(response), { status: response.status });
}
