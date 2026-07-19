import { BrandLogo } from "@/components/landing/brand-logo";

const MODELS = [
  {
    name: "openai-icon",
    label: "OpenAI",
    className: "left-[30%] top-[38%] h-16 w-16 sm:h-[4.5rem] sm:w-[4.5rem]",
    iconSize: 30,
  },
  {
    name: "claude-icon",
    label: "Anthropic Claude",
    className: "left-[45%] top-[62%] h-14 w-14 sm:h-16 sm:w-16",
    iconSize: 28,
  },
  {
    name: "google-gemini",
    label: "Google Gemini",
    className: "left-[52%] top-[26%] h-[4.25rem] w-[4.25rem] sm:h-[4.75rem] sm:w-[4.75rem]",
    iconSize: 32,
  },
  {
    name: "mistral-ai-icon",
    label: "Mistral",
    className: "left-[64%] top-[58%] h-12 w-12 sm:h-14 sm:w-14",
    iconSize: 24,
  },
  {
    name: "meta-icon",
    label: "Meta Llama",
    className: "left-[38%] top-[74%] h-11 w-11 sm:h-12 sm:w-12",
    iconSize: 22,
  },
  {
    name: "hugging-face-icon",
    label: "Hugging Face",
    className: "left-[70%] top-[30%] h-12 w-12 sm:h-14 sm:w-14",
    iconSize: 25,
  },
];

/** Model providers as a loose, free-floating cluster — same feel as the tools cloud. */
export function ModelCloud() {
  return (
    <div className="relative min-h-[260px] sm:min-h-[300px]">
      <div className="absolute left-1/2 top-1/2 h-44 w-44 -translate-x-1/2 -translate-y-1/2 rounded-full bg-teal-100/50 blur-3xl" />
      <div className="absolute left-[36%] top-[30%] h-24 w-24 rounded-full bg-brand-cyan/15 blur-3xl" />

      {MODELS.map((item) => (
        <span
          key={item.name}
          title={item.label}
          aria-label={item.label}
          className={`absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl border border-stone-200/90 bg-white shadow-[0_16px_35px_-22px_rgba(28,25,23,0.45)] transition-transform duration-200 hover:scale-105 ${item.className}`}
        >
          <BrandLogo name={item.name} size={item.iconSize} />
        </span>
      ))}
    </div>
  );
}
