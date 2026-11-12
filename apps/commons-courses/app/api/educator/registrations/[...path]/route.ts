import { NextRequest, NextResponse } from "next/server";
import { educatorProjectCredentials } from "@/lib/educator-project-auth";
import { commonsApiUrl } from "@/lib/project-pages";

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  if (
    request.method !== "GET" &&
    request.headers.get("origin") !== request.nextUrl.origin
  )
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  const auth = await educatorProjectCredentials();
  if (auth.error) return auth.error;
  const { path } = await context.params;
  const uuid = "[0-9a-fA-F-]{36}";
  if (
    !new RegExp(
      `^${uuid}/events(?:/paystack|/${uuid}(?:/(?:registrations|discounts))?)?$`,
    ).test(path.join("/"))
  )
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  const response = await fetch(
    `${commonsApiUrl()}/v1/projects/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`,
    {
      method: request.method,
      headers: auth.headers,
      cache: "no-store",
      ...(request.method === "GET" ? {} : { body: await request.text() }),
    },
  );
  return new NextResponse(await response.text(), {
    status: response.status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
export { proxy as GET, proxy as POST, proxy as PATCH };
