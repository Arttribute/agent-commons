import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Prerendered to a static PNG at build time (no runtime filesystem access),
// and referenced explicitly from metadata so the social-embed image URL always
// resolves against `metadataBase` (the canonical domain) rather than the
// per-deployment *.vercel.app URL.
export const dynamic = "force-static";

const size = { width: 1200, height: 630 };

async function loadAsset(publicPath: string, mime: string) {
  const buf = await readFile(join(process.cwd(), "public", publicPath));
  return `data:${mime};base64,${buf.toString("base64")}`;
}

export async function GET() {
  const lockup = await loadAsset("og-lockup.png", "image/png");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 44,
          background: "#ffffff",
          padding: 80,
          fontFamily: "Arial, sans-serif",
        }}
      >
        {/* Mascot + Agent Commons wordmark lockup */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={lockup} width={900} alt="Agent Commons" />

        {/* One quiet line — the rest of the story lives in the embed description */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 22,
          }}
        >
          <div style={{ fontSize: 30, color: "#64748b", letterSpacing: 0.2 }}>
            Build, deploy &amp; orchestrate teams of AI agents
          </div>
          {/* Brand-gradient accent bar */}
          <div
            style={{
              height: 10,
              width: 300,
              borderRadius: 999,
              background:
                "linear-gradient(90deg, #FDE68A 0%, #F9A8D4 30%, #D8B4FE 52%, #86EFAC 78%, #67E8F9 100%)",
            }}
          />
        </div>
      </div>
    ),
    size
  );
}
