/** Session token storage. sessionStorage: survives reloads inside the WebView, not shared
 * across tabs, cleared when Telegram closes the Mini App. Never put secrets here. */
const KEY = "familyos.session";

export function getToken(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) sessionStorage.setItem(KEY, token);
    else sessionStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}
