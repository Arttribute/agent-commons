/**
 * The agc CLI in a real shell, sized for the carousel so the mono type stays
 * legible rather than scaling down into texture.
 */
export function TerminalVisual() {
  return (
    <div className="w-[420px] overflow-hidden rounded-xl border border-stone-200 shadow-card">
      <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900 px-3 py-2">
        <span className="flex gap-1">
          <span className="h-2 w-2 rounded-full bg-zinc-700" />
          <span className="h-2 w-2 rounded-full bg-zinc-700" />
          <span className="h-2 w-2 rounded-full bg-zinc-700" />
        </span>
        <span className="ml-1 font-mono text-[10px] text-zinc-400">
          agent-commons · zsh
        </span>
      </div>
      <div className="bg-zinc-950 px-4 py-3 font-mono text-[10px] leading-[1.7] text-zinc-400">
        <p className="text-zinc-200">
          <span className="text-emerald-400">❯</span> npm install -g
          @agent-commons/cli
        </p>
        <p className="mt-1.5 text-zinc-200">
          <span className="text-emerald-400">❯</span> agc agents create --name
          Scout
        </p>
        <p className="text-emerald-400">✓ Agent created · gpt-5.4-mini</p>
        <p className="mt-1.5 text-zinc-200">
          <span className="text-emerald-400">❯</span> agc chat Scout --local
        </p>
        <p>Connected. Scout can use this terminal and your files.</p>
        <p className="mt-1.5 text-zinc-200">
          <span className="text-emerald-400">❯</span>
          <span className="ml-1 inline-block h-[1.1em] w-[6px] translate-y-[2px] animate-caret-blink bg-zinc-400" />
        </p>
      </div>
    </div>
  );
}
