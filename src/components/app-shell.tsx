import { Link, useMatches, useRouter, useRouterState } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { CalendarDays, ListChecks, Sparkles, Users, Settings2 } from "lucide-react";
import { cn } from "cn";
import { Nebula } from "@/components/nebula";
import mark from "@/assets/mark.png";

const NAV = [
  { to: "/", label: "Calendar", icon: CalendarDays },
  { to: "/entries", label: "Entries", icon: ListChecks },
  { to: "/dashboard", label: "Activity", icon: Sparkles },
  { to: "/clients", label: "Clients", icon: Users },
  { to: "/settings", label: "Settings", icon: Settings2 },
] as const;

/**
 * Fades pages in and out on the live DOM (no View Transitions snapshots, which
 * break backdrop-filter panels). The exiting page keeps rendering its own
 * component, so the swap is never visible mid-fade.
 */
function AnimatedPage() {
  const router = useRouter();
  const leaf = useMatches({ select: (m) => m[m.length - 1] });
  const Page = router.routesById[leaf.routeId as keyof typeof router.routesById]?.options.component as
    | React.ComponentType
    | undefined;
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={leaf.routeId}
        className="h-full"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.13, ease: "linear" }}
      >
        {Page ? <Page /> : null}
      </motion.div>
    </AnimatePresence>
  );
}

export function AppShell() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="flex h-screen w-screen">
      <Nebula />
      <aside data-tauri-drag-region className="flex w-[88px] shrink-0 flex-col items-center pt-12 pb-6">
        <img src={mark} alt="Flowrly" className="mb-8 size-11 select-none drop-shadow-sm" draggable={false} />
        <nav className="flex flex-col items-center gap-1.5">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = path === to;
            return (
              <Link
                key={to}
                to={to}
                title={label}
                className={cn(
                  "group flex w-16 flex-col items-center gap-1 rounded-2xl border border-transparent px-2 py-2.5 text-[11px] font-medium transition-all",
                  active
                    ? "glass text-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
                )}
              >
                <Icon className={cn("size-5 transition-colors", active && "text-primary")} strokeWidth={1.75} />
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        <div data-tauri-drag-region className="h-10 shrink-0" />
        <div className="min-h-0 flex-1 overflow-hidden">
          <AnimatedPage />
        </div>
      </main>
    </div>
  );
}
