// src/lib/push.js — Web Push subscribe/unsubscribe helpers (Phase 2b).
// Nothing here SENDS a push yet (that's Phase 2c, server-side) — this is
// purely the plumbing that lets a device register to receive one later.
import { api } from "./api";

// PushManager.subscribe() needs the VAPID public key as a raw Uint8Array,
// but env vars only give us base64url text — this is the standard
// conversion (documented in every Web Push guide, not something with a
// library shortcut worth adding a dependency for).
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export function pushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function pushPermission() {
  if (!pushSupported()) return "unsupported";
  return Notification.permission; // "default" | "granted" | "denied"
}

// Returns the browser's existing subscription for this device, if any —
// used to show the toggle's correct initial state without re-prompting.
export async function getExistingSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

// Requests permission (triggers the browser's native prompt if not yet
// decided), subscribes this device, and saves the subscription against
// the given staff member. Throws with a clear message on any failure
// point so the UI can show something useful rather than a silent no-op.
export async function subscribeToPush(staffName) {
  if (!pushSupported()) throw new Error("Push notifications aren't supported on this browser/device.");
  const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!publicKey) throw new Error("Push isn't configured yet — missing VAPID public key.");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notification permission was not granted.");

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  const json = sub.toJSON();
  await api.savePushSubscription({
    staffName, endpoint: json.endpoint, keys: json.keys,
    userAgent: navigator.userAgent,
  });
  return sub;
}

// Unsubscribes this device from the browser's push manager AND removes
// the stored row server-side — both matter, since leaving either behind
// causes a mismatch (a stored subscription the browser no longer honors,
// or a live browser subscription no server row will ever target).
export async function unsubscribeFromPush() {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  await api.deletePushSubscription({ endpoint }).catch(() => {});
}
