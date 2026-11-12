import { NextResponse } from "next/server";
import { educatorProjectCredentials } from "@/lib/educator-project-auth";
import { commonsApiUrl } from "@/lib/project-pages";

export async function GET() {
  const auth = await educatorProjectCredentials();
  if (auth.error) return auth.error;
  const response = await fetch(`${commonsApiUrl()}/v1/projects`, {
    headers: auth.headers,
    cache: "no-store",
  });
  if (!response.ok)
    return NextResponse.json(
      { error: "Could not load your programmes." },
      { status: response.status },
    );
  const { data: projects } = await response.json();
  const results = await Promise.all(
    (projects || []).map(
      async (project: { projectId: string; name: string }) => {
        const r = await fetch(
          `${commonsApiUrl()}/v1/projects/${encodeURIComponent(project.projectId)}/events`,
          { headers: auth.headers, cache: "no-store" },
        );
        if (!r.ok)
          throw new Error("Could not load registrations. Please retry.");
        const { data } = await r.json();
        return data
          .filter(
            (event: { config: { surface: string } }) =>
              event.config.surface === "commonlab",
          )
          .map((event: object) => ({
            ...event,
            projectId: project.projectId,
            projectName: project.name,
          }));
      },
    ),
  ).catch(() => null);
  if (!results)
    return NextResponse.json(
      { error: "Could not load registrations. Please retry." },
      { status: 502 },
    );
  return NextResponse.json(
    { data: { events: results.flat(), projects } },
    { headers: { "Cache-Control": "no-store" } },
  );
}
