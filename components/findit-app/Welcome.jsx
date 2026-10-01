"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { motion } from "motion/react";
import { DURATION, EASE } from "./motion";

// welcome-get-started.png's own pixel dimensions — fixed, not measured, since
// this is one specific static asset.
const IMG_W = 852;
const IMG_H = 1846;

// The two buttons baked into the artwork, as pixel rects WITHIN THE SOURCE
// IMAGE (not the viewport). object-fit: contain never crops the image —
// unlike object-cover, which on a viewport whose aspect ratio differs from
// the image's own (852:1846) would crop part of it away, most dangerously
// the bottom edge where these buttons are drawn, leaving them invisible
// and/or unreachable on a short/wide screen (confirmed: both buttons land
// off-screen or over the wrong text at 414x600). Because contain instead
// letterboxes, the buttons' real on-screen rect has to be computed from
// the image's actual rendered box, not assumed to equal the container's —
// see useContainedImageRect below.
const GET_STARTED_RECT = { x: 85, y: 1458, w: 682, h: 120 };
const HAVE_ACCOUNT_RECT = { x: 85, y: 1597, w: 682, h: 120 };

// The rect (in viewport pixels) that an `object-fit: contain` image
// actually occupies inside `el` — the same box-fitting math the CSS
// property itself runs, duplicated here so a real DOM button can be
// positioned against it (CSS alone can't query where object-fit put the
// image). Re-measured on resize/orientation change via ResizeObserver.
function useContainedImageRect(containerRef) {
  const [rect, setRect] = useState(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const compute = () => {
      const { width: cw, height: ch } = el.getBoundingClientRect();
      if (!cw || !ch) return;
      const containerRatio = cw / ch;
      const imageRatio = IMG_W / IMG_H;
      const width = containerRatio > imageRatio ? ch * imageRatio : cw;
      const height = containerRatio > imageRatio ? ch : cw / imageRatio;
      setRect({ width, height, left: (cw - width) / 2, top: (ch - height) / 2 });
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);
  return rect;
}

function HitTarget({ containerRect, source, onClick, label }) {
  if (!containerRect) return null;
  const scale = containerRect.width / IMG_W;
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="absolute"
      style={{
        left: containerRect.left + source.x * scale,
        top: containerRect.top + source.y * scale,
        width: source.w * scale,
        height: source.h * scale,
      }}
    />
  );
}

export default function Welcome({ onGetStarted, onHaveAccount }) {
  const containerRef = useRef(null);
  const rect = useContainedImageRect(containerRef);

  return (
    <motion.div
      ref={containerRef}
      exit={{ opacity: 0 }}
      transition={{ duration: DURATION.base, ease: EASE }}
      className="fixed inset-0 z-50"
      style={{ background: "#FAFAFF" }}
    >
      <Image src="/welcome-get-started.png" alt="Let's get you started" fill priority sizes="100vw" className="object-contain" />
      <HitTarget containerRect={rect} source={GET_STARTED_RECT} onClick={onGetStarted} label="Get Started" />
      <HitTarget containerRect={rect} source={HAVE_ACCOUNT_RECT} onClick={onHaveAccount} label="I already have an account" />
    </motion.div>
  );
}
