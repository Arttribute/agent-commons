import assert from "node:assert/strict";
import test from "node:test";

import { createPluginStorage } from "./plugin-storage.ts";

class MemoryStorage {
  #values = new Map();

  get length() {
    return this.#values.size;
  }

  key(index) {
    return [...this.#values.keys()][index] ?? null;
  }

  getItem(key) {
    return this.#values.get(key) ?? null;
  }

  setItem(key, value) {
    this.#values.set(String(key), String(value));
  }

  removeItem(key) {
    this.#values.delete(key);
  }

  keys() {
    return [...this.#values.keys()];
  }
}

test("plugin storage isolates IDs that could otherwise share a prefix", () => {
  const backend = new MemoryStorage();
  const team = createPluginStorage("team", backend);
  const admin = createPluginStorage("team:admin", backend);

  team.set("admin:token", "team value");
  admin.set("token", "admin value");

  assert.equal(team.get("admin:token"), "team value");
  assert.equal(admin.get("token"), "admin value");
  assert.deepEqual(backend.keys().sort(), [
    "commons-ui-plugin:team%3Aadmin:token",
    "commons-ui-plugin:team:admin:token",
  ]);
});

test("plugin storage enforces 32 keys without blocking replacements", () => {
  const backend = new MemoryStorage();
  const storage = createPluginStorage("plugin-a", backend);

  for (let index = 0; index < 32; index += 1) {
    storage.set(`key-${index}`, "value");
  }

  assert.throws(
    () => storage.set("key-32", "value"),
    /Plugin storage key limit reached/,
  );
  assert.doesNotThrow(() => storage.set("key-0", "replacement"));
  assert.equal(storage.get("key-0"), "replacement");
  assert.equal(backend.length, 32);
});

test("plugin storage replacement accounting subtracts the previous value", () => {
  const storage = createPluginStorage("plugin-a", new MemoryStorage());
  storage.set("primary", "a".repeat(40_000));
  storage.set("secondary", "b".repeat(24_000));

  assert.throws(
    () => storage.set("primary", "a".repeat(40_001)),
    /Plugin storage quota reached/,
  );
  assert.equal(storage.get("primary")?.length, 40_000);

  storage.set("primary", "a".repeat(39_000));
  assert.doesNotThrow(() => storage.set("remaining", "c".repeat(1_000)));
  assert.equal(storage.get("remaining")?.length, 1_000);
});

test("plugin storage measures its 64KB quota in UTF-8 bytes", () => {
  const storage = createPluginStorage("plugin-a", new MemoryStorage());
  const exactQuota = "💾".repeat(16_000);

  assert.equal(exactQuota.length, 32_000);
  assert.doesNotThrow(() => storage.set("multibyte", exactQuota));
  assert.throws(
    () => storage.set("overflow", "a"),
    /Plugin storage quota reached/,
  );
  assert.equal(storage.get("overflow"), null);
});

test("removal only deletes the plugin key and frees key and byte quotas", () => {
  const backend = new MemoryStorage();
  const storage = createPluginStorage("plugin-a", backend);
  const other = createPluginStorage("plugin-b", backend);

  storage.set("payload", "a".repeat(64_000));
  other.set("payload", "other plugin");
  storage.remove("payload");

  assert.equal(storage.get("payload"), null);
  assert.equal(other.get("payload"), "other plugin");
  assert.doesNotThrow(() => storage.set("replacement", "b".repeat(64_000)));
  assert.equal(storage.get("replacement")?.length, 64_000);
});
