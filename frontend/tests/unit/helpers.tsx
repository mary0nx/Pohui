import { vi } from "vitest";

type Handler = (body: unknown, url: URL, init: RequestInit) => unknown;
export interface Route {
  method?: string;
  path: RegExp;
  status?: number;
  body?: unknown;
  handler?: Handler;
}

export interface FetchMock {
  calls: { method: string; url: URL; body: unknown; headers: Record<string, string> }[];
}

/** Replace global fetch with a small router; unknown routes return 404 in the API error format. */
export function mockFetch(routes: Route[]): FetchMock {
  const state: FetchMock = { calls: [] };
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input), "http://localhost");
    const method = (init.method ?? "GET").toUpperCase();
    let body: unknown = undefined;
    if (typeof init.body === "string") body = JSON.parse(init.body);
    state.calls.push({ method, url, body, headers: (init.headers ?? {}) as Record<string, string> });
    const route = routes.find((r) => (r.method ?? "GET") === method && r.path.test(url.pathname));
    if (!route) return new Response(JSON.stringify({ error: { code: "not_found", message: `no mock for ${method} ${url.pathname}` } }), { status: 404 });
    const payload = route.handler ? route.handler(body, url, init) : route.body;
    const status = route.status ?? 200;
    if (status === 204) return new Response(null, { status: 204 });
    return new Response(JSON.stringify(payload ?? null), { status, headers: { "Content-Type": "application/json" } });
  });
  return state;
}

export const FAMILY_ID = "11111111-1111-1111-1111-111111111111";

export const me = (withFamily = true) => ({
  user: { id: "u1", telegram_id: 1001, first_name: "Анна", last_name: null, username: null, language_code: "ru", photo_url: null, bot_started: true },
  families: withFamily ? [{ family_id: FAMILY_ID, name: "Мы", role: "owner", currency: "PLN", timezone: "Europe/Warsaw" }] : [],
  active_family_id: withFamily ? FAMILY_ID : null,
  auth_method: "dev",
});

export const family = {
  id: FAMILY_ID,
  name: "Мы",
  currency: "PLN",
  timezone: "Europe/Warsaw",
  ai_enabled: true,
  ai_auto_execute: true,
  created_at: "2026-10-01T00:00:00Z",
  members: [{ id: "m1", user_id: "u1", first_name: "Анна", last_name: null, username: null, photo_url: null, role: "owner", joined_at: "2026-10-01T00:00:00Z" }],
  my_role: "owner",
};

export const meta = (devAuth = true) => ({ env: "development", dev_auth: devAuth, ai_available: false, bot_username: null, storage: "local", max_upload_mb: 15 });

export const totals = (expense = "0", income = "0") => ({ income, expense, net: String(Number(income) - Number(expense)) });

export const dashboard = (overrides: Record<string, unknown> = {}) => ({
  user_name: "Анна",
  family_name: "Мы",
  currency: "PLN",
  month_family: totals(),
  month_personal: totals(),
  budget: null,
  events: [],
  payments: [],
  shopping: { list_id: null, list_name: null, needed_total: 0, items: [] },
  my_tasks: [],
  task_stats: { done_this_week: 0, points_this_week: 0, done_this_month: 0, points_this_month: 0, open_total: 0, overdue_total: 0 },
  goals: [],
  life_goals_open: 0,
  activity: [],
  unread_notifications: 0,
  is_empty: true,
  ...overrides,
});
