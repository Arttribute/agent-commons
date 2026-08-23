"use client";

import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import { AgentsVisual } from "@/components/landing/agents-visual";

/** How long each feature holds before the carousel moves on. */
const SLIDE_MS = 7000;
/** Ceiling on how far a visual is enlarged to fill the stage. */
const MAX_SCALE = 1.1;

// Only the first slide ships in the initial bundle. The rest load as the
// carousel reaches them (with the next one preloaded), which keeps the landing
// page's first paint free of the heavier visuals.
const lazyVisual = (load: () => Promise<{ default: () => ReactNode }>) =>
  dynamic(load, { ssr: false });

const ComputerMiniVisual = lazyVisual(() =>
  import("@/components/landing/computer-mini-visual").then((m) => ({
    default: m.ComputerMiniVisual,
  })),
);
const FlowVisual = lazyVisual(() =>
  import("@/components/landing/flow-visual").then((m) => ({
    default: m.FlowVisual,
  })),
);
const PluginsVisual = lazyVisual(() =>
  import("@/components/landing/plugins-visual").then((m) => ({
    default: m.PluginsVisual,
  })),
);
const ModelsVisual = lazyVisual(() =>
  import("@/components/landing/models-visual").then((m) => ({
    default: m.ModelsVisual,
  })),
);
const TerminalVisual = lazyVisual(() =>
  import("@/components/landing/terminal-visual").then((m) => ({
    default: m.TerminalVisual,
  })),
);

type Slide = {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  /** Design size of the visual; the stage scales it to fit. */
  width: number;
  height: number;
  render: () => ReactNode;
};

const SLIDES: Slide[] = [
  {
    id: "agents",
    eyebrow: "Agents",
    title: "Every agent in one workspace.",
    body: "Create specialists, give each one a role, and run the whole fleet from a single place.",
    width: 420,
    height: 200,
    render: () => <AgentsVisual />,
  },
  {
    id: "computers",
    eyebrow: "Computers",
    title: "A computer for every agent.",
    body: "Persistent cloud desktops with files, a terminal, and a browser — still working when your laptop is closed.",
    width: 420,
    height: 200,
    render: () => <ComputerMiniVisual />,
  },
  {
    id: "workflows",
    eyebrow: "Workflows",
    title: "Automate the work that repeats.",
    body: "Wire agents, tools, and approvals into one flow. Run it on a schedule, a webhook, or an event.",
    width: 420,
    height: 200,
    render: () => <FlowVisual />,
  },
  {
    id: "tools",
    eyebrow: "Tools",
    title: "Plug into the tools you already use.",
    body: "Gmail, Slack, GitHub, Drive and more in a couple of clicks — or bring your own over MCP.",
    width: 420,
    height: 200,
    render: () => <PluginsVisual />,
  },
  {
    id: "models",
    eyebrow: "Models",
    title: "Switch models, keep everything else.",
    body: "OpenAI, Anthropic, Google, Mistral, or open weights. Change the model without rebuilding the agent.",
    width: 420,
    height: 200,
    render: () => <ModelsVisual />,
  },
  {
    id: "developers",
    eyebrow: "Developers",
    title: "Your agents in any terminal.",
    body: "The agc CLI and the typed SDK put agents, workflows, and computers one command away.",
    width: 420,
    height: 200,
    render: () => <TerminalVisual />,
  },
];

/**
 * Renders a visual at its design size and scales it to fit the space the pane
 * has, so every feature keeps its composition on any viewport without a
 * scrollbar ever appearing.
 */
function ScaledStage({
  width,
  height,
  children,
}: {
  width: number;
  height: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const { width: availableW, height: availableH } =
        element.getBoundingClientRect();
      if (!availableW || !availableH) return;
      setScale(Math.min(availableW / width, availableH / height, MAX_SCALE));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [width, height]);

  return (
    <div ref={ref} className="flex h-full w-full items-center justify-center">
      {/* Children only mount once the scale is known. A visual rendered inside
          a `scale(0)` box measures itself as zero-sized. */}
      {scale > 0 && (
        <div
          style={{ width, height, transform: `scale(${scale})` }}
          className="flex shrink-0 origin-center items-center justify-center"
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function FeatureCarousel() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  // Mount the visible slide plus the next one, so advancing never waits on a
  // chunk download. Slides stay mounted once loaded.
  const [loaded, setLoaded] = useState<number[]>([0, 1]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    setLoaded((current) => {
      const next = (index + 1) % SLIDES.length;
      if (current.includes(index) && current.includes(next)) return current;
      return Array.from(new Set([...current, index, next]));
    });
  }, [index]);

  const go = useCallback((next: number) => {
    setIndex(((next % SLIDES.length) + SLIDES.length) % SLIDES.length);
  }, []);

  useEffect(() => {
    if (paused || reducedMotion) return;
    const timer = window.setTimeout(
      () => setIndex((current) => (current + 1) % SLIDES.length),
      SLIDE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [index, paused, reducedMotion]);

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Agent Commons features"
      className="w-full"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") go(index + 1);
        if (event.key === "ArrowLeft") go(index - 1);
      }}
    >
      <div className="relative h-[210px] w-full overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-card sm:h-[248px]">
        {SLIDES.map((slide, i) => (
          <div
            key={slide.id}
            aria-hidden={i !== index}
            className={cn(
              "absolute inset-0 grid grid-cols-1 transition-opacity duration-700 ease-out sm:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]",
              i === index ? "opacity-100" : "pointer-events-none opacity-0",
            )}
          >
            <div className="min-h-0 min-w-0 overflow-hidden border-stone-200 bg-[#fcfcfb] p-4 sm:border-r">
              {loaded.includes(i) && (
                <ScaledStage width={slide.width} height={slide.height}>
                  {slide.render()}
                </ScaledStage>
              )}
            </div>
            <div className="hidden min-w-0 flex-col justify-center px-7 sm:flex">
              <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-stone-400">
                {slide.eyebrow}
              </p>
              <h2 className="mt-2 text-[1.15rem] font-medium leading-[1.2] tracking-[-0.025em] text-stone-950">
                {slide.title}
              </h2>
              <p className="mt-2 text-[13px] leading-5 text-stone-500">
                {slide.body}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* On phones the pane is too narrow to sit beside the art. */}
      <div key={SLIDES[index].id} className="mt-3 animate-in fade-in duration-500 sm:hidden">
        <h2 className="text-[1.05rem] font-medium leading-tight tracking-[-0.025em] text-stone-950">
          {SLIDES[index].title}
        </h2>
        <p className="mt-1.5 text-[13px] leading-5 text-stone-500">
          {SLIDES[index].body}
        </p>
      </div>

      <div className="mt-4 flex items-center justify-center gap-2">
        {SLIDES.map((slide, i) => (
          <button
            key={slide.id}
            type="button"
            onClick={() => go(i)}
            aria-label={slide.eyebrow}
            aria-current={i === index}
            className={cn(
              "h-1.5 overflow-hidden rounded-full transition-all duration-500",
              i === index
                ? "w-10 bg-stone-200"
                : "w-1.5 bg-stone-300 hover:bg-stone-400",
            )}
          >
            {i === index && (
              <span
                className={cn(
                  "block h-full rounded-full bg-stone-800",
                  reducedMotion ? "w-full" : "w-full origin-left",
                )}
                style={
                  reducedMotion
                    ? undefined
                    : {
                        animation: `carousel-progress ${SLIDE_MS}ms linear forwards`,
                        animationPlayState: paused ? "paused" : "running",
                      }
                }
              />
            )}
          </button>
        ))}
      </div>
    </section>
  );
}
