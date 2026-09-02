export const COMMONS_COPILOT_PROMPT_EVENT = "commons-copilot-prompt";
export const CREATE_UI_PLUGIN_HASH = "#create-ui-plugin";
export const CREATE_UI_PLUGIN_INTENT_ID = "create-ui-plugin";

export type CommonsCopilotPromptMode = "send" | "draft";

export type CommonsCopilotAttachment = {
  fileId: string;
  name: string;
  mimeType: string;
  kind?: string;
  sizeBytes: number;
  textPreview?: string | null;
  previewUrl?: string;
};

export type CommonsCopilotPromptDetail = {
  text: string;
  mode?: CommonsCopilotPromptMode;
  attachment?: CommonsCopilotAttachment;
  /** Opaque UI context. The API sanitizes and verifies resource identifiers. */
  context?: Record<string, unknown>;
  /**
   * Stable identifier for a launcher action. While an intent is already open,
   * dispatching it again only focuses Copilot instead of enqueueing the same
   * prompt a second time.
   */
  intentId?: string;
};

type PendingCommonsCopilotPrompt = {
  detail: CommonsCopilotPromptDetail;
  createdAt: number;
};

type CommonsCopilotWindow = Window & {
  __agentCommonsPendingCopilotPrompt?: PendingCommonsCopilotPrompt;
};

const PENDING_PROMPT_TTL_MS = 10_000;

/**
 * Take an intent dispatched before the floating Copilot host mounted. Keeping
 * this on window makes the handoff durable across independently loaded client
 * chunks without leaving stale prompts behind after a reload.
 */
export function takePendingCommonsCopilotPrompt() {
  if (typeof window === "undefined") return undefined;
  const copilotWindow = window as CommonsCopilotWindow;
  const pending = copilotWindow.__agentCommonsPendingCopilotPrompt;
  delete copilotWindow.__agentCommonsPendingCopilotPrompt;
  if (!pending || Date.now() - pending.createdAt > PENDING_PROMPT_TTL_MS) {
    return undefined;
  }
  return pending.detail;
}

/** Open Commons Copilot with a prompt from another part of the product. */
export function openCommonsCopilotPrompt(detail: CommonsCopilotPromptDetail) {
  if (typeof window === "undefined") return;
  const text = detail.text.trim();
  if (!text && !detail.attachment?.fileId) return;

  const normalizedDetail: CommonsCopilotPromptDetail = {
    text,
    mode: detail.mode === "draft" ? "draft" : "send",
    intentId: detail.intentId?.trim() || undefined,
    attachment: detail.attachment,
    context: detail.context,
  };
  (window as CommonsCopilotWindow).__agentCommonsPendingCopilotPrompt = {
    detail: normalizedDetail,
    createdAt: Date.now(),
  };
  window.dispatchEvent(
    new CustomEvent<CommonsCopilotPromptDetail>(COMMONS_COPILOT_PROMPT_EVENT, {
      detail: normalizedDetail,
    }),
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
    intentId: CREATE_UI_PLUGIN_INTENT_ID,
  });
}
