"use client";

// FindIt's motion vocabulary — everything animated in this app should read
// these values rather than invent its own duration/easing/spring, so the
// whole product feels like one system instead of scattered effects. Kept
// deliberately narrow: a handful of durations, one easing curve for
// non-interactive motion, two spring presets for things that are.
//
// Tuned for "premium and understated" (Apple/Stripe/Linear), not playful —
// no bounce/overshoot on the defaults. transform/opacity only, so this
// stays cheap on low-end Android (see MotionConfig below for how reduced
// motion is handled globally rather than per-component).

import { useMotionValue, useTransform, animate, motion } from "motion/react";
import { useEffect, useRef } from "react";

export const DURATION = {
  instant: 0.12, // press/toggle feedback
  fast: 0.18, // small UI transitions (badges, chips)
  base: 0.28, // overlay/screen transitions, card entrances
  slow: 0.5, // the handful of deliberately memorable moments
};

// A controlled deceleration curve — starts quickly, settles smoothly, no
// overshoot. The one non-spring easing used throughout the app.
export const EASE = [0.22, 1, 0.36, 1];

// For things that are directly touched (press feedback, the cart badge
// bump) — snappy and quick to settle rather than bouncy.
export const SPRING_SNAPPY = { type: "spring", stiffness: 500, damping: 32, mass: 0.5 };
// For things that enter on their own (cards, sheets) — a touch softer.
export const SPRING_SOFT = { type: "spring", stiffness: 300, damping: 28 };

// A press state every tappable surface in the app can share — scales down
// very slightly on press, back on release. Deliberately subtle (0.97, not
// 0.9) so it reads as "responsive," not "bouncy." Spread onto any
// motion.* element: <motion.button {...press}>.
export const press = {
  whileTap: { scale: 0.97 },
  transition: SPRING_SNAPPY,
};

// Same idea for something that shouldn't visually compress (an icon-only
// circular button, where a scale change can read as a layout jump) —
// opacity only.
export const pressFade = {
  whileTap: { opacity: 0.6 },
  transition: { duration: DURATION.instant },
};

// A parent+child pair for "cards cascade in" entrances — mount-triggered,
// for a grid that's already on screen when its parent appears (not
// scroll-linked; see revealOnView below for content further down the page).
export const STAGGER_CONTAINER = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.055 } },
};
export const STAGGER_ITEM = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: DURATION.base, ease: EASE } },
};

// Spread onto anything below the fold that should reveal itself as the
// buyer scrolls to it rather than sit fully rendered off-screen — an
// IntersectionObserver under the hood (motion's default), not a scroll
// listener, so this is cheap even with several instances on one page.
// Plays once; scrolling back up and down again never replays it.
export const revealOnView = {
  initial: "hidden",
  whileInView: "visible",
  viewport: { once: true, margin: "-60px" },
  variants: STAGGER_ITEM,
};

// A number that animates from its previous value to a new one instead of
// just replacing the text — the cart badge, cart subtotal, order totals.
// Renders a MotionValue as children directly (a supported motion.* pattern:
// the DOM text node updates on the animation frame without a React
// re-render), so this is cheap even at 60fps.
export function AnimatedNumber({ value, format = (n) => String(Math.round(n)), duration = DURATION.base, className }) {
  const motionValue = useMotionValue(value);
  const display = useTransform(motionValue, (v) => format(v));
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      // No count-up on first paint — only when a value that was already
      // showing actually changes.
      first.current = false;
      motionValue.jump(value);
      return;
    }
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      motionValue.jump(value);
      return;
    }
    const controls = animate(motionValue, value, { duration, ease: EASE });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return <motion.span className={className}>{display}</motion.span>;
}
