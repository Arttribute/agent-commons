import { Bot, GitBranch } from "lucide-react";
import { BrandLogo } from "@/components/landing/brand-logo";

/**
 * A workflow reduced to its skeleton: a trigger, an agent, a branch, and two
 * destinations on hairline connectors. Drawn at a fixed 420×200 so the nodes
 * land on exact pixels and the lines stay crisp.
 */
const NODE = 44;
const NODES = [
  { id: "gmail", x: 0, y: 78, label: "New email", logo: "google-gmail" },
  { id: "agent", x: 110, y: 78, label: "Agent triages", icon: Bot },
  { id: "branch", x: 220, y: 78, label: "Needs action?", icon: GitBranch },
  { id: "linear", x: 340, y: 22, label: "Create issue", logo: "linear-icon" },
  { id: "slack", x: 340, y: 134, label: "Notify team", logo: "slack-icon" },
] as const;

export function FlowVisual() {
  return (
    <div className="relative h-[200px] w-[420px]">
      <svg
        viewBox="0 0 420 200"
        className="absolute inset-0 h-full w-full"
        aria-hidden
      >
        <g stroke="#d6d3d1" strokeWidth="1" fill="none" strokeLinecap="round">
          <path d="M44 100 H110" />
          <path d="M154 100 H220" />
          {/* Out of the branch, square corners, into each destination. */}
          <path d="M264 100 H294 Q300 100 300 94 V50 Q300 44 306 44 H340" />
          <path d="M264 100 H294 Q300 100 300 106 V150 Q300 156 306 156 H340" />
        </g>
        <circle cx="77" cy="100" r="2.5" fill="#0d9488" />
        <circle cx="187" cy="100" r="2.5" fill="#0d9488" />
        <circle cx="323" cy="44" r="2.5" fill="#f59e0b" />
        <circle cx="323" cy="156" r="2.5" fill="#f59e0b" />
      </svg>

      {NODES.map((node) => (
        <div
          key={node.id}
          className="absolute flex flex-col items-center"
          style={{ left: node.x, top: node.y, width: NODE }}
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-stone-200 bg-white shadow-card">
            {"logo" in node ? (
              <BrandLogo name={node.logo} size={20} />
            ) : (
              <node.icon
                className="h-[18px] w-[18px] text-stone-500"
                strokeWidth={1.75}
              />
            )}
          </span>
          <span className="mt-1.5 whitespace-nowrap text-[10px] leading-4 text-stone-500">
            {node.label}
          </span>
        </div>
      ))}
    </div>
  );
}
