import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { RouterProvider } from "react-router";

import { ToastProvider } from "@/components/ui";
import { ApiNotConfigured, BackendUnavailable, BootError, CreateFamily, DevLogin, JoinFamily, JoinPending, OutsideTelegram, Splash } from "@/features/onboarding/Gate";
import { I18nProvider } from "@/i18n";
import { ApiError } from "@/api/client";

import { router } from "./routes";
import { SessionProvider, useSession } from "./session";
import { ThemeProvider } from "./theme";

function Gate() {
  const session = useSession();
  if (session.status === "loading") return <Splash />;
  if (session.status === "dev-login") return <DevLogin />;
  if (session.status === "outside-telegram") return <OutsideTelegram />;
  if (session.status === "api-not-configured") return <ApiNotConfigured message={session.error} />;
  if (session.status === "backend-unavailable") return <BackendUnavailable message={session.error} onRetry={session.retry} />;
  if (session.status === "error" || !session.me) return <BootError message={session.error} onRetry={() => window.location.reload()} />;
  if (session.pendingInvite) return <JoinFamily token={session.pendingInvite} />;
  if (session.me.pending_invitation) return <JoinPending invitation={session.me.pending_invitation} />;
  if (!session.me.active_family_id) return <CreateFamily />;
  return <RouterProvider router={router} />;
}

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        refetchOnWindowFocus: true,
        retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
      },
      mutations: { retry: false },
    },
  });
}

export function App() {
  const [client] = useState(makeQueryClient);
  return (
    <QueryClientProvider client={client}>
      <I18nProvider>
        <ThemeProvider>
          <ToastProvider>
            <SessionProvider>
              <Gate />
            </SessionProvider>
          </ToastProvider>
        </ThemeProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}
