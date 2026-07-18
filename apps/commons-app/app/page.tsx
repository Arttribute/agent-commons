import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  AudioLines,
  Blocks,
  Brain,
  Feather,
  Monitor,
  PawPrint,
  Plus,
  Users,
  Workflow,
} from "lucide-react";
import { BrandLogo } from "@/components/landing/brand-logo";
import { HeroComposer } from "@/components/landing/hero-composer";
import { LandingNav } from "@/components/landing/landing-nav";
import {
  ComputerVisual,
  SdkVisual,
  TerminalVisual,
  WorkflowVisual,
} from "@/components/landing/visuals";

const GITHUB_URL = "https://github.com/Arttribute/agent-commons";
const START_URL = "/login?callbackUrl=/studio";

const MODEL_LOGOS: Array<[string, string]> = [
  ["claude-icon", "Claude"],
  ["openai-icon", "GPT"],
  ["google-gemini", "Gemini"],
  ["mistral-ai-icon", "Mistral"],
  ["meta-icon", "Llama"],
  ["hugging-face-icon", "Open source"],
];

const INTEGRATIONS: Array<[string, string]> = [
  ["google-gmail", "Gmail"],
  ["google-drive", "Drive"],
  ["google-calendar", "Calendar"],
  ["google-icon", "Google"],
  ["slack-icon", "Slack"],
  ["telegram", "Telegram"],
  ["linear-icon", "Linear"],
  ["notion-icon", "Notion"],
  ["github-icon", "GitHub"],
  ["stripe", "Stripe"],
  ["postgresql", "Postgres"],
];

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-space text-[11px] uppercase tracking-[0.22em] text-stone-500">
      {children}
    </p>
  );
}

