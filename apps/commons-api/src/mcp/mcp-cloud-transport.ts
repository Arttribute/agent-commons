import { BadRequestException } from '@nestjs/common';

/** User-configured programs belong in account-owned runtimes, never the API. */
export function requireCloudMcpTransport(type: string) {
  if (!['sse', 'http', 'streamable-http'].includes(type)) {
    throw new BadRequestException(
      'Cloud MCP connections need a remote HTTP or SSE endpoint. Run command-based servers on your own computer or an account-owned agent computer, and connect their HTTP endpoint.',
    );
  }
}
