import { Check } from "lucide-react";
import { BrandLogo } from "@/components/landing/brand-logo";

/**
 * The model picker exactly as an agent's settings present it, the clearest way
 * to say "swap the model, keep the agent". One current flagship per provider.
 */
const MODELS = [
  { logo: "openai-icon", name: "GPT-5.5", provider: "OpenAI" },
  { logo: "claude-icon", name: "Claude Opus 5", provider: "Anthropic" },
  { logo: "google-gemini", name: "Gemini 3 Pro", provider: "Google" },
  { logo: "mistral-ai-icon", name: "Mistral Large", provider: "Mistral" },
];
const SELECTED = 1;

export function ModelsVisual() {
  return (
    <div className="w-[360px] overflow-hidden rounded-xl border border-stone-200 bg-white shadow-card">
      <div className="border-b border-stone-200 px-4 py-2.5">
        <span className="text-[11px] font-medium text-stone-700">Model</span>
      </div>
      <div className="divide-y divide-stone-100">
        {MODELS.map((model, i) => (
          <div
            key={model.name}
            className={`flex items-center gap-2.5 px-4 py-2.5 ${
              i === SELECTED ? "bg-stone-50" : ""
            }`}
          >
            <span className="flex w-7 shrink-0 justify-center">
              <BrandLogo name={model.logo} size={16} maxWidth={28} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-medium leading-4 text-stone-800">
                {model.name}
              </span>
              <span className="block text-[10px] leading-4 text-stone-400">
                {model.provider}
              </span>
            </span>
            {i === SELECTED && (
              <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