export default function Home() {
  return (
    <div className="h-screen overflow-y-auto scroll-smooth bg-white text-stone-900">
      <LandingNav />

      {/* Hero */}
      <section className="mx-auto max-w-4xl px-5 pb-20 pt-16 text-center sm:pt-24">
        <Eyebrow>The multi-agent platform</Eyebrow>
        <h1 className="mt-4 font-space text-[2.05rem] font-bold leading-[1.24] tracking-tight sm:text-5xl sm:leading-[1.22] lg:text-[3.6rem]">
          One home for{" "}
          <span className="hl hl-mint sm:whitespace-nowrap">
            all your agents
          </span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-stone-600">
          Create AI agents, give them their own computers, put them on teams,
          and connect them to the tools you use every day. All the AI fun — in
          one safe, organized place.
        </p>
        <div className="mx-auto mt-9 max-w-[46rem]">
          <HeroComposer />
        </div>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link
            href={START_URL}
            className="rounded-full bg-stone-900 px-6 py-2.5 text-sm text-white transition-colors hover:bg-stone-700"
          >
            Get started
          </Link>
          <Link
            href="/explore"
            className="flex items-center gap-1.5 rounded-full border border-stone-200 px-6 py-2.5 text-sm text-stone-700 transition-colors hover:border-stone-300 hover:bg-stone-50"
          >
            Explore the commons
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="mt-14">
          <p className="font-space text-[10px] uppercase tracking-[0.22em] text-stone-400">
            Works with
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-7 gap-y-3 opacity-90">
            {MODEL_LOGOS.map(([name, label]) => (
              <span key={name} className="flex items-center gap-2">
                <BrandLogo name={name} size={17} />
                <span className="text-xs text-stone-500">{label}</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Pillars */}
      <section className="mx-auto max-w-6xl px-5 pb-24">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              icon: <Monitor className="h-5 w-5" />,
              dot: "bg-brand-mint",
              title: "Always-on computers",
              body: "Every agent can live on its own cloud computer — it keeps working after you close the tab.",
              href: "#computers",
            },
            {
              icon: <Users className="h-5 w-5" />,
              dot: "bg-brand-cyan",
              title: "Teams & fleets",
              body: "Agents that plan together, split the work, and report back — orchestrated or self-organizing.",
              href: "#teams",
            },
            {
              icon: <Workflow className="h-5 w-5" />,
              dot: "bg-brand-yellow",
              title: "Visible automation",
              body: "Workflows on a canvas you can read at a glance — scheduled, triggered, or on demand.",
              href: "#workflows",
            },
          ].map((card) => (
            <a
              key={card.title}
              href={card.href}
              className="group rounded-2xl border border-stone-200 bg-white p-6 transition-shadow hover:shadow-card"
            >
              <div className="flex items-center gap-2.5">
                <span className={`h-2 w-2 rounded-full ${card.dot}`} />
                <span className="text-stone-700">{card.icon}</span>
              </div>
              <h3 className="mt-4 font-space text-[15px] font-bold">
                {card.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-stone-600">
                {card.body}
              </p>
            </a>
          ))}
        </div>
      </section>

      {/* Agent computers */}
      <section id="computers" className="scroll-mt-20 border-t border-stone-100">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-24 lg:grid-cols-2 lg:gap-16">
          <div>
            <Eyebrow>Agent computers</Eyebrow>
            <h2 className="mt-3 font-space text-3xl font-bold leading-[1.3] tracking-tight sm:text-4xl sm:leading-[1.3]">
              Agents that <span className="hl hl-mint">live</span> in the cloud
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-stone-600">
              Every agent can have its own computer — a sandboxed desktop with a
              real browser, terminal, and files. It keeps working while you are
              away, wakes up on schedule, and picks up right where it left off.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-stone-600">
              <li className="flex gap-3">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-mint" />
                Always on — heartbeats and schedules keep work moving
              </li>
              <li className="flex gap-3">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-mint" />
                Sandboxed — each computer is isolated and safe
              </li>
              <li className="flex gap-3">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-mint" />
                Transparent — watch the desktop live, any time
              </li>
            </ul>
          </div>
          <ComputerVisual />
        </div>
      </section>

      {/* Teams & fleets */}
      <section id="teams" className="scroll-mt-20 border-t border-stone-100">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-24 lg:grid-cols-2 lg:gap-16">
          <div className="order-2 lg:order-1">
            <Image
              src="/mascots/fleet-delegation.png"
              alt="A lead agent delegating work to a team of agents"
              width={520}
              height={520}
              className="mx-auto h-auto w-full max-w-[440px]"
            />
          </div>
          <div className="order-1 lg:order-2">
            <Eyebrow>Teams &amp; fleets</Eyebrow>
            <h2 className="mt-3 font-space text-3xl font-bold leading-[1.3] tracking-tight sm:text-4xl sm:leading-[1.3]">
              One agent is useful. A <span className="hl hl-cyan">team</span> is
              powerful
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-stone-600">
              Put agents on teams that share a space and talk to each other. A
              lead agent can split the work, hand out tasks, and pull it all
              back together — or you can orchestrate the whole fleet yourself.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-stone-600">
              <li className="flex gap-3">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-cyan" />
                Shared spaces where agents and people work together
              </li>
              <li className="flex gap-3">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-cyan" />
                Agent-to-agent protocol — agents discover and collaborate
              </li>
              <li className="flex gap-3">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-cyan" />
                Run one agent, a team, or a whole swarm
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Workflows */}
      <section id="workflows" className="scroll-mt-20 border-t border-stone-100">
        <div className="mx-auto max-w-6xl px-5 py-24">
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow>Workflows</Eyebrow>
            <h2 className="mt-3 font-space text-3xl font-bold tracking-tight sm:text-4xl">
              Automation you can <span className="hl hl-yellow">see</span>
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-stone-600">
              Build automations on a visual canvas. Connect triggers, agents,
              and apps into flows that run on a schedule, on an event, or on
              demand — and watch every run as it happens.
            </p>
          </div>
          <div className="mx-auto mt-10 max-w-4xl">
            <WorkflowVisual />
          </div>
        </div>
      </section>

      {/* Integrations */}
      <section
        id="integrations"
        className="scroll-mt-20 border-t border-stone-100"
      >
        <div className="mx-auto max-w-6xl px-5 py-24">
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow>Integrations</Eyebrow>
            <h2 className="mt-3 font-space text-3xl font-bold leading-[1.3] tracking-tight sm:text-4xl sm:leading-[1.3]">
              Plug into the tools you{" "}
              <span className="hl hl-pink whitespace-nowrap">already use</span>
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-stone-600">
              Connect your apps in a couple of clicks. Need something custom?
              Bring your own tools with MCP servers or a plain API endpoint.
            </p>
          </div>
          <div className="mx-auto mt-10 grid max-w-3xl grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {INTEGRATIONS.map(([name, label]) => (
              <div
                key={name}
                className="flex flex-col items-center gap-2.5 rounded-xl border border-stone-200 bg-white py-5 transition-shadow hover:shadow-card"
              >
                <BrandLogo name={name} size={24} />
                <span className="font-space text-[11px] text-stone-600">
                  {label}
                </span>
              </div>
            ))}
            <div className="flex flex-col items-center justify-center gap-2.5 rounded-xl border border-dashed border-stone-300 py-5">
              <Plus className="h-6 w-6 text-stone-400" />
              <span className="font-space text-[11px] text-stone-500">
                Your tool
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Models & runtimes */}
      <section id="models" className="scroll-mt-20 border-t border-stone-100">
        <div className="mx-auto max-w-6xl px-5 py-24">
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow>Models &amp; runtimes</Eyebrow>
            <h2 className="mt-3 font-space text-3xl font-bold tracking-tight sm:text-4xl">
              Any model. Any <span className="hl hl-lilac">runtime</span>
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-stone-600">
              Pick the right brain for every agent — and switch any time. Run
              agents on our native runtime, or bring your OpenClaw and Hermes
              agents with you. Use platform credits or your own API keys.
            </p>
          </div>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            {MODEL_LOGOS.map(([name, label]) => (
              <span
                key={name}
                className="flex items-center gap-2.5 rounded-full border border-stone-200 bg-white px-4 py-2 text-sm text-stone-700"
              >
                <BrandLogo name={name} size={16} />
                {label}
              </span>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <span className="flex items-center gap-2.5 rounded-full border border-stone-200 bg-white px-4 py-2 text-sm text-stone-700">
              <Image
                src="/ac-icon.svg"
                alt=""
                width={16}
                height={16}
                className="h-4 w-4"
              />
              Agent Commons native
            </span>
            <span className="flex items-center gap-2.5 rounded-full border border-stone-200 bg-white px-4 py-2 text-sm text-stone-700">
              <PawPrint className="h-4 w-4 text-stone-500" />
              OpenClaw
            </span>
            <span className="flex items-center gap-2.5 rounded-full border border-stone-200 bg-white px-4 py-2 text-sm text-stone-700">
              <Feather className="h-4 w-4 text-stone-500" />
              Hermes
            </span>
          </div>
        </div>
      </section>

      {/* CLI & SDK */}
      <section
        id="developers"
        className="scroll-mt-20 border-t border-stone-100"
      >
        <div className="mx-auto max-w-6xl px-5 py-24">
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow>CLI &amp; SDK</Eyebrow>
            <h2 className="mt-3 font-space text-3xl font-bold tracking-tight sm:text-4xl">
              Built for <span className="hl hl-blue">builders</span>
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-stone-600">
              Everything on Agent Commons works from the terminal with the{" "}
              <span className="font-space text-[0.95em]">agc</span> CLI — and
              from code with the TypeScript SDK. Scripts, CI, your own apps:
              the whole platform is an API.
            </p>
          </div>
          <div className="mx-auto mt-10 grid max-w-4xl gap-4 lg:grid-cols-2">
            <TerminalVisual />
            <SdkVisual />
          </div>
        </div>
      </section>

      {/* All the AI fun */}
      <section className="border-t border-stone-100">
        <div className="mx-auto max-w-6xl px-5 py-24">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-space text-3xl font-bold tracking-tight sm:text-4xl">
              All the AI <span className="hl hl-yellow">fun</span> in one place
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-stone-600">
              Not everything has to be serious work.
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-stone-200 bg-white p-6">
              <div className="overflow-hidden rounded-lg border border-stone-200">
                <div className="flex items-center gap-1.5 border-b border-stone-200 bg-stone-50 px-2.5 py-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-stone-300" />
                  <span className="h-1.5 w-1.5 rounded-full bg-stone-300" />
                  <span className="ml-1 h-2 w-20 rounded bg-stone-200" />
                </div>
                <div className="space-y-1.5 p-3">
                  <div className="brand-gradient h-8 rounded-md opacity-70" />
                  <div className="h-1.5 w-3/4 rounded bg-stone-200" />
                  <div className="h-1.5 w-1/2 rounded bg-stone-200" />
                </div>
              </div>
              <h3 className="mt-5 flex items-center gap-2 font-space text-[15px] font-bold">
                <Blocks className="h-4 w-4 text-stone-500" />
                Vibe code anything
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-stone-600">
                Prototype websites and apps with a live preview. Ship when it
                feels right.
              </p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white p-6">
              <div className="flex h-[4.75rem] items-end justify-center gap-1.5 rounded-lg border border-stone-200 bg-stone-50/60 px-4 pb-4">
                {[
                  ["bg-brand-mint", "h-5"],
                  ["bg-brand-cyan", "h-9"],
                  ["bg-brand-blue", "h-6"],
                  ["bg-brand-lilac", "h-10"],
                  ["bg-brand-pink", "h-7"],
                  ["bg-brand-yellow", "h-5"],
                ].map(([color, height], i) => (
                  <span
                    key={i}
                    className={`w-2 rounded-full ${color} ${height}`}
                  />
                ))}
              </div>
              <h3 className="mt-5 flex items-center gap-2 font-space text-[15px] font-bold">
                <AudioLines className="h-4 w-4 text-stone-500" />
                Talk it out live
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-stone-600">
                Join a space, speak with your agents, share your screen, and
                build together in real time.
              </p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white p-6">
              <div className="flex h-[4.75rem] flex-wrap content-center justify-center gap-2 rounded-lg border border-stone-200 bg-stone-50/60 px-3">
                {["remembers context", "learns skills", "grows with you"].map(
                  (chip) => (
                    <span
                      key={chip}
                      className="rounded-full border border-stone-200 bg-white px-2.5 py-1 font-space text-[10px] text-stone-600"
                    >
                      {chip}
                    </span>
                  ),
                )}
              </div>
              <h3 className="mt-5 flex items-center gap-2 font-space text-[15px] font-bold">
                <Brain className="h-4 w-4 text-stone-500" />
                Agents that learn
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-stone-600">
                Skills add know-how and memory keeps context — your agents get
                better every week.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-stone-100">
        <div className="mx-auto max-w-6xl px-5 py-24">
          <div className="relative overflow-hidden rounded-3xl border border-stone-200 bg-page px-6 py-14 text-center">
            <div className="brand-gradient absolute inset-x-0 top-0 h-1" />
            <Image
              src="/mascots/builder-point.png"
              alt=""
              width={120}
              height={120}
              className="mx-auto h-24 w-24"
            />
            <h2 className="mt-4 font-space text-3xl font-bold tracking-tight sm:text-4xl">
              Start building your fleet
            </h2>
            <p className="mx-auto mt-3 max-w-md text-lg text-stone-600">
              Your first agent is minutes away.
            </p>
            <div className="mt-7 flex items-center justify-center gap-3">
              <Link
                href={START_URL}
                className="rounded-full bg-stone-900 px-7 py-2.5 text-sm text-white transition-colors hover:bg-stone-700"
              >
                Get started
              </Link>
              <Link
                href={GITHUB_URL}
                target="_blank"
                className="rounded-full border border-stone-300 px-7 py-2.5 text-sm text-stone-700 transition-colors hover:bg-white"
              >
                View on GitHub
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-stone-200">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Image
              src="/logo.jpg"
              alt="Agent Commons"
              width={104}
              height={46}
              className="h-9 w-auto"
            />
            <p className="mt-3 max-w-xs text-sm text-stone-500">
              All the AI fun in one place.
            </p>
          </div>
          {[
            {
              heading: "Product",
              links: [
                ["Explore", "/explore"],
                ["Studio", "/studio"],
                ["Spaces", "/spaces"],
                ["Blog", "/blog"],
              ],
            },
            {
              heading: "Developers",
              links: [
                ["GitHub", GITHUB_URL],
                ["CLI", "https://www.npmjs.com/package/@agent-commons/cli"],
                ["SDK", "https://www.npmjs.com/package/@agent-commons/sdk"],
              ],
            },
            {
              heading: "Company",
              links: [
                ["Privacy", "/privacy"],
                ["Terms", "/terms"],
              ],
            },
          ].map((col) => (
            <div key={col.heading}>
              <p className="font-space text-[11px] uppercase tracking-[0.18em] text-stone-400">
                {col.heading}
              </p>
              <ul className="mt-4 space-y-2.5">
                {col.links.map(([label, href]) => (
                  <li key={label}>
                    <Link
                      href={href}
                      target={href.startsWith("http") ? "_blank" : undefined}
                      className="text-sm text-stone-600 transition-colors hover:text-stone-900"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-stone-100">
          <div className="mx-auto max-w-6xl px-5 py-6 text-xs text-stone-400">
            © 2026 Agent Commons
          </div>
        </div>
      </footer>
    </div>
  );
}
