import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Apple's home-screen icon needs a raster format (SVG isn't reliably
// honored for apple-touch-icon), so this mirrors the same gradient
// square + magnifying-glass mark as app/icon.svg and components/
// findit-app/shared.jsx's <Logo>, rendered with Next's built-in
// Satori-based ImageResponse — no extra image library needed.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background: "linear-gradient(135deg, #A855F7 0%, #7C3AED 45%, #4C1D95 100%)",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 52,
            top: 52,
            width: 62,
            height: 62,
            borderRadius: "50%",
            border: "13px solid #ffffff",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 108,
            top: 108,
            width: 16,
            height: 44,
            background: "#ffffff",
            borderRadius: 8,
            transform: "rotate(45deg)",
            display: "flex",
          }}
        />
      </div>
    ),
    { ...size }
  );
}
