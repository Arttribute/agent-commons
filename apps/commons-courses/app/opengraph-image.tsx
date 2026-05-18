import { ImageResponse } from "next/og";

export const alt = "CommonLab";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function Image() {
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
          color: "#020617",
          padding: 72,
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 14,
              background: "#020617",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#B8F56D",
              fontSize: 34,
              fontWeight: 700,
            }}
          >
            C
          </div>
          <div style={{ fontSize: 34, fontWeight: 700 }}>CommonLab</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div
            style={{
              maxWidth: 900,
              fontSize: 76,
              lineHeight: 1,
              fontWeight: 700,
              letterSpacing: 0,
            }}
          >
            Practical AI courses for learning by building
          </div>
          <div
            style={{
              display: "flex",
              gap: 14,
              fontSize: 28,
              color: "#334155",
            }}
          >
            <span>Courses</span>
            <span>Guided labs</span>
            <span>Educator tools</span>
          </div>
        </div>
        <div style={{ height: 10, width: 320, background: "#B8F56D" }} />
      </div>
    ),
    size
  );
}
