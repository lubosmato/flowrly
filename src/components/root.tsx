import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { AppShell } from "@/components/app-shell";
import { Nebula } from "@/components/nebula";
import { useSettings } from "@/lib/api";
import { applyLanguage, resolveLanguage } from "@/i18n";
import { Onboarding } from "@/routes/onboarding";

/** Path that reopens onboarding over a configured app (Settings → "Replay the intro"). */
export const ONBOARDING_PATH = "/welcome";

/**
 * Chooses between the first-run wizard and the app. A new install stays in
 * onboarding until it is finished; afterwards the wizard only shows at
 * `ONBOARDING_PATH`.
 */
export function Root() {
  const { data: settings } = useSettings();
  const language = settings ? resolveLanguage(settings.language) : null;
  useEffect(() => {
    if (language) void applyLanguage(language);
  }, [language]);
  const path = useRouterState({ select: (s) => s.location.pathname });
  const onboarding = settings ? !settings.onboarding_completed || path === ONBOARDING_PATH : null;
  return (
    <>
      <Nebula />
      <AnimatePresence mode="wait" initial={false}>
        {onboarding === null ? null : (
          <motion.div
            key={onboarding ? "onboarding" : "app"}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: "linear" }}
          >
            {onboarding ? <Onboarding replay={settings!.onboarding_completed} /> : <AppShell />}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
