import { getToken, setToken } from "@/lib/session";

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type Listener = () => void;
const unauthorizedListeners = new Set<Listener>();

export function onUnauthorized(cb: Listener): () => void {
  unauthorizedListeners.add(cb);
  return () => unauthorizedListeners.delete(cb);
}

export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  form?: FormData;
  query?: Record<string, string | number | boolean | null | undefined>;
  idempotencyKey?: string;
  signal?: AbortSignal;
}

/**
 * Origin of the FastAPI backend, fixed at build time (Vite inlines VITE_* variables).
 * Empty = same origin: the Mini App is served by Caddy next to the API (compose.yaml) or the
 * Vite dev proxy. When the frontend is hosted separately (e.g. Cloudflare Pages), set
 * VITE_API_URL=https://api.example.com in the build environment.
 *
 * `required` is true for builds on a static host (see `__API_URL_REQUIRED__` in vite.config.ts):
 * there is no backend on the site's own origin, so a missing address is a configuration error,
 * not a reason to send API requests to the static host.
 */
export function normalizeApiBase(raw: string | undefined, opts: { required?: boolean } = {}): string {
  const value = (raw ?? "").trim().replace(/\/+$/, "");
  if (!value) {
    if (opts.required) throw new ApiConfigError(API_NOT_CONFIGURED, API_NOT_CONFIGURED_MESSAGE);
    return "";
  }
  if (!/^https?:\/\/[^/\s]+$/i.test(value)) {
    // Only a bare origin is valid; anything else would silently produce wrong URLs.
    throw new ApiConfigError(CONFIG_ERROR_CODE, `VITE_API_URL должен быть адресом вида https://api.example.com, получено: ${value}`);
  }
  if (/\.pages\.dev$/i.test(new URL(value).hostname)) {
    // Cloudflare Pages only serves static files: it can never be the API.
    throw new ApiConfigError(
      CONFIG_ERROR_CODE,
      `VITE_API_URL указывает на сайт Cloudflare Pages (${value}), а не на сервер Family OS. Укажите адрес, где запущен backend.`,
    );
  }
  return value;
}

export const API_NOT_CONFIGURED = "api_not_configured";
export const CONFIG_ERROR_CODE = "frontend_config_error";
const API_NOT_CONFIGURED_MESSAGE =
  "Адрес сервера не задан: сайт собран для Cloudflare Pages без переменной VITE_API_URL, а на самом Pages сервера Family OS нет.";

class ApiConfigError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

interface ApiConfig {
  base: string;
  error: ApiConfigError | null;
}

function apiConfig(): ApiConfig {
  const required = typeof __API_URL_REQUIRED__ !== "undefined" && __API_URL_REQUIRED__;
  try {
    return { base: normalizeApiBase(import.meta.env.VITE_API_URL as string | undefined, { required }), error: null };
  } catch (err) {
    return { base: "", error: err as ApiConfigError };
  }
}

/** Human-readable address of the API used by this build (for diagnostics screens). */
export function apiBaseUrl(): string {
  const { base, error } = apiConfig();
  if (error) return "(адрес API не настроен)";
  return `${base || window.location.origin}/api/v1`;
}

/** Codes for responses that did not come from the Family OS API at all. */
export const BACKEND_UNAVAILABLE = "backend_unavailable";
export const INVALID_RESPONSE = "invalid_response";

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const config = apiConfig();
  if (config.error) throw new ApiError(0, config.error.code, config.error.message);
  const url = new URL(`${config.base}/api/v1${path}`, window.location.origin);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  let resp: Response;
  try {
    resp = await fetch(url, { method: opts.method ?? (body ? "POST" : "GET"), headers, body, signal: opts.signal });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new ApiError(0, "network_error", `Нет соединения с сервером ${apiBaseUrl()}. Проверьте интернет.`);
  }
  if (resp.status === 204) return undefined as T;
  const text = await resp.text();
  const contentType = resp.headers.get("Content-Type") ?? "";
  let data: unknown = undefined;
  let parsed = false;
  if (text && !contentType.includes("text/html")) {
    try {
      data = JSON.parse(text);
      parsed = true;
    } catch {
      parsed = false;
    }
  }
  if (!parsed && (resp.ok || contentType.includes("text/html"))) {
    // Every Family OS endpoint answers with JSON (or 204). An HTML page means the request hit
    // a static host or proxy instead of the backend, e.g. a SPA fallback returning index.html.
    if (contentType.includes("text/html")) {
      throw new ApiError(
        resp.status,
        BACKEND_UNAVAILABLE,
        `Сервер Family OS не найден по адресу ${apiBaseUrl()}: вместо данных пришла веб-страница.`,
      );
    }
    throw new ApiError(resp.status, INVALID_RESPONSE, `Сервер вернул ответ в неожиданном формате (${apiBaseUrl()}).`);
  }
  if (!resp.ok) {
    const e = (data as ApiErrorBody | undefined)?.error;
    if (resp.status === 401) {
      setToken(null);
      unauthorizedListeners.forEach((cb) => cb());
    }
    throw new ApiError(resp.status, e?.code ?? "http_error", e?.message ?? `Ошибка сервера (${resp.status})`, e?.details);
  }
  return data as T;
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Что-то пошло не так";
}
