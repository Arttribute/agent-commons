import {
  Bot,
  Check,
  Code2,
  LayoutGrid,
  Search,
  Send,
  Users,
  Workflow,
} from "lucide-react";
import { BrandLogo } from "./brand-logo";

function TrafficLights() {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full bg-stone-300" />
      <span className="h-2.5 w-2.5 rounded-full bg-stone-300" />
      <span className="h-2.5 w-2.5 rounded-full bg-stone-300" />
    </span>
  );
}

function AgentCard({
  initials,
  name,
  role,
  color,
}: {
  initials: string;
  name: string;
  role: string;
  color: string;
}) {
  return (
    <div className="relative z-10 flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-3 shadow-[0_12px_30px_-20px_rgba(28,25,23,0.45)]">
      <span
        className={`flex h-9 w-9 items-center justify-center rounded-xl text-xs font-bold text-stone-900 ${color}`}
      >
        {initials}
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-stone-900">
          {name}
        </span>
        <span className="block truncate text-[10px] text-stone-500">
          {role}
        </span>
      </span>
      <span className="ml-auto h-2 w-2 rounded-full bg-emerald-500" />
    </div>
  );
}

/** Orchestration diagram with integrations at the points agents use them. */
export function TeamVisual() {
  return (
    <div className="relative overflow-hidden rounded-[1.5rem] border border-stone-200 bg-[#fafaf9] p-5 sm:p-8">
      <div className="absolute inset-0 opacity-50 [background-image:radial-gradient(#d6d3d1_1px,transparent_1px)] [background-size:20px_20px]" />
      <div className="relative mx-auto max-w-lg">
        <div className="mx-auto max-w-[250px]">
          <AgentCard
            initials="L"
            name="Lead"
            role="Plans and delegates"
            color="bg-brand-yellow"
          />
        </div>
        <div className="mx-auto h-10 w-px bg-stone-300" />
        <div className="relative grid grid-cols-2 gap-4 sm:grid-cols-3">
          <span className="absolute -top-px left-[16%] right-[16%] h-px bg-stone-300" />
          <div className="pt-4">
            <AgentCard
              initials="R"
              name="Research"
              role="Finds the signal"
              color="bg-brand-cyan"
            />
          </div>
          <div className="pt-4">
            <AgentCard
              initials="B"
              name="Builder"
              role="Ships the work"
              color="bg-brand-mint"
            />
          </div>
          <div className="col-span-2 pt-4 sm:col-span-1">
            <AgentCard
              initials="Q"
              name="Reviewer"
              role="Checks quality"
              color="bg-brand-lilac"
            />
          </div>
        </div>
        <div className="mt-6 grid grid-cols-3 items-center gap-3 rounded-2xl border border-stone-200 bg-white/90 p-3 text-center backdrop-blur">
          <div>
            <p className="text-lg font-semibold tracking-tight">12</p>
            <p className="text-[9px] uppercase tracking-[0.12em] text-stone-400">
              tasks
            </p>
          </div>
          <div className="border-x border-stone-200">
            <p className="text-lg font-semibold tracking-tight">4</p>
            <p className="text-[9px] uppercase tracking-[0.12em] text-stone-400">
              agents
            </p>
          </div>
          <div>
            <p className="text-lg font-semibold tracking-tight">Live</p>
            <p className="text-[9px] uppercase tracking-[0.12em] text-stone-400">
              status
            </p>
          </div>
        </div>
      </div>
      <FloatingLogo
        name="google-drive"
        label="Drive"
        className="left-3 top-4 -rotate-6 sm:left-8"
      />
      <FloatingLogo
        name="github-icon"
        label="GitHub"
        className="right-3 top-5 rotate-6 sm:right-8"
      />
      <FloatingLogo
        name="slack-icon"
        label="Slack"
        className="bottom-8 left-2 rotate-3 sm:left-6"
      />
      <FloatingLogo
        name="linear-icon"
        label="Linear"
        className="bottom-6 right-2 -rotate-3 sm:right-6"
      />
    </div>
  );
}

