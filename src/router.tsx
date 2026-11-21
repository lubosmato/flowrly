import { createMemoryHistory, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { ONBOARDING_PATH, Root } from "@/components/root";
import { CalendarPage } from "@/routes/calendar";
import { EntriesPage } from "@/routes/entries";
import { DashboardPage } from "@/routes/dashboard";
import { ClientsPage } from "@/routes/clients";
import { SettingsPage } from "@/routes/settings";

const rootRoute = createRootRoute({ component: Root });

const calendarRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: CalendarPage,
  // `?new` opens the log-time form for the selected day (used by ⌘N).
  validateSearch: (s: Record<string, unknown>): { new?: true } => (s.new ? { new: true } : {}),
});
const entriesRoute = createRoute({ getParentRoute: () => rootRoute, path: "/entries", component: EntriesPage });
const dashboardRoute = createRoute({ getParentRoute: () => rootRoute, path: "/dashboard", component: DashboardPage });
const clientsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/clients", component: ClientsPage });
const settingsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/settings", component: SettingsPage });

// Rendered by `Root` itself, in place of the app shell.
const onboardingRoute = createRoute({ getParentRoute: () => rootRoute, path: ONBOARDING_PATH });

const routeTree = rootRoute.addChildren([calendarRoute, entriesRoute, dashboardRoute, clientsRoute, settingsRoute, onboardingRoute]);

export const router = createRouter({
  routeTree,
  history: createMemoryHistory({ initialEntries: ["/"] }),
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
