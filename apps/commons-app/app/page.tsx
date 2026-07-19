import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BrainCircuit,
  Check,
  Cloud,
  Github,
  Globe2,
  LockKeyhole,
  Monitor,
  Network,
  ShieldCheck,
  Sparkles,
  Workflow,
  Wrench,
} from "lucide-react";
import { BrandLogo } from "@/components/landing/brand-logo";
import { AutomationVisual } from "@/components/landing/automation-visual";
import { ComputerVisual } from "@/components/landing/computer-visual";
import { DeveloperVisual } from "@/components/landing/developer-visual";
import { HeroComposer } from "@/components/landing/hero-composer";
import { IntegrationCloud } from "@/components/landing/integration-cloud";
import { LandingNav } from "@/components/landing/landing-nav";
import { ModelCloud } from "@/components/landing/model-cloud";
import { TeamVisual } from "@/components/landing/team-visual";

const GITHUB_URL = "https://github.com/Arttribute/agent-commons";
const START_URL = "/login?callbackUrl=/studio/agents";

function Highlight({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block rounded-md border border-teal-300/70 bg-teal-200 px-[0.18em] leading-[1.15] text-stone-950">
      {children}
    </span>
  );
}

function SectionIntro({
  title,
  body,
  align = "left",
}: {
  title: React.ReactNode;
  body: React.ReactNode;
  align?: "left" | "center";
}) {
  return (
    <div
      className={
        align === "center" ? "mx-auto max-w-3xl text-center" : "max-w-2xl"
      }
    >
      <h2 className="text-[1.6rem] font-medium leading-[1.15] tracking-[-0.03em] text-stone-950 sm:text-[1.85rem]">
        {title}
      </h2>
      <p
        className={`mt-3 text-[15px] leading-7 text-stone-600 sm:text-base ${
          align === "center" ? "mx-auto max-w-3xl" : "max-w-xl"
        }`}
      >
        {body}
      </p>
    </div>
  );
}

function CheckList({ items }: { items: string[] }) {
  return (
    <ul className="mt-7 space-y-3">
      {items.map((item) => (
        <li
          key={item}
          className="flex items-start gap-3 text-sm leading-6 text-stone-600"
        >
          <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-stone-900 text-white">
            <Check className="h-2.5 w-2.5" />
          </span>
          {item}
        </li>
      ))}
    </ul>
  );
}

