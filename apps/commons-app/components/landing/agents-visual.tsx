import Image from "next/image";

/**
 * The two copilots that ship with the platform, presented the way the studio
 * presents an agent: a portrait tile, a name, what it does, and whether it is
 * running. Two, not a crowd — a fleet reads as specialists with roles.
 */
const AGENTS = [
  {
    name: "Commons Copilot",
    role: "Builds and runs your agents",
    image: "/commons-copilot.png",
    // A line drawing with wide internal margins: it needs a tile behind it and
    // room to sit larger inside one.
    tile: "border border-stone-200 bg-stone-50",
    zoom: "scale-[1.35]",
  },
  {
    name: "CommonLab Copilot",
    role: "Designs and teaches courses",
    image: "/commonlab-icon.svg",
    // The CommonLab mark is already a filled rounded square.
    tile: "",
    zoom: "",
  },
];

export function AgentsVisual() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      {/* Outer centres the pair; inner stretches so both cards match height. */}
      <div className="flex items-stretch gap-4">
        {AGENTS.map((agent) => (
          <div
            key={agent.name}
            className="flex w-[186px] flex-col items-center rounded-xl border border-stone-200 bg-white px-4 py-5 shadow-card"
          >
            <span
              className={`flex h-14 w-14 items-center justify-center overflow-hidden rounded-[0.9rem] ${agent.tile}`}
            >
              <Image
                src={agent.image}
                alt=""
                width={56}
                height={56}
                className={`h-full w-full object-contain ${agent.zoom}`}
              />
            </span>
            <p className="mt-3 text-center text-[13px] font-medium leading-tight text-stone-900">
              {agent.name}
            </p>
            <p className="mt-1.5 flex h-8 items-start justify-center text-center text-[11px] leading-4 text-stone-500">
              {agent.role}
            </p>
            <span className="mt-3 flex items-center gap-1.5 rounded-full border border-stone-200 px-2 py-0.5 text-[10px] font-medium text-stone-600">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Running
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
