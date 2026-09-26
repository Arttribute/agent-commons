import { existsSync } from "node:fs";
import { basename } from "node:path";
import { execFile } from "node:child_process";

// Small local models sometimes put the entire command line in `command`.
// Split literal arguments without ever evaluating a shell expression.
export function normalizeLocalCommand(input: Record<string, unknown>) {
  if (typeof input.command !== "string" || !input.command.trim()) throw new Error("command must name an executable, for example npx.");
  if (input.args !== undefined && (!Array.isArray(input.args) || input.args.some((arg) => typeof arg !== "string"))) throw new Error("args must be an array of strings.");
  const command = input.command.trim();
  const words: string[] = [];
  if (existsSync(command)) words.push(command);
  else {
    let word = "";
    let quote = "";
    let started = false;
    for (let i = 0; i < command.length; i++) {
      const char = command[i];
      if (quote) {
        if (char === quote) quote = "";
        else if (char === "\\" && quote === '"' && ['"', "\\"].includes(command[i + 1])) word += command[++i];
        else word += char;
      } else if (char === '"' || char === "'") { quote = char; started = true; }
      else if (/\s/.test(char)) {
        if (started) { words.push(word); word = ""; started = false; }
      } else if (/[|&;<>`$]/.test(char)) {
        throw new Error("Shell expressions require an explicit shell executable and argument array. For example use command: npx, args: [--yes, create-next-app@latest, my-app, --yes] for scaffolding.");
      } else { word += char; started = true; }
    }
    if (quote) throw new Error("The command has an unclosed quote. Pass the executable and arguments separately.");
    if (started) words.push(word);
  }
  const executable = words.shift();
  if (!executable) throw new Error("command must name an executable.");
  const supplied = (input.args ?? []) as string[];
  // Avoid repeating arguments when the model supplied both a full command line
  // and the same prefix in args (the common recovery after ENOENT).
  const repeated = words.length > 0 && words.every((word, index) => supplied[index] === word);
  let args = [...words, ...(repeated ? supplied.slice(words.length) : supplied)];
  if (/^npx(?:\.cmd)?$/i.test(basename(executable))) {
    const scaffold = args.findIndex((arg) => /^create-next-app(?:@[^\s]+)?$/.test(arg));
    if (scaffold >= 0) {
      // Desktop tools have no stdin. Both npx's install confirmation and the
      // scaffolder's defaults must be non-interactive; approval shows these flags.
      if (!args.slice(scaffold + 1).includes("--yes")) args.push("--yes");
      if (!args.slice(0, scaffold).some((arg) => arg === "--yes" || arg === "-y")) args = ["--yes", ...args];
    }
  }
  return { ...input, command: executable, args };
}

export async function initializeCommandPath() {
  if (process.platform === "win32") return;
  // Finder/desktop launchers don't inherit the user's login PATH (Homebrew,
  // nvm, etc.). Capture only PATH; don't forward shell startup output to the UI.
  await new Promise<void>((resolve) => {
    execFile(process.env.SHELL || "/bin/sh", ["-ilc", 'printf "\\0%s\\0" "$PATH"'], { timeout: 5_000, maxBuffer: 1_048_576 }, (error, stdout) => {
      const path = stdout.match(/\0([^\0]+)\0/)?.[1];
      if (!error && path) process.env.PATH = path;
      resolve();
    });
  });
}
