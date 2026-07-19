import { proxyBackend } from "@/lib/backend-proxy";

export async function GET() {
  return proxyBackend("/v1/copilot");
}