export default function Home() {
  return (
    <div className="h-screen overflow-y-auto scroll-smooth bg-white text-stone-950">
      <LandingNav />

      <main>
        <section className="relative overflow-hidden border-b border-stone-200">
          <div className="absolute inset-0 opacity-35 [background-image:radial-gradient(#d6d3d1_0.8px,transparent_0.8px)] [background-size:22px_22px]" />
          <div className="pointer-events-none absolute left-[8%] top-32 h-32 w-32 rounded-full bg-brand-cyan/20 blur-3xl" />
          <div className="pointer-events-none absolute right-[7%] top-24 h-40 w-40 rounded-full bg-brand-lilac/20 blur-3xl" />
          <div className="relative mx-auto max-w-7xl px-5 pb-16 pt-16 text-center sm:pb-24 sm:pt-24 lg:px-8 lg:pt-28">
            <h1 className="mx-auto max-w-5xl text-[2.2rem] font-medium leading-[1.05] tracking-[-0.04em] text-stone-950 sm:text-[2.8rem] lg:whitespace-nowrap lg:text-[3.2rem]">
              One home for all your <Highlight>agents</Highlight>.
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-[15px] leading-7 text-stone-600 sm:text-base sm:leading-7">
              Create, deploy, and manage AI agents from one clear workspace.
              Cloud computers, connected tools, and your whole fleet under
              control.
            </p>
            <div className="mx-auto mt-10 max-w-[48rem]">
              <HeroComposer />
            </div>
            <p className="mt-3 text-xs text-stone-400">
              Try a prompt. We will take you straight to your workspace.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href={START_URL}
                className="inline-flex h-11 items-center gap-2 rounded-lg bg-stone-950 px-6 text-sm font-medium text-white transition-all hover:-translate-y-0.5 hover:bg-stone-800"
              >
                Start building free
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/explore"
                className="inline-flex h-11 items-center gap-2 rounded-lg border border-stone-300 bg-white px-6 text-sm font-medium text-stone-800 transition-colors hover:bg-stone-50"
              >
                Explore the commons
              </Link>
            </div>
          </div>
        </section>

        <section id="platform" className="border-b border-stone-200">
          <div className="mx-auto max-w-7xl px-5 py-16 lg:px-8 lg:py-24">
            <SectionIntro
              title={
                <span className="lg:whitespace-nowrap">
                  Everything an agent needs to do real work.
                </span>
              }
              body={
                <span className="lg:whitespace-nowrap">
                  Create agents, give them computers and tools, then coordinate
                  them as teams and workflows.
                </span>
              }
              align="center"
            />
            <div className="mt-14 grid overflow-hidden rounded-[1.5rem] border border-stone-200 bg-stone-200 sm:grid-cols-2 sm:gap-px lg:grid-cols-4">
              {[
                {
                  icon: Cloud,
                  color: "bg-brand-mint/40",
                  title: "Always-on computers",
                  body: "Give every agent a persistent cloud computer with files, a terminal, a browser, and a safe sandbox.",
                  href: "#computers",
                },
                {
                  icon: Network,
                  color: "bg-brand-cyan/35",
                  title: "Teams and fleets",
                  body: "Put agents into coordinated groups that plan, delegate, share context, and finish larger jobs together.",
                  href: "#teams",
                },
                {
                  icon: Workflow,
                  color: "bg-brand-yellow/45",
                  title: "Workflows and automation",
                  body: "Turn repeatable work into clear visual flows that run on demand, on schedule, or when an event happens.",
                  href: "#workflows",
                },
                {
                  icon: Wrench,
                  color: "bg-brand-lilac/35",
                  title: "Connected tools",
                  body: "Connect the apps your agents need, or add your own tools for specialized work.",
                  href: "/studio/tools",
                },
              ].map((item) => (
                <a
                  key={item.title}
                  href={item.href}
                  className="group flex min-h-[225px] flex-col bg-white p-6 transition-colors hover:bg-stone-50 sm:p-8"
                >
                  <span
                    className={`flex h-12 w-12 items-center justify-center rounded-2xl ${item.color}`}
                  >
                    <item.icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-7 text-base font-medium tracking-[-0.015em]">
                    {item.title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-stone-600">
                    {item.body}
                  </p>
                  <span className="mt-auto flex items-center gap-1 pt-6 text-xs font-medium text-stone-800">
                    See how it works{" "}
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                  </span>
                </a>
              ))}
            </div>
          </div>
        </section>

        <section
          id="computers"
          className="scroll-mt-16 border-b border-stone-200 bg-[#fafaf9]"
        >
          <div className="mx-auto grid max-w-7xl items-center gap-14 px-5 py-24 lg:grid-cols-[0.78fr_1.22fr] lg:px-8 lg:py-32">
            <div>
              <SectionIntro
                title="A computer for every agent."
                body="Your agents get a persistent workspace in the cloud. They can use files, run code, browse the web, and keep working when your laptop is closed."
              />
              <CheckList
                items={[
                  "Isolated sandboxes keep agent work contained",
                  "Persistent files and memory carry work across sessions",
                  "Live desktop views show exactly what the agent is doing",
                  "Schedules and heartbeats keep important work moving",
                ]}
              />
              <Link
                href={START_URL}
                className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-stone-950"
              >
                Launch an agent computer <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <ComputerVisual />
          </div>
        </section>

        <section id="teams" className="scroll-mt-16 border-b border-stone-200">
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-16 lg:grid-cols-2 lg:px-8 lg:py-24">
            <TeamVisual />
            <div className="lg:pl-8">
              <SectionIntro
                title={
                  <>
                    Multi-agent <Highlight>teams.</Highlight>
                  </>
                }
                body="Give each agent a clear role. The team shares context, tools, and files, and divides the work."
              />
              <CheckList
                items={[
                  "A focused role for every agent",
                  "Shared context, tools, skills, and files",
                  "Clear ownership and visible progress",
                ]}
              />
            </div>
          </div>
        </section>

        <section
          id="workflows"
          className="scroll-mt-16 border-b border-stone-200 bg-[#fafaf9]"
        >
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-16 lg:grid-cols-[1.12fr_0.88fr] lg:px-8 lg:py-24">
            <AutomationVisual />
            <div className="lg:pl-6">
              <SectionIntro
                title="Workflow automation and scheduled tasks."
                body="Connect agents, tools, and approvals on one visual canvas. Schedule one-off or recurring tasks and follow every run."
              />
              <CheckList
                items={[
                  "Trigger on schedules, webhooks, or app events",
                  "Approvals where they matter",
                  "Every run visible, start to finish",
                ]}
              />
              <Link
                href={START_URL}
                className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-stone-950"
              >
                Build a workflow <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        <section
          id="integrations"
          className="scroll-mt-16 border-b border-stone-200"
        >
          <div className="mx-auto grid max-w-7xl items-center gap-14 px-5 py-24 lg:grid-cols-[0.82fr_1.18fr] lg:px-8 lg:py-32">
            <div>
              <SectionIntro
                title={
                  <>
                    Plug into the tools you{" "}
                    <Highlight>already use.</Highlight>
                  </>
                }
                body="Connect your apps in a couple of clicks. For something custom, bring your own tools with an MCP server or API endpoint."
              />
              <Link
                href="/studio/tools"
                className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-stone-950"
              >
                Explore tools <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <IntegrationCloud />
          </div>
        </section>

        <section
          id="developers"
          className="scroll-mt-16 border-b border-stone-200 bg-[#fafaf9]"
        >
          <div className="mx-auto max-w-7xl px-5 py-16 lg:px-8 lg:py-24">
            <div className="grid items-center gap-14 lg:grid-cols-[0.92fr_1.08fr]">
              <div>
                <SectionIntro
                  title="Work from the terminal or your codebase."
                  body="The agc CLI brings your agents into any shell. The typed TypeScript SDK puts agents, workflows, and computers a function call away."
                />
                <a
                  href="https://docs.agentcommons.io/docs"
                  target="_blank"
                  rel="noreferrer"
                  className="mt-7 inline-flex items-center gap-2 text-sm font-medium text-stone-950"
                >
                  Read the SDK docs <ArrowRight className="h-4 w-4" />
                </a>
              </div>
              <DeveloperVisual />
            </div>
          </div>
        </section>

        <section className="border-b border-stone-200">
          <div className="mx-auto max-w-6xl px-5 py-20 text-center lg:px-8 lg:py-24">
            <h2 className="text-[1.5rem] font-medium tracking-[-0.03em] text-stone-950 sm:text-[1.75rem]">
              Any model. Any <Highlight>framework.</Highlight>
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-stone-600 sm:text-base sm:leading-7">
              Bring models from OpenAI, Anthropic, Google, Mistral, or open
              weights. Run agents natively or on managed frameworks like
              OpenClaw and Hermes.
            </p>
            <div className="mt-6">
              <ModelCloud />
            </div>
          </div>
        </section>

        <section className="border-b border-stone-200 bg-[#fafaf9]">
          <div className="mx-auto max-w-7xl px-5 py-16 lg:px-8 lg:py-24">
            <SectionIntro
              title="From a quick idea to a system that runs every day."
              body="Prototype a website, talk with an agent live, teach a skill, or automate a whole process. It all happens in one organized place, with a clear view of what is running and the ability to step in."
              align="center"
            />
            <div className="mx-auto mt-14 grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                [
                  Globe2,
                  "Vibe code",
                  "Build websites and apps with live previews.",
                ],
                [
                  BrainCircuit,
                  "Teach skills",
                  "Package useful know-how your agents can reuse.",
                ],
                [
                  Sparkles,
                  "Work live",
                  "Chat, speak, share context, and build together.",
                ],
                [
                  ShieldCheck,
                  "Sandboxed work",
                  "Agent computers stay isolated from each other.",
                ],
                [
                  LockKeyhole,
                  "Tool permissions",
                  "Each agent uses only the tools you approve.",
                ],
                [
                  Monitor,
                  "Visible activity",
                  "See work, runs, and outputs from one workspace.",
                ],
              ].map(([Icon, title, body]) => (
                <div
                  key={title as string}
                  className="rounded-2xl border border-stone-200 bg-white p-6"
                >
                  <Icon className="h-5 w-5 text-stone-500" />
                  <h3 className="mt-5 text-sm font-medium">
                    {title as string}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-stone-600">
                    {body as string}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-stone-950 text-white">
          <div className="relative mx-auto max-w-7xl overflow-hidden px-5 py-24 text-center lg:px-8 lg:py-32">
            <div className="brand-gradient absolute inset-x-0 top-0 h-1" />
            <div className="absolute left-[10%] top-16 h-40 w-40 rounded-full bg-brand-cyan/10 blur-3xl" />
            <div className="absolute bottom-0 right-[10%] h-40 w-40 rounded-full bg-brand-lilac/10 blur-3xl" />
            <div className="relative">
              <h2 className="mx-auto mt-2 max-w-4xl text-[1.8rem] font-medium leading-[1.1] tracking-[-0.035em] sm:text-[2.2rem] lg:text-[2.4rem]">
                Build your first agent. Grow into a fleet.
              </h2>
              <p className="mx-auto mt-5 max-w-xl text-[15px] leading-7 text-stone-400 sm:text-base">
                Start small, see the value, and add more capability as your work
                grows.
              </p>
              <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link
                  href={START_URL}
                  className="inline-flex h-11 items-center gap-2 rounded-lg bg-white px-6 text-sm font-medium text-stone-950 transition-transform hover:-translate-y-0.5"
                >
                  Get started free <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href={GITHUB_URL}
                  target="_blank"
                  className="inline-flex h-11 items-center gap-2 rounded-lg border border-stone-700 px-6 text-sm font-medium text-white transition-colors hover:bg-stone-900"
                >
                  <Github className="h-4 w-4" />
                  View on GitHub
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-white">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-16 sm:grid-cols-[1.4fr_1fr_1fr_1fr] lg:px-8">
          <div>
            <Image
              src="/logo.jpg"
              alt="Agent Commons"
              width={112}
              height={48}
              className="h-10 w-auto"
            />
            <p className="mt-4 max-w-xs text-sm leading-6 text-stone-500">
              All the AI fun in one safe, organized place.
            </p>
            <p className="mt-8 flex items-center gap-2 text-xs text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              All systems operational
            </p>
          </div>
          {[
            {
              heading: "Product",
              links: [
                ["Agents", "/studio/agents"],
                ["Workflows", "/studio/workflows"],
                ["Tools", "/studio/tools"],
                ["Explore", "/explore"],
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
                ["Blog", "/blog"],
                ["Privacy", "/privacy"],
                ["Terms", "/terms"],
              ],
            },
          ].map((column) => (
            <div key={column.heading}>
              <p className="text-xs font-medium text-stone-900">
                {column.heading}
              </p>
              <ul className="mt-4 space-y-3">
                {column.links.map(([label, href]) => (
                  <li key={label}>
                    <Link
                      href={href}
                      target={href.startsWith("http") ? "_blank" : undefined}
                      className="text-sm text-stone-500 transition-colors hover:text-stone-950"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-stone-200">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-6 text-xs text-stone-400 lg:px-8">
            <span>© 2026 Agent Commons</span>
            <span>Build together.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
