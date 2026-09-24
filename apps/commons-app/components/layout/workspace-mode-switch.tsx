"use client";

export function WorkspaceModeSwitch({ mode, onCloud, onLocal }: {
  mode: "cloud" | "private-local";
  onCloud: () => void;
  onLocal: () => void;
}) {
  return <div className="workspace-mode-switch" role="group" aria-label="Workspace mode">
    <button type="button" aria-pressed={mode === "cloud"} onClick={onCloud}>Cloud</button>
    <button type="button" aria-pressed={mode === "private-local"} onClick={onLocal}>Local</button>
  </div>;
}
