"use client";

// The welcome screen's logo and illustration, drawn in code (SVG): no image files, sharp at any
// size, a few KB. Soft gradients and shadows give the "3D" look of FindIt's artwork.

// "FindIt" with a location pin standing on the "I". Real text, so it's crisp and readable.
export function FindItLogo({ className = "" }) {
  return (
    <div className={`relative inline-flex items-end font-bold leading-none tracking-[-0.03em] ${className}`} aria-label="FindIt" role="img">
      <span style={{ color: "#1E1265" }}>Find</span>
      <span className="relative" style={{ color: "#6D34FF" }}>
        {/* The pin sits on top of the "I". */}
        <svg viewBox="0 0 24 32" aria-hidden className="absolute left-[0.02em] top-[-0.52em] h-[0.62em] w-auto">
          <path d="M12 1C6 1 1.5 5.4 1.5 11.2 1.5 18.6 12 30 12 30s10.5-11.4 10.5-18.8C22.5 5.4 18 1 12 1z" fill="#6D34FF" />
          <circle cx="12" cy="11" r="4.2" fill="#F9F8FE" />
        </svg>
        It
      </span>
    </div>
  );
}

const P = { light: "#9B7BFF", mid: "#7C4DFF", deep: "#5B21F5", dark: "#3F12B8" };

