import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { api, API_NOT_CONFIGURED, ApiError, BACKEND_UNAVAILABLE, CONFIG_ERROR_CODE, INVALID_RESPONSE, onUnauthorized } from "@/api/client";
import { parseMe, parseMeta, parseTokenOut } from "@/api/contracts";
import { getToken, setToken } from "@/lib/session";
import { isInsideTelegram, startParam, telegramInitData } from "@/lib/telegram";
import type { Family, Me, Meta, TokenOut } from "@/types/api";

type Status = "loading" | "ready" | "dev-login" | "outside-telegram" | "api-not-configured" | "backend-unavailable" | "error";

/** The build itself has no usable API address: retrying cannot help, the site must be rebuilt. */
const CONFIG_PROBLEM_CODES = new Set([API_NOT_CONFIGURED, CONFIG_ERROR_CODE]);
/** Errors meaning the API itself is unreachable, not a problem of this user. */
const BACKEND_PROBLEM_CODES = new Set([BACKEND_UNAVAILABLE, INVALID_RESPONSE, "network_error"]);

function failureStatus(e: unknown): Status {
  if (!(e instanceof ApiError)) return "error";
  if (CONFIG_PROBLEM_CODES.has(e.code)) return "api-not-configured";
  if (BACKEND_PROBLEM_CODES.has(e.code) || e.status >= 500) return "backend-unavailable";
  return "error";
}

interface SessionValue {
  status: Status;
  error: string | null;
  meta: Meta | null;
  me: Me | null;
  pendingInvite: string | null;
  /** Show the join screen for a code the user pasted. */
  openInvite: (code: string) => void;
  clearInvite: () => void;
  devLogin: (telegramId: number, name: string) => Promise<void>;
  refreshMe: () => Promise<Me | null>;
  setActiveFamily: (id: string) => Promise<void>;
  logout: () => Promise<void>;
  retry: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

/** The invitation code inside a pasted link or text ("…?startapp=inv_…", "inv_…"), or null. */
export function inviteCode(text: string): string | null {
  return text.match(/inv_[A-Za-z0-9_-]{10,100}/)?.[0] ?? null;
}

function inviteFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  // Telegram passes a direct link's startapp value as tgWebAppStartParam.
  const v = params.get("invite") ?? params.get("startapp") ?? params.get("tgWebAppStartParam");
  return v && v.startsWith("inv_") ? v : null;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [pendingInvite, setPendingInvite] = useState<string | null>(() => inviteFromUrl() ?? (startParam()?.startsWith("inv_") ? startParam()! : null));
  const qc = useQueryClient();
  const reauthing = useRef(false);

  const applyToken = useCallback((out: TokenOut) => {
    setToken(out.token);
    setMe(out.me);
    if (out.start_param?.startsWith("inv_")) setPendingInvite(out.start_param);
    setStatus("ready");
  }, []);

  const telegramLogin = useCallback(async () => {
    const out = parseTokenOut(await api<unknown>("/auth/telegram", { body: { init_data: telegramInitData() } }), "/auth/telegram");
    applyToken(out);
  }, [applyToken]);

  const boot = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      const m = parseMeta(await api<unknown>("/meta"));
      setMeta(m);
      if (getToken()) {
        try {
          setMe(parseMe(await api<unknown>("/me")));
          setStatus("ready");
          return;
        } catch (e) {
          if (!(e instanceof ApiError && e.status === 401)) throw e;
        }
      }
      if (isInsideTelegram()) {
        await telegramLogin();
        return;
      }
      setStatus(m.dev_auth ? "dev-login" : "outside-telegram");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка запуска");
      setStatus(failureStatus(e));
    }
  }, [telegramLogin]);

  useEffect(() => {
    void boot();
  }, [boot]);

  useEffect(
    () =>
      onUnauthorized(() => {
        qc.clear();
        if (isInsideTelegram() && !reauthing.current) {
          reauthing.current = true;
          telegramLogin()
            .catch(() => setStatus("error"))
            .finally(() => {
              reauthing.current = false;
            });
        } else {
          setMe(null);
          setStatus(meta?.dev_auth ? "dev-login" : "outside-telegram");
        }
      }),
    [qc, telegramLogin, meta],
  );

  const devLogin = useCallback(
    async (telegramId: number, name: string) => {
      const out = parseTokenOut(await api<unknown>("/auth/dev", { body: { telegram_id: telegramId, first_name: name } }), "/auth/dev");
      qc.clear();
      applyToken(out);
    },
    [applyToken, qc],
  );

  const refreshMe = useCallback(async () => {
    const m = parseMe(await api<unknown>("/me"));
    setMe(m);
    return m;
  }, []);

  const setActiveFamily = useCallback(async (id: string) => {
    setMe(parseMe(await api<unknown>("/me", { method: "PATCH", body: { active_family_id: id } })));
  }, []);

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      setToken(null);
      qc.clear();
      setMe(null);
      setStatus(meta?.dev_auth ? "dev-login" : "outside-telegram");
    }
  }, [qc, meta]);

  const value = useMemo<SessionValue>(
    () => ({ status, error, meta, me, pendingInvite, clearInvite: () => setPendingInvite(null), openInvite: setPendingInvite, devLogin, refreshMe, setActiveFamily, logout, retry: boot }),
    [status, error, meta, me, pendingInvite, devLogin, refreshMe, setActiveFamily, logout, boot],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession outside SessionProvider");
  return ctx;
}

/** The AI assistant is shown only when the server has it configured (OPENAI_API_KEY + AI_MODEL). */
export function useAiEnabled(): boolean {
  return useSession().meta?.ai_available === true;
}

/** Current family; only used below the gate that guarantees an active family. */
export function useFamily() {
  const { me } = useSession();
  const familyId = me?.active_family_id ?? "";
  const membership = me?.families.find((f) => f.family_id === familyId);
  const query = useQuery({
    queryKey: ["family", familyId],
    queryFn: () => api<Family>(`/families/${familyId}`),
    enabled: Boolean(familyId),
    staleTime: 60_000,
  });
  const family = query.data;
  return {
    familyId,
    me: me!,
    userId: me?.user.id ?? "",
    family,
    currency: family?.currency ?? membership?.currency ?? "PLN",
    tz: family?.timezone ?? membership?.timezone ?? "Europe/Warsaw",
    role: family?.my_role ?? membership?.role ?? "member",
    members: family?.members ?? [],
    memberName: (id: string | null | undefined) => (id ? (family?.members.find((m) => m.user_id === id)?.first_name ?? "Бывший участник") : "—"),
    f: (path: string) => `/families/${familyId}${path}`,
  };
}
