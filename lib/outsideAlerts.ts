import crypto from "crypto";
import webpush from "web-push";
import { getDb, assertNoError } from "./db";
import { isSmsConfigured, sendSms, type SmsChannel } from "./sms";

// Reaching people OUTSIDE the app. Every FindIt notification is saved in the
// app (lib/repo.ts#createNotification); this adds:
//
// - Push: a phone/desktop notification for every alert, even with FindIt
//   closed, on devices where the person tapped "Turn on alerts" (Android
//   Chrome, desktop browsers, and iPhones once FindIt is added to the home
//   screen). Free. Off until VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are set.
// - Text (SMS, or WhatsApp): only for the few alerts about money that
//   someone must act on (a seller's new paid order, a buyer's order
//   dispatched or refunded, a payout sent). Uses the same Termii account as
//   login codes; costs a little per message, so it's kept to those. Channel:
//   TERMII_ALERT_CHANNEL = "dnd" (default, transactional SMS) | "generic" |
//   "whatsapp" (needs a WhatsApp sender approved on Termii).
//
// Server-only. Both are best-effort: an alert that can't be delivered never
// fails the action that caused it.

type Row = Record<string, unknown>;

const PUSH_TIMEOUT_MS = 5000;
let vapidReady: boolean | null = null;

export function pushPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

function pushConfigured(): boolean {
  if (vapidReady !== null) return vapidReady;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return (vapidReady = false);
  try {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "https://www.shopwithfindit.com", pub, priv);
    vapidReady = true;
  } catch (err) {
    console.error("[push] VAPID keys are invalid", err);
    vapidReady = false;
  }
  return vapidReady;
}

export type PushSubscriptionInput = { endpoint: string; keys: { p256dh: string; auth: string } };

export function isValidPushSubscription(s: unknown): s is PushSubscriptionInput {
  const v = s as PushSubscriptionInput;
  return Boolean(
    v &&
      typeof v.endpoint === "string" &&
      /^https:\/\//.test(v.endpoint) &&
      v.endpoint.length < 1000 &&
      typeof v.keys?.p256dh === "string" &&
      typeof v.keys?.auth === "string" &&
      v.keys.p256dh.length < 200 &&
      v.keys.auth.length < 100
  );
}

// This browser now gets this user's alerts. One row per browser (endpoint):
// signing in as someone else on the same phone moves it to them.
export async function savePushSubscription(userId: string, sub: PushSubscriptionInput): Promise<void> {
  const db = getDb();
  const existing = assertNoError(
    await db.from("push_subscriptions").select("id").eq("endpoint", sub.endpoint).maybeSingle(),
    "looking up push subscription"
  ) as Row | null;
  if (existing) {
    assertNoError(
      await db
        .from("push_subscriptions")
        .update({ user_id: userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth })
        .eq("id", existing.id as string),
      "updating push subscription"
    );
    return;
  }
  assertNoError(
    await db.from("push_subscriptions").insert({
      id: "push_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      user_id: userId,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
    }),
    "saving push subscription"
  );
}

// Stop alerts to this browser (signing out, or turning alerts off). Only the
// signed-in owner's own subscription.
export async function removePushSubscription(userId: string, endpoint: string): Promise<void> {
  const db = getDb();
  assertNoError(
    await db.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", userId),
    "removing push subscription"
  );
}

// ---- The Android app (Firebase Cloud Messaging) ---------------------------------------------
// On when FCM_SERVICE_ACCOUNT (Vercel env) holds the Firebase service-account JSON (Firebase →
// Project settings → Service accounts → Generate new private key). The app only registers a
// device when its build includes google-services.json (see .github/workflows/android.yml).

type ServiceAccount = { project_id: string; client_email: string; private_key: string };
let serviceAccount: ServiceAccount | null | undefined;
function fcmAccount(): ServiceAccount | null {
  if (serviceAccount !== undefined) return serviceAccount;
  try {
    const raw = process.env.FCM_SERVICE_ACCOUNT;
    const sa = raw ? (JSON.parse(raw) as ServiceAccount) : null;
    serviceAccount = sa?.project_id && sa.client_email && sa.private_key ? sa : null;
  } catch {
    console.error("[push] FCM_SERVICE_ACCOUNT isn't valid JSON");
    serviceAccount = null;
  }
  return serviceAccount;
}
export function appPushConfigured(): boolean {
  return fcmAccount() !== null;
}

let fcmToken: { value: string; exp: number } | null = null;
async function fcmAccessToken(sa: ServiceAccount): Promise<string> {
  if (fcmToken && fcmToken.exp > Date.now() + 60_000) return fcmToken.value;
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = crypto.createSign("RSA-SHA256").update(unsigned).sign(sa.private_key, "base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
  });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !j.access_token) throw new Error(`FCM auth failed: ${res.status} ${j.error ?? ""}`);
  fcmToken = { value: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return fcmToken.value;
}

