import { createMemoryHistory, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { CalendarPage } from "@/routes/calendar";
import { EntriesPage } from "@/routes/entries";
import { DashboardPage } from "@/routes/dashboard";
import { ClientsPage } from "@/routes/clients";
import { SettingsPage } from "@/routes/settings";

const rootRoute = createRootRoute({ component: AppShell });

const calendarRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: CalendarPage });
const entriesRoute = createRoute({ getParentRoute: () => rootRoute, path: "/entries", component: EntriesPage });
const dashboardRoute = createRoute({ getParentRoute: () => rootRoute, path: "/dashboard", component: DashboardPage });
const clientsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/clients", component: ClientsPage });
const settingsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/settings", component: SettingsPage });

const routeTree = rootRoute.addChildren([calendarRoute, entriesRoute, dashboardRoute, clientsRoute, settingsRoute]);

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
