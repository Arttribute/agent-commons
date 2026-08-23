import { Plus } from "lucide-react";
import { BrandLogo } from "@/components/landing/brand-logo";

/**
 * The tools surface as an orderly panel rather than a scattered cloud: a
 * hairline card, a tidy grid of connected apps, and the escape hatch for
 * anything not on the list.
 */
const TOOLS = [
  { name: "google-gmail", label: "Gmail" },
  { name: "slack-icon", label: "Slack" },
  { name: "google-drive", label: "Drive" },
  { name: "github-icon", label: "GitHub" },
  { name: "google-calendar", label: "Calendar" },
  { name: "notion-icon", label: "Notion" },
  { name: "linear-icon", label: "Linear" },
  { name: "telegram", label: "Telegram" },
];

export function PluginsVisual() {
  return (
    <div className="w-[400px] overflow-hidden rounded-xl border border-stone-200 bg-white shadow-card">
      <div className="flex items-center justify-between border-b border-stone-200 px-4 py-2.5">
        <span className="text-[11px] font-medium text-stone-700">
          Connected tools
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-stone-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          8 active
        </span>
      </div>

      <div className="grid grid-cols-3 gap-px bg-stone-200">
        {TOOLS.map((tool) => (
          <span
            key={tool.name}
            className="flex items-center gap-2 bg-white px-3 py-2.5"
          >
            <BrandLogo name={tool.name} size={16} />
            <span className="truncate text-[11px] text-stone-600">
              {tool.label}
            </span>
          </span>
        ))}
        <span className="flex items-center gap-2 bg-white px-3 py-2.5">
          <span className="flex h-4 w-4 items-center justify-center rounded border border-dashed border-stone-300 text-stone-400">
            <Plus className="h-2.5 w-2.5" />
          </span>
          <span className="truncate text-[11px] text-stone-400">MCP</span>
        </span>
      </div>
    </div>
  );
}
