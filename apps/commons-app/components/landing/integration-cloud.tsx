import { BrandLogo } from "@/components/landing/brand-logo";

const INTEGRATIONS = [
  {
    name: "google-gmail",
    label: "Gmail",
    className:
      "left-[28%] top-[38%] h-16 w-16 sm:h-[4.5rem] sm:w-[4.5rem]",
    iconSize: 30,
  },
  {
    name: "google-drive",
    label: "Google Drive",
    className: "left-[40%] top-[18%] h-12 w-12 sm:h-14 sm:w-14",
    iconSize: 24,
  },
  {
    name: "google-calendar",
    label: "Google Calendar",
    className: "left-[44%] top-[60%] h-14 w-14 sm:h-16 sm:w-16",
    iconSize: 27,
  },
  {
    name: "slack-icon",
    label: "Slack",
    className: "left-[56%] top-[34%] h-[4.5rem] w-[4.5rem] sm:h-20 sm:w-20",
    iconSize: 34,
  },
  {
    name: "telegram",
    label: "Telegram",
    className: "left-[68%] top-[58%] h-12 w-12 sm:h-14 sm:w-14",
    iconSize: 25,
  },
  {
    name: "linear-icon",
    label: "Linear",
    className: "left-[71%] top-[27%] h-14 w-14 sm:h-16 sm:w-16",
    iconSize: 28,
  },
  {
    name: "notion-icon",
    label: "Notion",
    className: "left-[33%] top-[68%] h-11 w-11 sm:h-12 sm:w-12",
    iconSize: 22,
  },
  {
    name: "github-icon",
    label: "GitHub",
    className: "left-[57%] top-[74%] h-12 w-12 sm:h-14 sm:w-14",
    iconSize: 25,
  },
];

/**
 * A free-floating cluster of connected tools. No containing card — the
 * icons sit close together and blend into the page.
 */
export function IntegrationCloud() {
  return (
    <div className="relative min-h-[350px] sm:min-h-[410px]">
      <div className="absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full bg-teal-100/55 blur-3xl" />
      <div className="absolute left-[38%] top-[30%] h-28 w-28 rounded-full bg-brand-lilac/15 blur-3xl" />
      <div className="absolute bottom-[16%] right-[24%] h-24 w-24 rounded-full bg-brand-cyan/20 blur-3xl" />

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

      <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full border border-stone-200 bg-white/90 px-3 py-1.5 text-[10px] font-medium text-stone-500 shadow-sm backdrop-blur">
        Add your own with MCP or API
      </div>
    </div>
  );
}
