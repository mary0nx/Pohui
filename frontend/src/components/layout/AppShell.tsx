import { CalendarDays, Home, House, User, Wallet } from "lucide-react";
import { useEffect } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";

import { useAiEnabled } from "@/app/session";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/cn";
import { haptic, showBackButton } from "@/lib/telegram";

import { AiFab } from "./AiFab";

const TABS = [
  { to: "/", key: "nav.home", icon: Home, end: true },
  { to: "/finance", key: "nav.finance", icon: Wallet },
  { to: "/calendar", key: "nav.calendar", icon: CalendarDays },
  { to: "/home", key: "nav.household", icon: House },
  { to: "/profile", key: "nav.profile", icon: User },
] as const;

function parentOf(path: string): string | null {
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0] === "assistant" ? "/" : null;
  return `/${parts.slice(0, -1).join("/")}`;
}

/** Shows the Telegram BackButton on nested screens. */
function useTelegramBack() {
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const parent = parentOf(location.pathname);
    if (!parent) return;
    return showBackButton(() => navigate(parent));
  }, [location.pathname, navigate]);
}

export function AppShell() {
  const { t } = useI18n();
  const location = useLocation();
  useTelegramBack();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);
  const onAssistant = location.pathname.startsWith("/assistant");
  const showFab = useAiEnabled() && !onAssistant && !location.pathname.startsWith("/profile");
  return (
    <div className="mx-auto min-h-dvh w-full max-w-lg">
      <main className={cn("pt-safe animate-fade-in px-4", onAssistant ? "pb-0" : "pb-nav")} key={location.pathname.split("/")[1]}>
        <Outlet />
      </main>
      {showFab && <AiFab />}
      {!onAssistant && (
        <nav
          aria-label="Основная навигация"
          className="fixed inset-x-0 bottom-0 z-30 px-3"
          style={{ paddingBottom: "calc(var(--safe-bottom) + 8px)" }}
        >
          <ul className="mx-auto flex h-[var(--nav-height)] max-w-lg items-stretch justify-around rounded-[28px] border border-border/70 bg-surface/92 px-1.5 shadow-sheet backdrop-blur-md">
            {TABS.map(({ to, key, icon: Icon, ...rest }) => (
              <li key={to} className="flex-1">
                <NavLink
                  to={to}
                  end={"end" in rest}
                  onClick={() => haptic("select")}
                  className={({ isActive }) =>
                    cn("press flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-bold transition-colors", isActive ? "text-text" : "text-subtle hover:text-muted")
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className={cn(
                          "flex h-8 w-12 items-center justify-center rounded-full transition-[background-color,transform] duration-300 ease-[var(--ease-spring)]",
                          isActive ? "scale-100 bg-accent text-accent-fg" : "scale-90",
                        )}
                      >
                        <Icon className="size-[21px]" strokeWidth={isActive ? 2.3 : 1.9} aria-hidden />
                      </span>
                      <span className="truncate">{t(key)}</span>
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
