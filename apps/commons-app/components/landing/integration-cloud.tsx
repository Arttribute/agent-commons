import { BrandLogo } from "@/components/landing/brand-logo";

const INTEGRATIONS = [
  {
    name: "google-gmail",
    label: "Gmail",
    className:
      "left-[12%] top-[27%] h-16 w-16 sm:left-[8%] sm:h-[4.5rem] sm:w-[4.5rem]",
    iconSize: 30,
  },
  {
    name: "google-drive",
    label: "Google Drive",
    className: "left-[25%] top-[8%] h-12 w-12 sm:h-14 sm:w-14",
    iconSize: 24,
  },
  {
    name: "google-calendar",
    label: "Google Calendar",
    className: "left-[35%] top-[51%] h-14 w-14 sm:h-16 sm:w-16",
    iconSize: 27,
  },
  {
    name: "slack-icon",
    label: "Slack",
    className: "left-[49%] top-[17%] h-[4.5rem] w-[4.5rem] sm:h-20 sm:w-20",
    iconSize: 34,
  },
  {
    name: "telegram",
    label: "Telegram",
    className: "left-[66%] top-[55%] h-12 w-12 sm:h-14 sm:w-14",
    iconSize: 25,
  },
  {
    name: "linear-icon",
    label: "Linear",
    className: "left-[81%] top-[22%] h-14 w-14 sm:h-16 sm:w-16",
    iconSize: 28,
  },
  {
    name: "notion-icon",
    label: "Notion",
    className: "left-[18%] top-[70%] h-11 w-11 sm:h-12 sm:w-12",
    iconSize: 22,
  },
  {
    name: "github-icon",
    label: "GitHub",
    className: "left-[52%] top-[76%] h-12 w-12 sm:h-14 sm:w-14",
    iconSize: 25,
  },
];

export function IntegrationCloud() {
  return (
    <div className="relative min-h-[350px] overflow-hidden rounded-[1.5rem] border border-stone-200 bg-[#fafaf9] sm:min-h-[410px]">
      <div className="absolute inset-0 opacity-35 [background-image:radial-gradient(#d6d3d1_0.8px,transparent_0.8px)] [background-size:22px_22px]" />
      <div className="absolute left-1/2 top-1/2 h-52 w-52 -translate-x-1/2 -translate-y-1/2 rounded-full bg-teal-100/55 blur-3xl" />
      <div className="absolute left-[26%] top-[28%] h-28 w-28 rounded-full bg-brand-lilac/15 blur-3xl" />
      <div className="absolute bottom-[12%] right-[16%] h-24 w-24 rounded-full bg-brand-cyan/20 blur-3xl" />

      {INTEGRATIONS.map((item) => (
        <span
          key={item.name}
          title={item.label}
          aria-label={item.label}
          className={`absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl border border-stone-200/90 bg-white shadow-[0_16px_35px_-22px_rgba(28,25,23,0.45)] transition-transform duration-200 hover:scale-105 ${item.className}`}
        >
          <BrandLogo name={item.name} size={item.iconSize} />
        </span>
      ))}

      <div className="absolute bottom-5 left-1/2 z-10 -translate-x-1/2 rounded-full border border-stone-200 bg-white/90 px-3 py-1.5 text-[10px] font-medium text-stone-500 shadow-sm backdrop-blur">
        Add your own with MCP or API
      </div>
    </div>
  );
}
