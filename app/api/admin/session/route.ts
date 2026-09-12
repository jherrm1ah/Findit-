import { NextRequest, NextResponse } from "next/server";
import {
  adminUnlockMinutes,
  createSession,
  getSessionUser,
  isAdminSessionUnlocked,
  lockAdminSession,
  normalizePhone,
  sessionTokenFromRequest,
  setSessionCookie,
  unlockAdminSession,
  verifyLogin,
} from "@/lib/auth";
import { logAdminAction } from "@/lib/repo";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { errorResponse } from "@/lib/errors";

// Staff sign-in. Being logged in as an admin is not enough to reach an admin
// route (see lib/adminRoles.ts#requireAdmin) — the password is re-verified
// here and stamped on the session row, and that stamp ages out. This route
// is the one admin endpoint that deliberately does NOT call requireAdmin:
// it is what grants the unlock requireAdmin looks for.

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

// Mirrors the login route's second limiter: a per-(IP, phone) cap alone lets
// a distributed attempt get a fresh allowance from every new IP against the
// same admin account. This one caps the total guesses one admin account can
// absorb regardless of where they come from, and is tighter than the login
// route's equivalent because far fewer people legitimately sign in here.
const MAX_ATTEMPTS_PER_PHONE = 10;

// GET — does this session currently hold an admin unlock? The client asks on
// load so it knows whether to open the Admin Queue or the staff sign-in
// screen. Says nothing an ordinary caller couldn't already infer about
// themselves, and nothing at all about anyone else.
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ isAdmin: false, unlocked: false });
  }
  const isAdmin = user.role === "admin";
  return NextResponse.json({
    isAdmin,
    unlocked: isAdmin ? await isAdminSessionUnlocked(req) : false,
    windowMinutes: adminUnlockMinutes(),
  });
}

export async function POST(req: NextRequest) {
  let body: { phone?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.phone || !body.password) {
    return NextResponse.json({ error: "Enter your phone and password." }, { status: 400 });
  }

  const phone = normalizePhone(body.phone);
  const perSource = checkRateLimit(`admin-session:${getClientIp(req)}:${phone}`, MAX_ATTEMPTS, WINDOW_MS);
  const perAccount = checkRateLimit(`admin-session-phone:${phone}`, MAX_ATTEMPTS_PER_PHONE, WINDOW_MS);
  if (!perSource.allowed || !perAccount.allowed) {
    const retryAfterSeconds = Math.max(perSource.retryAfterSeconds, perAccount.retryAfterSeconds);
    return NextResponse.json(
      { error: "Too many attempts. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  try {
    const existing = await getSessionUser(req);
    const user = await verifyLogin(body.phone, body.password);

    // Identical response for a wrong password and an unknown phone —
    // verifyLogin already burns equivalent CPU on the unknown-account path so
    // the two can't be told apart by timing either.
    if (!user) {
      return NextResponse.json({ error: "Phone number or password is incorrect." }, { status: 401 });
    }
    if (user.suspended) {
      return NextResponse.json(
        { error: "This account has been suspended. Contact FindIt support." },
        { status: 403 }
      );
    }
    // Only reachable by someone who already proved this account's password,
    // so naming the reason tells them nothing they couldn't establish anyway.
    if (user.role !== "admin") {
      return NextResponse.json({ error: "This account doesn't have admin access." }, { status: 403 });
    }

    // Signing in as a DIFFERENT account while someone else's session is live
    // is refused rather than silently swapped: quietly replacing the session
    // would log the first person out of their own account with no warning,
    // on a shared device, which is exactly where that matters most.
    if (existing && existing.id !== user.id) {
      return NextResponse.json(
        { error: `You're signed in as ${existing.name}. Log out first, then sign in as staff.` },
        { status: 409 }
      );
    }

    // A staff sign-in with no session at all is a real login — it issues one.
    // With a session already in hand, the existing one is simply unlocked, so
    // the person keeps their place in the app.
    let token = sessionTokenFromRequest(req);
    let issuedSession = false;
    if (!existing || !token) {
      token = await createSession(user.id);
      issuedSession = true;
    }

    await unlockAdminSession(token);
    await logAdminAction({
      adminId: user.id,
      action: "admin_session_started",
      targetType: "session",
      targetId: user.id,
      detail: { issuedSession, windowMinutes: adminUnlockMinutes() },
    });

    const res = NextResponse.json({ user, unlocked: true, windowMinutes: adminUnlockMinutes() });
    if (issuedSession) setSessionCookie(res, token);
    return res;
  } catch (err) {
    return errorResponse(err, "Couldn't start your admin session.");
  }
}

// DELETE — leave admin mode. Clears only the unlock, never the session: the
// person stays logged in as themselves, the way stepping out of an admin area
// should behave. Safe to call when already locked.
export async function DELETE(req: NextRequest) {
  const token = sessionTokenFromRequest(req);
  if (!token) return NextResponse.json({ unlocked: false });

  try {
    const user = await getSessionUser(req);
    await lockAdminSession(token);
    if (user?.role === "admin") {
      await logAdminAction({
        adminId: user.id,
        action: "admin_session_ended",
        targetType: "session",
        targetId: user.id,
        detail: null,
      });
    }
    return NextResponse.json({ unlocked: false });
  } catch (err) {
    return errorResponse(err, "Couldn't end your admin session.");
  }
}
