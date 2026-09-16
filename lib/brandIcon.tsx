import { ImageResponse } from "next/og";

// Draws the same gradient-square + magnifying-glass mark as app/icon.svg,
// app/apple-icon.tsx, and components/findit-app/shared.jsx's <Logo> — one
// place, parameterized by size, instead of duplicating hand-scaled numbers
// across every icon file Next.js's route conventions need. `padded` shrinks
// the mark itself and centers it, leaving safe-area margin around the edges
// so Android's maskable-icon system can crop it into a circle/squircle
// without cutting the glass off.
export function renderBrandIcon(size: number, options: { padded?: boolean } = {}) {
  const scale = options.padded ? 0.7 : 1;
  const inner = size * scale;
  const offset = (size - inner) / 2;
  const circleSize = inner * (62 / 180);
  const circleLeft = offset + inner * (52 / 180);
  const circleTop = offset + inner * (52 / 180);
  const borderWidth = inner * (13 / 180);
  const lineWidth = inner * (16 / 180);
  const lineHeight = inner * (44 / 180);
  const lineLeft = offset + inner * (108 / 180);
  const lineTop = offset + inner * (108 / 180);
  const lineRadius = inner * (8 / 180);

  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          display: "flex",
          position: "relative",
          background: options.padded
            ? "#7C3AED"
            : "linear-gradient(135deg, #A855F7 0%, #7C3AED 45%, #4C1D95 100%)",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: circleLeft,
            top: circleTop,
            width: circleSize,
            height: circleSize,
            borderRadius: "50%",
            border: `${borderWidth}px solid #ffffff`,
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: lineLeft,
            top: lineTop,
            width: lineWidth,
            height: lineHeight,
            background: "#ffffff",
            borderRadius: lineRadius,
            transform: "rotate(45deg)",
            display: "flex",
          }}
        />
      </div>
    ),
    { width: size, height: size }
  );
}
