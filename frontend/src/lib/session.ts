/** Session token storage.
 * Inside Telegram: sessionStorage — survives reloads inside the WebView, cleared when Telegram
 * closes the Mini App (a fresh initData signs in again on the next open).
 * Elsewhere (Safari, the home-screen app): localStorage — the device stays signed in like an
 * ordinary app until it signs out or is signed out from «Профиль» → «Устройства».
 * Never put anything but the opaque session token here. */
import { isInsideTelegram } from "@/lib/telegram";

const KEY = "familyos.session";

function store(): Storage {
  return isInsideTelegram() ? sessionStorage : localStorage;
}

export function getToken(): string | null {
  try {
    return store().getItem(KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) store().setItem(KEY, token);
    else store().removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}
