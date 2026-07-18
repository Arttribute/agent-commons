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
      className="group block w-full cursor-text rounded-[1.35rem] border border-stone-300 bg-white text-left shadow-composer transition-all hover:-translate-y-0.5 hover:border-stone-400 hover:shadow-floating"
    >
      <div className="min-h-[5rem] px-5 pt-4 text-[15px] leading-6 text-stone-800 sm:text-base">
        {text}
        <span className="ml-px inline-block h-[1.15em] w-[2px] translate-y-[3px] animate-caret-blink rounded-full bg-stone-800" />
      </div>
      <div className="flex items-center justify-between px-4 pb-4 pt-1">
        <div className="flex items-center gap-1.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-stone-200 text-stone-500">
            <Plus className="h-4 w-4" />
          </span>
          <span className="flex h-8 w-8 items-center justify-center rounded-full text-stone-500">
            <Monitor className="h-4 w-4" />
          </span>
          <span className="flex h-8 items-center gap-1.5 rounded-full px-2 text-xs text-stone-500">
            <Sparkles className="h-3.5 w-3.5" />
            Auto
          </span>
        </div>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-900 text-white transition-transform group-hover:scale-105">
          <ArrowUp className="h-4 w-4" />
        </span>
      </div>
    </button>
  );
}
