import { createBrowserRouter, Navigate, useRouteError } from "react-router";

import { ErrorState } from "@/components/ui";

import { AiGate } from "@/app/AiGate";
import { AppShell } from "@/components/layout/AppShell";
import { DashboardPage } from "@/features/dashboard/DashboardPage";

function RouteError() {
  const error = useRouteError();
  return (
    <div className="mx-auto max-w-lg px-4 pt-10">
      <ErrorState error={error instanceof Error ? error : new Error("Ошибка отображения страницы")} onRetry={() => window.location.reload()} />
    </div>
  );
}

/* Heavier screens are split into separate chunks. */
export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "finance/*", lazy: async () => ({ Component: (await import("@/features/finance/FinancePage")).FinancePage }) },
      { path: "calendar", lazy: async () => ({ Component: (await import("@/features/calendar/CalendarPage")).CalendarPage }) },
      { path: "calendar/:eventId", lazy: async () => ({ Component: (await import("@/features/calendar/EventPage")).EventPage }) },
      { path: "home", lazy: async () => ({ Component: (await import("@/features/household/HouseholdPage")).HouseholdPage }) },
      { path: "home/shopping", lazy: async () => ({ Component: (await import("@/features/shopping/ShoppingListsPage")).ShoppingListsPage }) },
      { path: "home/shopping/:listId", lazy: async () => ({ Component: (await import("@/features/shopping/ShoppingListPage")).ShoppingListPage }) },
      { path: "home/tasks", lazy: async () => ({ Component: (await import("@/features/tasks/TasksPage")).TasksPage }) },
      { path: "home/tasks/:taskId", lazy: async () => ({ Component: (await import("@/features/tasks/TaskPage")).TaskPage }) },
      { path: "home/kitchen", lazy: async () => ({ Component: (await import("@/features/kitchen/KitchenPage")).KitchenPage }) },
      { path: "home/documents", lazy: async () => ({ Component: (await import("@/features/documents/DocumentsPage")).DocumentsPage }) },
      { path: "home/documents/:docId", lazy: async () => ({ Component: (await import("@/features/documents/DocumentsPage")).DocumentsPage }) },
      { path: "home/life", lazy: async () => ({ Component: (await import("@/features/life/LifePage")).LifePage }) },
      {
        path: "assistant",
        lazy: async () => {
          const { AssistantPage } = await import("@/features/assistant/AssistantPage");
          return { Component: () => <AiGate><AssistantPage /></AiGate> };
        },
      },
      { path: "profile", lazy: async () => ({ Component: (await import("@/features/settings/ProfilePage")).ProfilePage }) },
      { path: "profile/apple-pay", lazy: async () => ({ Component: (await import("@/features/settings/ApplePayPage")).ApplePayPage }) },
      { path: "profile/notifications", lazy: async () => ({ Component: (await import("@/features/settings/NotificationsPage")).NotificationsPage }) },
      {
        path: "profile/ai",
        lazy: async () => {
          const { AiSettingsPage } = await import("@/features/settings/AiSettingsPage");
          return { Component: () => <AiGate><AiSettingsPage /></AiGate> };
        },
      },
      { path: "inbox", lazy: async () => ({ Component: (await import("@/features/settings/InboxPage")).InboxPage }) },
      { path: "join", element: <Navigate to="/" replace /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);
