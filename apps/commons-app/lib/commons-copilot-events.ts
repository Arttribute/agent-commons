export const COMMONS_COPILOT_PROMPT_EVENT = "commons-copilot-prompt";

export type CommonsCopilotPromptMode = "send" | "draft";

export type CommonsCopilotPromptDetail = {
  text: string;
  mode?: CommonsCopilotPromptMode;
  /**
   * Stable identifier for a launcher action. While an intent is already open,
   * dispatching it again only focuses Copilot instead of enqueueing the same
   * prompt a second time.
   */
  intentId?: string;
};

/** Open Commons Copilot with a prompt from another part of the product. */
export function openCommonsCopilotPrompt(
  detail: CommonsCopilotPromptDetail,
) {
  if (typeof window === "undefined") return;
  const text = detail.text.trim();
  if (!text) return;

  window.dispatchEvent(
    new CustomEvent<CommonsCopilotPromptDetail>(
      COMMONS_COPILOT_PROMPT_EVENT,
      {
        detail: {
          text,
          mode: detail.mode === "draft" ? "draft" : "send",
          intentId: detail.intentId?.trim() || undefined,
        },
      },
    ),
  );
}

export const CREATE_UI_PLUGIN_PROMPT =
  "Build a custom Agent Commons app or floating widget that [describe what it should do]. Match the Agent Commons look and feel unless I specify another style. Build, test, refine, and register the verified result as a draft for review.";

/**
 * Opens an editable app-creation brief. It deliberately does not submit the
 * prompt: opening a creation control must never start an agent run on its own.
 */
export function openUiPluginCreator() {
  openCommonsCopilotPrompt({
    text: CREATE_UI_PLUGIN_PROMPT,
    mode: "draft",
    intentId: "create-ui-plugin",
  });
}
