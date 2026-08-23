const MAX_PLUGIN_STORAGE_KEYS = 32;
const MAX_PLUGIN_STORAGE_BYTES = 64_000;

export type PluginStorageBackend = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem" | "key" | "length"
>;

export type PluginStorage = {
  get: (key: string) => string | null;
  set: (key: string, value: string) => void;
  remove: (key: string) => void;
};

/**
 * Creates storage isolated to a single plugin. Plugin IDs are encoded so IDs
 * that contain the namespace delimiter cannot overlap another plugin's keys.
 */
export function createPluginStorage(
  pluginId: string,
  storage: PluginStorageBackend = window.localStorage,
): PluginStorage {
  const prefix = `commons-ui-plugin:${encodeURIComponent(pluginId)}:`;
  const fullKey = (key: string) => `${prefix}${key}`;

  return {
    get(key: string) {
      try {
        return storage.getItem(fullKey(key));
      } catch {
        return null;
      }
    },
    set(key: string, value: string) {
      const target = fullKey(key);
      try {
        const keys = storageKeys(storage).filter((candidate) =>
          candidate.startsWith(prefix),
        );
        const targetExists = keys.includes(target);
        if (!targetExists && keys.length >= MAX_PLUGIN_STORAGE_KEYS) {
          throw new Error("Plugin storage key limit reached");
        }

        const existingBytes = keys.reduce((total, candidate) => {
          const existingValue = storage.getItem(candidate);
          return (
            total + (existingValue === null ? 0 : utf8Bytes(existingValue))
          );
        }, 0);
        const previousValue = targetExists ? storage.getItem(target) : null;
        const previousBytes =
          previousValue === null ? 0 : utf8Bytes(previousValue);
        if (
          existingBytes - previousBytes + utf8Bytes(value) >
          MAX_PLUGIN_STORAGE_BYTES
        ) {
          throw new Error("Plugin storage quota reached");
        }
        storage.setItem(target, value);
      } catch (cause) {
        throw cause instanceof Error
          ? cause
          : new Error("Plugin storage is unavailable");
      }
    },
    remove(key: string) {
      try {
        storage.removeItem(fullKey(key));
      } catch {
        // Removing an unavailable key is idempotent.
      }
    },
  };
}

function storageKeys(storage: PluginStorageBackend) {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key !== null) keys.push(key);
  }
  return keys;
}

function utf8Bytes(value: string) {
  return new TextEncoder().encode(value).byteLength;
}
