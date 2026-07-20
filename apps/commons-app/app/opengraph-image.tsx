import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "Agent Commons — build, deploy, and orchestrate AI agents";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

// Local brand assets, inlined as data URIs so `next/og` can rasterize them.
async function loadAsset(publicPath: string, mime: string) {
  const buf = await readFile(join(process.cwd(), "public", publicPath));
  return `data:${mime};base64,${buf.toString("base64")}`;
}

export default async function Image() {
  const wordmark = await loadAsset("logo.jpg", "image/jpeg");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#ffffff",
          color: "#0f172a",
          padding: 80,
          fontFamily: "Arial, sans-serif",
        }}
      >
        {/* Agent Commons wordmark */}
        <div style={{ display: "flex" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={wordmark} height={224} alt="Agent Commons" />
        </div>

        {/* Tagline + supporting line */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            style={{
              maxWidth: 1010,
              fontSize: 60,
              lineHeight: 1.05,
              fontWeight: 700,
              letterSpacing: -1.5,
            }}
          >
            Build, deploy, and orchestrate teams of AI agents.
          </div>
          <div
            style={{
              display: "flex",
              gap: 16,
              fontSize: 27,
              color: "#475569",
            }}
          >
            <span>Agent computers</span>
            <span>·</span>
            <span>Workflows</span>
            <span>·</span>
            <span>Integrations</span>
            <span>·</span>
            <span>Every major model</span>
          </div>
        </div>

        {/* Brand-gradient accent bar */}
        <div
          style={{
            height: 12,
            width: 420,
            borderRadius: 999,
            background:
              "linear-gradient(90deg, #FDE68A 0%, #F9A8D4 30%, #D8B4FE 52%, #86EFAC 78%, #67E8F9 100%)",
          }}
        />
      </div>
    ),
    size
  );
}
