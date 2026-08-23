"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Monitor, Plus, Sparkles } from "lucide-react";

const PROMPTS = [
  "Build and deploy a landing page for my bakery",
  "Spin up a research team to size the EV market",
  "Watch my inbox and draft replies every morning",
  "Create an agent that triages my Linear issues",
  "Send me a Friday summary of the team's week",
  "Prototype my app idea and show me a live preview",
];

/**
 * The hero's centerpiece: a replica of the in-app composer that types out
 * example prompts on a loop. Any interaction routes to sign-in and drops the
 * visitor straight into the studio.
 *
 * Sizing and chrome track ChatInputBox exactly, so the box a visitor sees here
 * is the box they get once they are inside.
 */
export function HeroComposer() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [promptIndex, setPromptIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const prompt = PROMPTS[promptIndex % PROMPTS.length];
    let pos = 0;

    const type = () => {
      if (cancelled) return;
      pos += 1;
      setText(prompt.slice(0, pos));
      if (pos < prompt.length) {
        timer = setTimeout(type, 34 + Math.random() * 36);
      } else {
        timer = setTimeout(erase, 2100);
      }
    };

    const erase = () => {
      if (cancelled) return;
      pos = Math.max(0, pos - 3);
      setText(prompt.slice(0, pos));
      if (pos > 0) {
        timer = setTimeout(erase, 16);
      } else {
        setPromptIndex((v) => v + 1);
      }
    };

    timer = setTimeout(type, promptIndex === 0 ? 600 : 260);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [promptIndex]);

  const start = () => router.push("/login?callbackUrl=/studio/agents");

  return (
    <button
      type="button"
      onClick={start}
      aria-label="Start a session on Agent Commons"
      className="group relative block w-full cursor-text rounded-2xl border border-stone-300 bg-white text-left shadow-composer transition-colors hover:border-stone-400"
    >
      <div className="h-16 p-3 text-sm text-muted-foreground/60">
        {text}
        <span className="ml-px inline-block h-[1.1em] w-[2px] translate-y-[3px] animate-caret-blink rounded-full bg-stone-400" />
      </div>
      <div className="flex items-center justify-between px-2 pb-2">
        <div className="flex items-center gap-1">
          <span className="rounded-lg p-1.5 text-muted-foreground">
            <Plus className="h-4 w-4" />
          </span>
          <span className="rounded-lg p-1.5 text-muted-foreground">
            <Monitor className="h-4 w-4" />
          </span>
          <span className="flex items-center gap-1.5 rounded-lg p-1.5 text-xs text-muted-foreground">
            <Sparkles className="h-4 w-4" />
            Auto
          </span>
        </div>
        <span className="rounded-lg bg-foreground p-1.5 text-background transition-opacity group-hover:opacity-80">
          <ArrowUp className="h-4 w-4" />
        </span>
      </div>
    </button>
  );
}
