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
import { FleetVisual } from "@/components/landing/fleet-visual";

/** How long each feature holds before the carousel moves on. */
const SLIDE_MS = 7000;
/** Ceiling on how far a visual is enlarged to fill the stage, so the compact
 *  ones (models, terminal) carry the same weight as the wide canvases without
 *  ever looking blown up. */
const MAX_SCALE = 1.35;

// Only the first slide ships in the initial bundle. The rest load as the
// carousel reaches them (with the next one preloaded), which keeps the landing
// page's first paint free of ReactFlow and the other heavy visuals.
const ComputerVisual = dynamic(
  () =>
    import("@/components/landing/computer-visual").then((m) => ({
      default: m.ComputerVisual,
    })),
  { ssr: false },
);
const WorkflowVisual = dynamic(
  () =>
    import("@/components/landing/workflow-visual").then((m) => ({
      default: m.WorkflowVisual,
    })),
  { ssr: false },
);
const IntegrationCloud = dynamic(
  () =>
    import("@/components/landing/integration-cloud").then((m) => ({
      default: m.IntegrationCloud,
    })),
  { ssr: false },
);
const ModelCloud = dynamic(
  () =>
    import("@/components/landing/model-cloud").then((m) => ({
      default: m.ModelCloud,
    })),
  { ssr: false },
);
const DeveloperVisual = dynamic(
  () =>
    import("@/components/landing/developer-visual").then((m) => ({
      default: m.DeveloperVisual,
    })),
  { ssr: false },
);

type Slide = {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  /** Design size of the visual; the stage scales it down to fit. */
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
    width: 780,
    height: 420,
    render: () => <FleetVisual />,
  },
  {
    id: "computers",
    eyebrow: "Computers",
    title: "A computer for every agent.",
    body: "Persistent cloud desktops with files, a terminal, and a browser — still working when your laptop is closed.",
    width: 700,
    height: 450,
    render: () => <ComputerVisual />,
  },
  {
    id: "workflows",
    eyebrow: "Workflows",
    title: "Automate the work that repeats.",
    body: "Wire agents, tools, and approvals on one canvas. Run it on a schedule, a webhook, or an event.",
    width: 760,
    height: 470,
    render: () => <WorkflowVisual />,
  },
  {
    id: "tools",
    eyebrow: "Tools",
    title: "Plug into the tools you already use.",
    body: "Gmail, Slack, GitHub, Drive and more in a couple of clicks — or bring your own over MCP.",
    width: 640,
    height: 410,
    render: () => <IntegrationCloud />,
  },
  {
    id: "models",
    eyebrow: "Models",
    title: "Switch models, keep everything else.",
    body: "OpenAI, Anthropic, Google, Mistral, or open weights. Change the model without rebuilding the agent.",
    width: 620,
    height: 320,
    render: () => <ModelCloud />,
  },
  {
    id: "developers",
    eyebrow: "Developers",
    title: "Your agents in any terminal.",
    body: "The agc CLI and the typed SDK put agents, workflows, and computers one command away.",
    width: 480,
    height: 350,
    render: () => <DeveloperVisual />,
  },
];

/**
 * Renders a visual at its design size and scales it to fit whatever space the
 * stage has, so every feature keeps its composition on any viewport without a
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
          a `scale(0)` box measures itself as zero-sized, which leaves canvas
          visuals like ReactFlow permanently mis-fitted. */}
      {scale > 0 && (
        <div
          style={{ width, height, transform: `scale(${scale})` }}
          className="shrink-0 origin-center"
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

  const active = SLIDES[index];

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Agent Commons features"
      className="flex h-full min-h-0 w-full flex-col"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") go(index + 1);
        if (event.key === "ArrowLeft") go(index - 1);
      }}
    >
      <div className="relative min-h-0 w-full flex-1">
        {SLIDES.map((slide, i) => (
          <div
            key={slide.id}
            aria-hidden={i !== index}
            className={cn(
              "absolute inset-0 transition-opacity duration-700 ease-out",
              i === index ? "opacity-100" : "pointer-events-none opacity-0",
            )}
          >
            {loaded.includes(i) && (
              <ScaledStage width={slide.width} height={slide.height}>
                {slide.render()}
              </ScaledStage>
            )}
          </div>
        ))}
      </div>

      <div
        key={active.id}
        className="mx-auto mt-4 max-w-xl shrink-0 animate-in fade-in slide-in-from-bottom-2 text-center duration-500 sm:mt-6"
        aria-live="polite"
      >
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-stone-400">
          {active.eyebrow}
        </p>
        <h2 className="mt-2 text-[1.35rem] font-medium leading-tight tracking-[-0.03em] text-stone-950 sm:text-[1.6rem]">
          {active.title}
        </h2>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-stone-500">
          {active.body}
        </p>
      </div>

      <div className="mt-4 flex shrink-0 items-center justify-center gap-2 sm:mt-5">
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