// Bag, shoe, a big white tile with a pin, headphones, phone, cart tile and a sale tag.
export function WelcomeIllustration({ className = "" }) {
  return (
    <svg viewBox="0 0 400 290" className={className} aria-hidden role="presentation">
      <defs>
        <linearGradient id="wa-purple" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={P.light} />
          <stop offset="1" stopColor={P.deep} />
        </linearGradient>
        <linearGradient id="wa-purple-side" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={P.deep} />
          <stop offset="1" stopColor={P.dark} />
        </linearGradient>
        <linearGradient id="wa-white" x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#ECE8F8" />
        </linearGradient>
        <radialGradient id="wa-floor" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#5B21F5" stopOpacity="0.18" />
          <stop offset="1" stopColor="#5B21F5" stopOpacity="0" />
        </radialGradient>
        <filter id="wa-shadow" x="-30%" y="-30%" width="160%" height="170%">
          <feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#3F12B8" floodOpacity="0.22" />
        </filter>
        <filter id="wa-soft" x="-30%" y="-30%" width="160%" height="170%">
          <feDropShadow dx="0" dy="5" stdDeviation="5" floodColor="#3F12B8" floodOpacity="0.18" />
        </filter>
      </defs>

      {/* Soft floor shadow */}
      <ellipse cx="200" cy="262" rx="185" ry="22" fill="url(#wa-floor)" />

      {/* Shopping bag (back left) */}
      <g filter="url(#wa-soft)">
        <path d="M66 92 a26 30 0 0 1 52 0" fill="none" stroke={P.mid} strokeWidth="9" strokeLinecap="round" />
        <path d="M38 98 h96 l10 8 v130 h-106 z" fill="url(#wa-purple-side)" />
        <rect x="30" y="98" width="100" height="140" rx="8" fill="url(#wa-purple)" />
        <circle cx="66" cy="112" r="4" fill={P.dark} opacity="0.5" />
        <circle cx="118" cy="112" r="4" fill={P.dark} opacity="0.5" />
      </g>

      {/* Sneaker (front left) */}
      <g filter="url(#wa-soft)">
        <path d="M22 236 c0-14 10-22 26-24 l26-4 c8-12 20-20 34-20 l14 2 c6 8 8 20 10 34 l8 6 c4 4 4 10 0 12 H34 c-8 0-12-2-12-6z" fill="#FFFFFF" />
        <path d="M22 236 c0 6 4 10 12 10 h100 c4-2 4-8 0-12 l-6-4 c-2 6-8 8-14 8 H40 c-8 0-14-1-18-2z" fill="url(#wa-purple)" />
        <path d="M76 208 c10-12 22-18 34-18 l10 2 c4 6 6 14 7 24 c-14 4-30 4-44 0z" fill="url(#wa-purple)" opacity="0.9" />
        <g stroke={P.light} strokeWidth="3" strokeLinecap="round" opacity="0.9">
          <path d="M70 214 l12-6" />
          <path d="M76 220 l12-6" />
          <path d="M82 226 l12-6" />
        </g>
      </g>

      {/* Sparkle lines above the tile */}
      <g stroke={P.mid} strokeWidth="7" strokeLinecap="round">
        <path d="M200 22 v20" />
        <path d="M168 34 l9 14" />
        <path d="M232 34 l-9 14" />
      </g>

      {/* Big white tile with the pin (centre) */}
      <g filter="url(#wa-shadow)">
        <rect x="128" y="66" width="144" height="166" rx="38" fill="#E6E1F5" />
        <rect x="128" y="60" width="144" height="164" rx="38" fill="url(#wa-white)" />
      </g>
      <g filter="url(#wa-soft)">
        <path d="M200 92 c-22 0-38 16-38 37 c0 27 38 66 38 66 s38-39 38-66 c0-21-16-37-38-37z" fill="url(#wa-purple)" />
        <circle cx="200" cy="128" r="13" fill="#FFFFFF" />
      </g>

      {/* Headphones (behind, right of the tile) */}
      <g filter="url(#wa-soft)">
        <path d="M262 112 a42 42 0 0 1 84 0" fill="none" stroke="#E9E5F6" strokeWidth="12" strokeLinecap="round" />
        <rect x="250" y="112" width="30" height="46" rx="15" fill={P.deep} />
        <rect x="258" y="114" width="26" height="42" rx="13" fill="#F4F2FB" />
      </g>

      {/* Phone (right) */}
      <g filter="url(#wa-soft)" transform="rotate(12 340 170)">
        <rect x="312" y="104" width="62" height="122" rx="14" fill="url(#wa-purple-side)" />
        <rect x="306" y="100" width="62" height="122" rx="14" fill="url(#wa-purple)" />
        <rect x="316" y="110" width="22" height="30" rx="7" fill={P.dark} opacity="0.35" />
        <circle cx="323" cy="118" r="4.5" fill="#22104F" />
        <circle cx="323" cy="132" r="4.5" fill="#22104F" />
      </g>

      {/* Cart tile (front right) */}
      <g filter="url(#wa-shadow)">
        <rect x="262" y="176" width="78" height="80" rx="14" fill="url(#wa-purple-side)" />
        <rect x="258" y="172" width="78" height="80" rx="14" fill="url(#wa-purple)" />
        <g fill="none" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M272 192 h8 l8 32 h30 l6-22 h-40" />
          <path d="M292 202 v18 M302 202 v18 M312 202 v18" strokeWidth="3.5" />
        </g>
        <circle cx="292" cy="234" r="4.5" fill="#FFFFFF" />
        <circle cx="314" cy="234" r="4.5" fill="#FFFFFF" />
      </g>

      {/* Sale tag (top right) */}
      <g filter="url(#wa-soft)" transform="rotate(-24 330 44)">
        <path d="M300 30 h44 l14 14 l-14 14 h-44 a6 6 0 0 1-6-6 v-16 a6 6 0 0 1 6-6z" fill="url(#wa-purple)" />
        <circle cx="347" cy="44" r="3.5" fill="#FFFFFF" />
        <path d="M352 44 c10-4 14-14 12-24" fill="none" stroke="#DCD5F2" strokeWidth="2.5" strokeLinecap="round" />
        <g fill="#FFFFFF">
          <circle cx="313" cy="38" r="3.4" />
          <circle cx="327" cy="50" r="3.4" />
          <path d="M309 52 l22-16" stroke="#FFFFFF" strokeWidth="3.4" strokeLinecap="round" />
        </g>
      </g>
    </svg>
  );
}
