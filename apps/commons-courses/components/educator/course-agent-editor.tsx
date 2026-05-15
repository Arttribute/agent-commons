"use client";

import { Plus, Trash2 } from "lucide-react";
import type {
  CourseAgentAction,
  CourseAgentConfig,
  CourseAgentDataScope,
} from "@/types/course-agent";

type Props = {
  agents: CourseAgentConfig[];
  onChange: (agents: CourseAgentConfig[]) => void;
};

const actionOptions: CourseAgentAction[] = [
  "suggest",
  "draft",
  "fill_view",
  "navigate",
];

export function CourseAgentEditor({ agents, onChange }: Props) {
  function updateAgent(index: number, next: CourseAgentConfig) {
    const updated = [...agents];
    updated[index] = next;
    onChange(updated);
  }

  function addAgent() {
    onChange([
      ...agents,
      {
        id: `course-agent-${agents.length + 1}`,
        name: `Course agent ${agents.length + 1}`,
        audience: "learners",
        enabled: true,
        dataScope: "course_content",
        learningMode: "guided",
        actions: ["suggest"],
        instructions: "",
      },
    ]);
  }

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Course agents</h2>
          <p className="mt-1 text-sm text-slate-500">
            Configure learner and educator assistants, their data scope, and the
            actions they can suggest for course views.
          </p>
        </div>
        <button
          type="button"
          onClick={addAgent}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>

      {agents.map((agent, index) => (
        <div key={agent.id} className="space-y-4 rounded-lg bg-slate-50 p-4">
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <Field
              label="Name"
              value={agent.name}
              onChange={(value) => updateAgent(index, { ...agent, name: value })}
            />
            <Field
              label="Agent Commons ID"
              value={agent.agentCommonsAgentId || ""}
              onChange={(value) =>
                updateAgent(index, { ...agent, agentCommonsAgentId: value })
              }
            />
            <label className="flex items-center gap-2 pt-7 text-sm font-bold text-slate-700">
              <input
                type="checkbox"
                checked={agent.enabled}
                onChange={(event) =>
                  updateAgent(index, { ...agent, enabled: event.target.checked })
                }
              />
              Enabled
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <Select
              label="Audience"
              value={agent.audience}
              options={[
                ["learners", "Learners"],
                ["educators", "Educators"],
                ["both", "Both"],
              ]}
              onChange={(value) =>
                updateAgent(index, {
                  ...agent,
                  audience: value as CourseAgentConfig["audience"],
                })
              }
            />
            <Select
              label="Data access"
              value={agent.dataScope}
              options={[
                ["course_overview", "Course overview"],
                ["course_content", "Course content"],
                ["course_content_and_progress", "Content + own progress"],
                ["educator_operations", "Educator operations"],
              ]}
              onChange={(value) =>
                updateAgent(index, {
                  ...agent,
                  dataScope: value as CourseAgentDataScope,
                })
              }
            />
            <Select
              label="Learning mode"
              value={agent.learningMode}
              options={[
                ["socratic", "Socratic"],
                ["guided", "Guided"],
                ["direct_support", "Direct support"],
              ]}
              onChange={(value) =>
                updateAgent(index, {
                  ...agent,
                  learningMode: value as CourseAgentConfig["learningMode"],
                })
              }
            />
          </div>

          <div className="flex flex-wrap gap-3">
            {actionOptions.map((action) => (
              <label
                key={action}
                className="flex items-center gap-2 text-xs font-bold text-slate-600"
              >
                <input
                  type="checkbox"
                  checked={agent.actions.includes(action)}
                  onChange={(event) => {
                    const actions = event.target.checked
                      ? [...agent.actions, action]
                      : agent.actions.filter((item) => item !== action);
                    updateAgent(index, { ...agent, actions });
                  }}
                />
                {action.replace("_", " ")}
              </label>
            ))}
          </div>

          <label className="block">
            <span className="text-sm font-bold text-slate-700">
              Guardrails and instructions
            </span>
            <textarea
              value={agent.instructions}
              onChange={(event) =>
                updateAgent(index, { ...agent, instructions: event.target.value })
              }
              className="mt-2 min-h-24 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
            />
          </label>

          <button
            type="button"
            onClick={() => onChange(agents.filter((_, itemIndex) => itemIndex !== index))}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
          >
            <Trash2 className="h-3.5 w-3.5" /> Remove
          </button>
        </div>
      ))}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-700">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
      />
    </label>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span className="text-sm font-bold text-slate-700">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
      >
        {options.map(([optionValue, labelText]) => (
          <option key={optionValue} value={optionValue}>
            {labelText}
          </option>
        ))}
      </select>
    </label>
  );
}
