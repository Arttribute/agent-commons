export type ProvenanceCaptureMode = "off" | "metadata" | "full";

export type ProvenancePreferences = {
  mode: ProvenanceCaptureMode;
  onchain: boolean;
};

export const DEFAULT_PROVENANCE_PREFERENCES: ProvenancePreferences = {
  mode: "metadata",
  onchain: false,
};

const STORAGE_KEY = "agent-commons:provenance-preferences:v1";

export function readProvenancePreferences(): ProvenancePreferences {
  if (typeof window === "undefined") return DEFAULT_PROVENANCE_PREFERENCES;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
    const mode: ProvenanceCaptureMode = ["off", "metadata", "full"].includes(
      parsed?.mode,
    )
      ? parsed.mode
      : "metadata";
    return { mode, onchain: Boolean(parsed?.onchain) };
  } catch {
    return DEFAULT_PROVENANCE_PREFERENCES;
  }
}

export function writeProvenancePreferences(value: ProvenancePreferences) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  window.dispatchEvent(
    new CustomEvent("agent-commons:provenance-preferences", { detail: value }),
  );
}
