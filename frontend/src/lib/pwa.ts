/**
 * Family OS as an app on the home screen (PWA): install hints and Web Push.
 * Push works only in the installed app on iPhone (iOS 16.4+) and in desktop/Android browsers;
 * never inside Telegram, where the bot delivers notifications.
 */
import { api } from "@/api/client";
import { isInsideTelegram } from "@/lib/telegram";

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia?.("(display-mode: standalone)").matches === true;
}

export function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

/** The page could receive push notifications in this environment. */
export function pushSupported(): boolean {
  return !isInsideTelegram() && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** iPhone Safari tab: push needs the app installed on the home screen first. */
export function needsInstallForPush(): boolean {
  return isIos() && !isStandalone();
}

export function registerServiceWorker(): void {
  if (isInsideTelegram() || !("serviceWorker" in navigator) || !import.meta.env.PROD) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}

function keyBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (b64url.length % 4)) % 4);
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;
  await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return (await reg?.pushManager.getSubscription()) ?? null;
}

function sameKey(sub: PushSubscription, key: Uint8Array): boolean {
  const current = sub.options?.applicationServerKey;
  if (!current) return true;
  const a = new Uint8Array(current);
  return a.length === key.length && a.every((v, i) => v === key[i]);
}

/** Asks for permission (must run from a tap), subscribes and registers this device. */
export async function enablePush(): Promise<NotificationPermission> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission;
  const { public_key } = await api<{ public_key: string }>("/push/key");
  const key = keyBytes(public_key);
  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub, key)) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  await api("/push/subscriptions", { body: sub.toJSON() });
  return permission;
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await api("/push/subscriptions", { method: "DELETE", body: { endpoint: sub.endpoint } }).catch(() => undefined);
  await sub.unsubscribe();
}

/** Re-sends the existing subscription after sign-in (the server ties it to the session). */
export async function resyncPush(): Promise<void> {
  if (!pushSupported() || Notification.permission !== "granted") return;
  try {
    const sub = await currentSubscription();
    if (sub) await api("/push/subscriptions", { body: sub.toJSON() });
  } catch {
    /* next open retries */
  }
}
