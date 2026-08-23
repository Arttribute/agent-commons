import assert from "node:assert/strict";
import test from "node:test";

import {
  configuredTrustedAppOrigins,
  normalizedHttpOrigin,
} from "./trusted-app-origins.ts";

test("trusted origins cover production and staging configured app hosts", () => {
  const origins = configuredTrustedAppOrigins({
    AUTH_URL: "https://www.agentcommons.io/auth/callback",
    NEXTAUTH_URL: "https://staging.agentcommons.io/",
  });

  assert.equal(origins.has("https://www.agentcommons.io"), true);
  assert.equal(origins.has("https://staging.agentcommons.io"), true);
  assert.equal(origins.has("https://api.agentcommons.io"), false);
});

test("trusted origins cover both Vercel deployment and branch preview aliases", () => {
  const origins = configuredTrustedAppOrigins({
    VERCEL_PROJECT_PRODUCTION_URL: "agent-commons.vercel.app",
    VERCEL_BRANCH_URL: "agent-commons-git-feature-team.vercel.app",
    VERCEL_URL: "agent-commons-a1b2c3-team.vercel.app",
  });

  assert.deepEqual([...origins].sort(), [
    "https://agent-commons-a1b2c3-team.vercel.app",
    "https://agent-commons-git-feature-team.vercel.app",
    "https://agent-commons.vercel.app",
  ]);
});

test("custom origins remain explicit and invalid or credentialed URLs are ignored", () => {
  const origins = configuredTrustedAppOrigins({
    UI_PLUGIN_TRUSTED_APP_ORIGINS:
      "https://review.agentcommons.io, javascript:alert(1), https://user:secret@example.com",
  });

  assert.deepEqual([...origins], ["https://review.agentcommons.io"]);
  assert.equal(normalizedHttpOrigin("https://evil.example@trusted.test"), null);
});
