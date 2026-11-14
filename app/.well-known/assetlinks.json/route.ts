import { NextResponse } from "next/server";

// Android App Links: tells Android that the FindIt app may open shopwithfindit.com links.
// ANDROID_APP_CERT_SHA256 (Vercel environment variable) holds the app's signing certificate
// fingerprint(s), comma separated, as shown in Play Console → Setup → App signing
// ("SHA-256 certificate fingerprint", AA:BB:...). Never the public debug key: anyone could sign an
// app with that and take over FindIt's links. With nothing set this returns an empty list, so
// links simply keep opening in the browser.
export const dynamic = "force-dynamic";

const PACKAGE = "com.shopwithfindit.app";
const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

export function GET() {
  const fingerprints = (process.env.ANDROID_APP_CERT_SHA256 ?? "")
    .split(",")
    .map((f) => f.trim().toUpperCase())
    .filter((f) => FINGERPRINT.test(f));
  const body = fingerprints.length
    ? [
        {
          relation: ["delegate_permission/common.handle_all_urls"],
          target: { namespace: "android_app", package_name: PACKAGE, sha256_cert_fingerprints: fingerprints },
        },
      ]
    : [];
  return NextResponse.json(body, { headers: { "Cache-Control": "public, max-age=3600" } });
}