function FloatingLogo({
  name,
  label,
  className,
}: {
  name: string;
  label: string;
  className: string;
}) {
  return (
    <span
      className={`absolute z-20 flex h-11 w-11 items-center justify-center rounded-xl border border-stone-200 bg-white shadow-lg ${className}`}
      title={label}
    >
      <BrandLogo name={name} size={20} />
    </span>
  );
}

function CanvasNode({
  logo,
  icon,
  title,
  subtitle,
  accent,
}: {
  logo?: string;
  icon?: React.ReactNode;
  title: string;
  subtitle: string;
  accent: string;
}) {
  return (
    <div
      className={`relative flex min-w-[150px] items-center gap-2.5 rounded-xl border border-stone-200 border-l-[3px] bg-white px-3 py-2.5 shadow-card ${accent}`}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-stone-50 ring-1 ring-stone-200/70">
        {logo ? <BrandLogo name={logo} size={16} /> : icon}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[11px] font-semibold text-stone-800">
          {title}
        </span>
        <span className="block truncate text-[9px] text-stone-500">
          {subtitle}
        </span>
      </span>
    </div>
  );
}

/** A compact replica of the real workflow editor: toolbox, dotted canvas and live run state. */
export function WorkflowVisual() {
  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-stone-200 bg-white shadow-[0_28px_80px_-44px_rgba(28,25,23,0.35)]">
      <div className="flex h-12 items-center border-b border-stone-200 px-4">
        <Workflow className="h-4 w-4 text-stone-500" />
        <span className="ml-2 text-xs font-semibold text-stone-800">
          Support triage
        </span>
        <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-medium text-emerald-700">
          Active
        </span>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-[10px] text-stone-400 sm:inline">
            Saved just now
          </span>
          <span className="rounded-lg bg-stone-900 px-3 py-1.5 text-[10px] font-medium text-white">
            Run
          </span>
        </div>
      </div>
      <div className="grid min-h-[360px] grid-cols-[95px_1fr] sm:grid-cols-[170px_1fr]">
        <aside className="border-r border-stone-200 bg-stone-50/80 p-3">
          <div className="mb-3 flex items-center gap-1.5 rounded-md border border-stone-200 bg-white px-2 py-1.5 text-[9px] text-stone-400">
            <Search className="h-3 w-3" /> Search steps
          </div>
          <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-stone-400">
            Building blocks
          </p>
          {[
            [LayoutGrid, "Trigger"],
            [Bot, "Agent"],
            [Code2, "Code"],
            [Send, "Action"],
          ].map(([Icon, label]) => (
            <div
              key={label as string}
              className="mb-1.5 flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-2 py-2 text-[10px] font-medium text-stone-600"
            >
              <Icon className="h-3.5 w-3.5" />{" "}
              <span className="hidden sm:inline">{label as string}</span>
            </div>
          ))}
        </aside>
        <div className="relative overflow-hidden p-5 [background-image:radial-gradient(#dedbd8_1px,transparent_1px)] [background-size:18px_18px] sm:p-8">
          <span className="absolute right-4 top-4 rounded-full border border-stone-200 bg-white px-2.5 py-1 text-[9px] text-stone-500">
            Last run · 2m ago
          </span>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:mt-14 sm:flex-row sm:gap-0">
            <CanvasNode
              logo="google-gmail"
              title="New email"
              subtitle="Gmail trigger"
              accent="border-l-rose-300"
            />
            <Edge />
            <CanvasNode
              icon={<Bot className="h-4 w-4 text-stone-700" />}
              title="Scout triages"
              subtitle="Agent step"
              accent="border-l-cyan-300"
            />
            <Edge />
            <div className="space-y-3">
              <CanvasNode
                logo="linear-icon"
                title="Create issue"
                subtitle="Linear action"
                accent="border-l-violet-300"
              />
              <CanvasNode
                logo="slack-icon"
                title="Notify support"
                subtitle="Slack action"
                accent="border-l-amber-300"
              />
            </div>
          </div>
          <div className="absolute bottom-4 right-4 flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-[9px] text-emerald-700 shadow-card">
            <Check className="h-3 w-3" /> 24 runs completed
          </div>
        </div>
      </div>
    </div>
  );
}