// Firebase device tokens are long base64-ish strings.
export function isValidDeviceToken(t: unknown): t is string {
  return typeof t === "string" && /^[A-Za-z0-9_:\-]{20,4096}$/.test(t);
}

// This phone's FindIt app now gets this user's alerts (one row per device token).
export async function saveDeviceToken(userId: string, token: string): Promise<void> {
  const db = getDb();
  const existing = assertNoError(
    await db.from("push_subscriptions").select("id").eq("endpoint", token).maybeSingle(),
    "looking up app device"
  ) as Row | null;
  if (existing) {
    assertNoError(await db.from("push_subscriptions").update({ user_id: userId, kind: "fcm" }).eq("id", existing.id as string), "updating app device");
    return;
  }
  assertNoError(
    await db.from("push_subscriptions").insert({
      id: "push_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      user_id: userId,
      endpoint: token,
      p256dh: "",
      auth: "",
      kind: "fcm",
    }),
    "saving app device"
  );
}

async function sendFcm(sa: ServiceAccount, token: string, payload: { title: string; body: string; tag?: string; url?: string }): Promise<"sent" | "gone" | "failed"> {
  const access = await fcmAccessToken(sa);
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        token,
        notification: { title: payload.title, body: payload.body },
        data: { url: payload.url ?? "/", tag: payload.tag ?? "" },
        android: {
          priority: "HIGH",
          ttl: "86400s",
          notification: { channel_id: "findit_alerts", icon: "ic_stat_findit", color: "#6002CF", ...(payload.tag ? { tag: payload.tag } : {}) },
        },
      },
    }),
  });
  if (res.ok) return "sent";
  const err = (await res.json().catch(() => ({}))) as { error?: { status?: string } };
  // The app was uninstalled or the token expired.
  if (res.status === 404 || err.error?.status === "NOT_FOUND" || err.error?.status === "UNREGISTERED") return "gone";
  console.error("[push] FCM send failed", res.status, err.error?.status);
  return "failed";
}

export async function sendPushToUser(userId: string, payload: { title: string; body: string; tag?: string; url?: string }): Promise<void> {
  const webOn = pushConfigured();
  const sa = fcmAccount();
  if (!webOn && !sa) return;
  try {
    const db = getDb();
    const all = assertNoError(
      await db.from("push_subscriptions").select("id, endpoint, p256dh, auth, kind").eq("user_id", userId),
      "loading push subscriptions"
    ) as Row[];
    const apps = sa ? all.filter((s) => s.kind === "fcm") : [];
    const subs = webOn ? all.filter((s) => s.kind !== "fcm") : [];
    await Promise.allSettled(
      apps.map(async (s) => {
        try {
          if ((await sendFcm(sa as ServiceAccount, s.endpoint as string, payload)) === "gone") {
            await db.from("push_subscriptions").delete().eq("id", s.id as string);
          }
        } catch (err) {
          console.error("[push] app alert failed", err);
        }
      })
    );
    const message = JSON.stringify({ title: payload.title, body: payload.body, tag: payload.tag, url: payload.url ?? "/" });
    await Promise.allSettled(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint as string, keys: { p256dh: s.p256dh as string, auth: s.auth as string } },
            message,
            { TTL: 24 * 60 * 60, timeout: PUSH_TIMEOUT_MS, urgency: "high" }
          );
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          // The browser unsubscribed or the app was uninstalled: forget it.
          if (status === 404 || status === 410) {
            await db.from("push_subscriptions").delete().eq("id", s.id as string);
          } else {
            console.error("[push] send failed", status ?? err);
          }
        }
      })
    );
  } catch (err) {
    console.error("[push] couldn't send alerts", err);
  }
}

function alertChannel(): SmsChannel {
  const c = process.env.TERMII_ALERT_CHANNEL;
  return c === "generic" || c === "whatsapp" ? c : "dnd";
}

// A text to the user's phone number, for money alerts only (see above).
export async function sendTextAlert(userId: string, message: string): Promise<void> {
  if (!isSmsConfigured()) return;
  try {
    const db = getDb();
    const user = assertNoError(
      await db.from("users").select("phone").eq("id", userId).maybeSingle(),
      "loading phone for text alert"
    ) as Row | null;
    const phone = user?.phone as string | undefined;
    if (!phone) return;
    await sendSms(phone, message.length > 300 ? message.slice(0, 297) + "..." : message, alertChannel());
  } catch (err) {
    console.error("[sms] couldn't send text alert", err);
  }
}
