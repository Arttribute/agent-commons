import assert from "node:assert/strict";
import test from "node:test";
import { BRAVE_SEARCH_BASE_URL, DEFAULT_LOCAL_WEB_SEARCH_URL, hasConfiguredLocalWebSearch } from "@agent-commons/desktop-contract";
import { localWebSearchRequest, localWebSearchResults } from "./local-web-search.ts";

test("Brave requires a key and sends it in the documented header, never the URL", () => {
  assert.equal(hasConfiguredLocalWebSearch({ webSearchUrl: BRAVE_SEARCH_BASE_URL }), false);
  const settings = { webSearchUrl: BRAVE_SEARCH_BASE_URL, webSearchApiKey: "test-secret" };
  assert.equal(hasConfiguredLocalWebSearch(settings), true);
  const request = localWebSearchRequest(settings, "mango evidence");
  assert.equal(request.url.toString(), "https://api.search.brave.com/res/v1/web/search?q=mango+evidence&count=5");
  assert.equal(request.headers["X-Subscription-Token"], "test-secret");
  assert.ok(!request.url.toString().includes("test-secret"));
  assert.deepEqual(localWebSearchResults({ web: { results: [{ title: "Mango", url: "https://example.org", description: "Research finding" }] } }, true), [
    { title: "Mango", url: "https://example.org", snippet: "Research finding" },
  ]);
});

test("SearXNG keeps a configured path and uses its JSON result shape", () => {
  const request = localWebSearchRequest({ webSearchUrl: "http://127.0.0.1:8585/searx" }, "mango evidence");
  assert.equal(request.url.toString(), "http://127.0.0.1:8585/searx/search?q=mango+evidence&format=json");
  assert.deepEqual(localWebSearchResults({ results: [{ title: "Mango", url: "https://example.org", content: "Research finding" }] }, false), [
    { title: "Mango", url: "https://example.org", snippet: "Research finding" },
  ]);
});


test("a fresh Local workspace can search without a key and never sends a custom key to the managed default", () => {
  assert.equal(hasConfiguredLocalWebSearch({}), true);
  const request = localWebSearchRequest({ webSearchApiKey: 'old-provider-secret' }, 'pandas documentation');
  assert.equal(request.url.origin, new URL(DEFAULT_LOCAL_WEB_SEARCH_URL).origin);
  assert.equal(request.url.pathname, '/v1/desktop-search/search');
  assert.equal(request.url.searchParams.get('q'), 'pandas documentation');
  assert.deepEqual(request.headers, { Accept: 'application/json' });
});
