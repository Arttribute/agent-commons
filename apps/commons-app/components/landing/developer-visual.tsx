import { Check, SquareTerminal } from "lucide-react";
import { WindowFrame } from "@/components/computers/desktop-window";

/**
 * A single clean terminal window — no tabs, no extra chrome. The session
 * shows the agc CLI and the SDK living side by side in a real shell.
 */
export function DeveloperVisual() {
  return (
    <WindowFrame
      icon={<SquareTerminal className="h-3 w-3 text-zinc-400" />}
      title="agent-commons · zsh"
      className="mx-auto max-w-3xl shadow-[0_28px_80px_-44px_rgba(28,25,23,0.4)]"
      bodyClassName="bg-zinc-950/95"
    >
      <div className="p-5 font-mono text-[11px] leading-6 text-zinc-400 sm:p-7 sm:text-xs">
        <p className="text-zinc-200">
          <span className="text-emerald-400">❯</span> npm install -g
          @agent-commons/cli
        </p>
        <p className="mt-4 text-zinc-200">
          <span className="text-emerald-400">❯</span> agc agents create --name
          Scout --model gpt-5.4
        </p>
        <div className="mt-2 border-l border-zinc-700 pl-4">
          <p className="flex items-center gap-2 font-sans text-emerald-400">
            <Check className="h-3.5 w-3.5" /> Agent created
          </p>
          <p className="mt-1 grid max-w-xs grid-cols-[72px_1fr] gap-x-3">
            <span className="text-zinc-600">Name</span>
            <span className="text-zinc-300">Scout</span>
            <span className="text-zinc-600">Model</span>
            <span className="text-zinc-300">gpt-5.4</span>
          </p>
        </div>
        <p className="mt-4 text-zinc-200">
          <span className="text-emerald-400">❯</span> agc chat Scout --local
        </p>
        <p className="mt-1 text-zinc-500">
          Connected. Scout can now use this terminal and your files.
        </p>
        <p className="mt-4 text-zinc-200">
          <span className="text-emerald-400">❯</span> node -e{" "}
          <span className="text-emerald-500/80">
            &quot;await commons.workflows.run(&apos;launch-brief&apos;)&quot;
          </span>
        </p>
        <p className="mt-1 flex items-center gap-2 text-emerald-400">
          <Check className="h-3.5 w-3.5" /> Workflow finished · 4 steps · 41s
        </p>
        <p className="mt-4 flex items-center gap-2">
          <span className="text-emerald-400">❯</span>
          <span className="inline-block h-3 w-1.5 animate-caret-blink bg-zinc-500" />
        </p>
      </div>
    </WindowFrame>
  );
}
