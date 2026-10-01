import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Next.js's file-convention OG image for the root route (`/`) — picked up
// automatically for every link to the bare FindIt homepage (the one real,
// server-rendered, generic marketing surface) without any metadata.openGraph
// wiring needed. app/store/[slug] already builds its own per-seller image
// from the seller's branding; this is the generic fallback for everywhere
// else. Same gradient brand mark as app/apple-icon.tsx/lib/brandIcon.tsx,
// laid out as a real share card instead of just a square icon.
export default function OpengraphImage() {
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
          background: "linear-gradient(135deg, #A855F7 0%, #7C3AED 45%, #4C1D95 100%)",
        }}
      >
        <div
          style={{
            width: 140,
            height: 140,
            display: "flex",
            position: "relative",
            borderRadius: 32,
            background: "rgba(255,255,255,0.14)",
            marginBottom: 40,
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 40,
              top: 40,
              width: 48,
              height: 48,
              borderRadius: "50%",
              border: "10px solid #ffffff",
              display: "flex",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 84,
              top: 84,
              width: 13,
              height: 34,
              background: "#ffffff",
              borderRadius: 6,
              transform: "rotate(45deg)",
              display: "flex",
            }}
          />
        </div>
        <div style={{ display: "flex", color: "#ffffff", fontSize: 76, fontWeight: 700 }}>FindIt</div>
        <div style={{ display: "flex", color: "rgba(255,255,255,0.85)", fontSize: 30, marginTop: 16 }}>
          Request it. Find it. Trust it.
        </div>
      </div>
    ),
    { ...size }
  );
}
