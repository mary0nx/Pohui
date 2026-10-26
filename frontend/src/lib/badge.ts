/**
 * The number on the Family OS icon (home-screen app) follows the unread notifications.
 * The service worker sets it when a push arrives; the app corrects it whenever it is opened
 * or notifications are read, and a tap on a push marks that notification as read.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";

import { api } from "@/api/client";
import { isInsideTelegram } from "@/lib/telegram";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type BadgeNavigator = Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };

function badgeSupported(): boolean {
  return !isInsideTelegram() && typeof (navigator as BadgeNavigator).setAppBadge === "function";
}

async function showBadge(unread: number): Promise<void> {
  const nav = navigator as BadgeNavigator;
  try {
    if (unread > 0) await nav.setAppBadge?.(unread);
    else {
      await nav.clearAppBadge?.();
      // Nothing left unread: remove the banners still sitting in the notification centre.
      const reg = await navigator.serviceWorker?.getRegistration("/");
      (await reg?.getNotifications())?.forEach((n) => n.close());
    }
  } catch {
    /* not allowed (no notification permission) — nothing to correct */
  }
}

export function useAppBadge(): void {
  const qc = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const enabled = badgeSupported();
  const unread = useQuery({
    queryKey: ["unread"],
    queryFn: () => api<{ unread: number }>("/notifications", { query: { limit: 1 } }),
    enabled,
    staleTime: 0,
    refetchOnWindowFocus: "always",
    refetchInterval: 5 * 60_000,
  });
  const count = unread.data?.unread;

  useEffect(() => {
    if (enabled && count !== undefined) void showBadge(count);
  }, [enabled, count]);

  // Opened from a push: /path?notif=<id> — mark it read and drop the parameter.
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("notif");
    if (!id) return;
    const done = () => {
      // A request started before the "read" may still be running with the old answer: cancel
      // it, then ask again.
      for (const key of ["unread", "inbox", "dashboard"]) {
        void qc.cancelQueries({ queryKey: [key] }).then(() => qc.invalidateQueries({ queryKey: [key] }));
      }
      const params = new URLSearchParams(location.search);
      params.delete("notif");
      const rest = params.toString();
      navigate(`${location.pathname}${rest ? `?${rest}` : ""}${location.hash}`, { replace: true });
    };
    if (UUID.test(id)) void api(`/notifications/${id}/read`, { method: "POST" }).catch(() => undefined).finally(done);
    else done();
  }, [location.search, location.pathname, location.hash, navigate, qc]);
}
