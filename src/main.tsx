import "./styles/globals.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { ConfirmProvider } from "@/components/confirm";
import { TooltipProvider } from "@/components/ui/tooltip";
import { router } from "./router";
import { commands } from "@/bindings";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 10_000, retry: 1, refetchOnWindowFocus: true },
  },
});

const root = document.getElementById("root") as HTMLElement;

// The native window starts hidden. Wait for fonts (bounded), show the window
// (html already has the theme background, so nothing flashes), then fade the UI
// in on the next painted frame. rAF does not fire while the window is hidden,
// so the show must come before waiting on frames.
async function reveal() {
  await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);
  try {
    await commands.showMainWindow();
  } catch {
    /* running outside Tauri (plain browser) */
  }
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  root.classList.add("ready");
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        <ConfirmProvider>
          <RouterProvider router={router} />
        </ConfirmProvider>
      </TooltipProvider>
      <Toaster />
    </QueryClientProvider>
  </React.StrictMode>,
);

void reveal();