function Edge() {
  return (
    <span
      aria-hidden
      className="hidden h-px w-8 border-t border-dashed border-stone-400 sm:block"
    />
  );
}

export function TerminalVisual() {
  return (
    <div className="overflow-hidden rounded-[1.35rem] border border-stone-800 bg-[#111211] shadow-card">
      <div className="flex items-center justify-between border-b border-stone-800 px-4 py-3">
        <TrafficLights />
        <span className="font-mono text-[10px] text-stone-500">
          agent-commons | zsh
        </span>
        <span className="w-10" />
      </div>
      <div className="space-y-1 p-5 font-mono text-[11px] leading-6 sm:p-6 sm:text-xs">
        <p className="text-stone-300">
          <span className="text-stone-600">$</span> npm i -g @agent-commons/cli
        </p>
        <p className="text-stone-300">
          <span className="text-stone-600">$</span> agc agents create scout
          --runtime native
        </p>
        <p className="text-stone-500">
          Creating Scout with an always-on computer…
        </p>
        <p className="text-emerald-400">✓ agent ready · agc.chat/scout</p>
        <p className="text-stone-300">
          <span className="text-stone-600">$</span> agc chat scout
        </p>
        <p className="text-stone-300">
          <span className="text-brand-cyan">you ›</span> build my weekly
          research brief
        </p>
        <p className="text-stone-300">
          <span className="text-brand-mint">scout ›</span> starting a 3-agent
          research team
        </p>
      </div>
    </div>
  );
}

export function SdkVisual() {
  return (
    <div className="overflow-hidden rounded-[1.35rem] border border-stone-200 bg-white shadow-card">
      <div className="flex items-center justify-between border-b border-stone-200 bg-stone-50/70 px-4 py-3">
        <span className="font-mono text-[10px] text-stone-500">fleet.ts</span>
        <span className="rounded-full border border-stone-200 bg-white px-2 py-0.5 text-[9px] text-stone-500">
          @agent-commons/sdk
        </span>
      </div>
      <pre className="overflow-x-auto p-5 font-mono text-[11px] leading-6 text-stone-700 sm:p-6 sm:text-xs">
        <code>
          <span className="text-violet-600">import</span>
          {" { Commons } "}
          <span className="text-violet-600">from</span>{" "}
          <span className="text-emerald-700">
            &quot;@agent-commons/sdk&quot;
          </span>
          {";\n\n"}
          <span className="text-violet-600">const</span>
          {" team = "}
          <span className="text-violet-600">await</span>
          {" commons.fleets.create({\n  agents: ["}
          <span className="text-emerald-700">&quot;researcher&quot;</span>
          {", "}
          <span className="text-emerald-700">&quot;builder&quot;</span>
          {", "}
          <span className="text-emerald-700">&quot;reviewer&quot;</span>
          {"],\n});\n\n"}
          <span className="text-violet-600">await</span>
          {" team.run("}
          <span className="text-emerald-700">
            &quot;Ship the launch brief&quot;
          </span>
          {");"}
        </code>
      </pre>
    </div>
  );
}

export function ProductMapVisual() {
  return (
    <div className="relative mx-auto max-w-4xl py-14 sm:py-20">
      <div className="absolute inset-x-[12%] top-1/2 h-px bg-stone-200" />
      <div className="relative z-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          [Bot, "Create", "Agents"],
          [Users, "Organize", "Teams"],
          [Workflow, "Automate", "Workflows"],
          [LayoutGrid, "Connect", "Tools"],
        ].map(([Icon, action, object], index) => (
          <div
            key={object as string}
            className="flex flex-col items-center text-center"
          >
            <span
              className={`flex h-14 w-14 items-center justify-center rounded-2xl border border-stone-200 bg-white shadow-card ${
                [
                  "text-cyan-700",
                  "text-violet-700",
                  "text-amber-700",
                  "text-emerald-700",
                ][index]
              }`}
            >
              <Icon className="h-5 w-5" />
            </span>
            <p className="mt-3 text-[10px] uppercase tracking-[0.15em] text-stone-400">
              {action as string}
            </p>
            <p className="text-sm font-semibold text-stone-900">
              {object as string}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
