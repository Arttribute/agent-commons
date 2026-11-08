import { NextRequest, NextResponse } from "next/server";
import { requireEducator } from "@/lib/educator-auth";
import { commonsApiUrl } from "@/lib/project-pages";

async function credentials() {
  const auth = await requireEducator();
  if (auth.error) return { error: auth.error };
  if (
    !auth.session.accessToken ||
    auth.session.accessTokenError ||
    !auth.session.identityUserId
  ) {
    return {
      error: NextResponse.json(
        {
          error:
            "Sign in with your Commons account again to manage project pages.",
        },
        { status: 401 },
      ),
    };
  }
  // Only the educator's own token is accepted. Never fall back to a service key.
  return {
    headers: {
      Authorization: `Bearer ${auth.session.accessToken}`,
      "Content-Type": "application/json",
    },
    ownerId: auth.session.identityUserId,
  };
}
export async function GET() {
  const principal = await credentials();
  if (principal.error) return principal.error;
  const paths = [
    "/v1/project-pages?surface=commonlab",
    "/v1/projects",
    `/v1/agents?owner=${encodeURIComponent(principal.ownerId!)}`,
  ];
  const responses = await Promise.all(
    paths.map((path) =>
      fetch(`${commonsApiUrl()}${path}`, {
        headers: principal.headers,
        cache: "no-store",
      }),
    ),
  );
  const failed = responses.find((response) => !response.ok);
  if (failed)
    return NextResponse.json(
      {
        error:
          "Could not load your Commons projects. Please sign in again or retry.",
      },
      { status: failed.status },
    );
  const data = await Promise.all(responses.map((response) => response.json()));
  return NextResponse.json({
    pages: data[0].data,
    projects: data[1].data,
    agents: data[2].data ?? data[2],
  });
}
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin)
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  const principal = await credentials();
  if (principal.error) return principal.error;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
  }
  let projectId = body.projectId;
  if (!projectId) {
    const created = await fetch(`${commonsApiUrl()}/v1/projects`, {
      method: "POST",
      headers: principal.headers,
      body: JSON.stringify({
        name: body.title,
        description: "Programme page managed from CommonLab",
        agentId: body.agentId,
      }),
    });
    const result = await created.json();
    if (!created.ok)
      return NextResponse.json(result, { status: created.status });
    projectId = result.data?.projectId;
  }
  if (typeof projectId !== "string" || !/^[0-9a-f-]{36}$/i.test(projectId))
    return NextResponse.json(
      { error: "Choose a valid Commons project." },
      { status: 400 },
    );
  const response = await fetch(
    `${commonsApiUrl()}/v1/projects/${encodeURIComponent(projectId)}/pages`,
    {
      method: "POST",
      headers: principal.headers,
      body: JSON.stringify({
        title: body.title,
        slug: body.slug,
        template: body.template,
        surface: "commonlab",
        agentId: body.agentId,
        chatEnabled: true,
      }),
    },
  );
  return NextResponse.json(await response.json(), { status: response.status });
}
