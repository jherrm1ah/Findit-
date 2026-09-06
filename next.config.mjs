// Content-Security-Policy tuned to what this app actually loads:
// - Next.js App Router's own hydration payload is inlined as a <script>
//   tag with no nonce support wired up here, so script-src needs
//   'unsafe-inline'; it's still restricted to 'self' otherwise, which is
//   the part that actually matters — no attacker-controlled external
//   script host can be loaded even with an XSS injection point.
// - style-src needs 'unsafe-inline' because the UI uses React inline
//   `style={{...}}` throughout, plus Google Fonts' stylesheet.
// - connect-src is 'self' only: the browser never talks to Supabase or
//   Gemini directly — both are server-side only (see lib/db.ts, lib/ai.ts)
//   — so there's nothing else for the client to legitimately fetch.
// - img-src allows Supabase's own domain for product photos
//   (lib/storage.ts), plus data: for any inline/generated images.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: https://*.supabase.co",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Stop advertising the framework in responses — not a vulnerability on
  // its own, but free to remove and it's one less thing telling an
  // attacker what to target.
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
          // Clickjacking protection — frame-ancestors above is the modern
          // version of this; kept together for browsers that only honor one.
          { key: "X-Frame-Options", value: "DENY" },
          // Stops a browser from guessing a response's content-type from
          // its bytes instead of the real Content-Type header (relevant to
          // anything user-uploaded that ends up served back).
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Don't leak the full referring URL (which can contain ids/paths)
          // to third-party sites a user navigates to from FindIt.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Locks down powerful browser APIs by default; geolocation stays
          // available to this origin since the app's location feature
          // depends on it (see components/findit-app/location.js).
          {
            key: "Permissions-Policy",
            value: "geolocation=(self), camera=(), microphone=(), payment=()",
          },
          // Vercel already sets HSTS on production deployments; this is
          // defense-in-depth for any other host this ever gets deployed to.
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
