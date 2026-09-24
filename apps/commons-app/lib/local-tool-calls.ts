import type { LocalMessage } from "@agent-commons/desktop-contract";

export function mapLocalTool(name: string, args: Record<string, unknown>, output: string) {
  if (name === "cli_run_command" || name === "cli_start_process") {
    return {
      name: "runComputerCommand",
      args: { command: [args.command, ...(Array.isArray(args.args) ? args.args : [])].join(" ") },
      result: { output },
    };
  }
  if (name === "cli_read_file") {
    return { name: "readComputerFile", args, result: { path: args.path, content: output } };
  }
  if (name === "cli_write_file") {
    return {
      name: "writeComputerFiles",
      args: { files: [{ path: args.path, content: args.content }] },
      result: { output },
    };
  }
  return { name, args, result: { output } };
}

export function localToolCalls(messages: LocalMessage[], until = messages.length) {
  let lastUser = -1;
  for (let index = 0; index < until; index += 1) {
    if (messages[index].role === "user") lastUser = index;
  }
  return messages.slice(lastUser + 1, until).filter((message) => message.role === "tool" && message.toolName).map((message) => ({
    ...mapLocalTool(message.toolName!, message.toolArgs ?? {}, message.content),
    status: message.content.startsWith("Error:") || message.content.startsWith("User denied") ? "error" : "success",
    timestamp: message.createdAt,
  }));
}
