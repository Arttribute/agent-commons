import {
  isUiPlugin,
  type UiPlugin,
  type UiPluginStatus,
} from "@/components/plugins/types";

export const UI_PLUGINS_CHANGED_EVENT = "commons-ui-plugins-changed";

const UI_PLUGINS_CHANNEL = "commons-ui-plugins";

export type UiPluginsChangedDetail = {
  pluginId?: string;
  status?: UiPluginStatus;
  plugin?: UiPlugin;
};

let sharedChannel: BroadcastChannel | null | undefined;

/** Notify widget hosts in this window and other open Commons tabs. */
export function notifyUiPluginsChanged(detail: UiPluginsChangedDetail = {}) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent<UiPluginsChangedDetail>(UI_PLUGINS_CHANGED_EVENT, {
      detail,
    }),
  );
  getBroadcastChannel()?.postMessage(detail);
}

/** Subscribe to plugin-registry changes from this window and other tabs. */
export function subscribeToUiPluginChanges(
  listener: (detail: UiPluginsChangedDetail) => void,
) {
  if (typeof window === "undefined") return () => undefined;

  const onWindowChange = (event: Event) => {
    listener(
      normalizeDetail(
        (event as CustomEvent<UiPluginsChangedDetail>).detail,
      ),
    );
  };
  const onBroadcastChange = (event: MessageEvent<UiPluginsChangedDetail>) => {
    listener(normalizeDetail(event.data));
  };
  const channel = getBroadcastChannel();

  window.addEventListener(UI_PLUGINS_CHANGED_EVENT, onWindowChange);
  channel?.addEventListener("message", onBroadcastChange);

  return () => {
    window.removeEventListener(UI_PLUGINS_CHANGED_EVENT, onWindowChange);
    channel?.removeEventListener("message", onBroadcastChange);
  };
}

function normalizeDetail(value: unknown): UiPluginsChangedDetail {
  if (!value || typeof value !== "object") return {};
  const detail = value as UiPluginsChangedDetail;
  const status = ["draft", "active", "disabled"].includes(detail.status ?? "")
    ? detail.status
    : undefined;
  const plugin = isUiPlugin(detail.plugin) ? detail.plugin : undefined;
  const pluginId =
    typeof detail.pluginId === "string" && detail.pluginId.length <= 200
      ? detail.pluginId
      : plugin?.pluginId;
  return { pluginId, status, plugin };
}

function getBroadcastChannel() {
  if (sharedChannel !== undefined) return sharedChannel;
  if (typeof window === "undefined" || !("BroadcastChannel" in window)) {
    sharedChannel = null;
    return sharedChannel;
  }
  try {
    sharedChannel = new BroadcastChannel(UI_PLUGINS_CHANNEL);
  } catch {
    sharedChannel = null;
  }
  return sharedChannel;
}
