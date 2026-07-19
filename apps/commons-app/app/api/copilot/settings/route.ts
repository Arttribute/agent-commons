import { NextRequest } from "next/server";
import { proxyBackend } from "@/lib/backend-proxy";

export async function PUT(request: NextRequest) {
  return proxyBackend("/v1/copilot/settings", {
    method: "PUT",
    body: await request.json(),
  });
}
