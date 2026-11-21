import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { MousePointer2 } from "lucide-react";
import { cn } from "cn";

/**
 * Drives a looping demo: stays in phase `i` for `durations[i]` ms, then moves on,
 * wrapping after the last one. `cycle` counts completed loops so a demo can remount
 * its one-shot animations. Frozen while `paused`.
 */
export function usePhases(durations: readonly number[], paused = false): { phase: number; cycle: number } {
  const [state, setState] = useState({ phase: 0, cycle: 0 });
  useEffect(() => {
    if (paused) return;
    const t = setTimeout(
      () => setState((s) => (s.phase + 1 < durations.length ? { phase: s.phase + 1, cycle: s.cycle } : { phase: 0, cycle: s.cycle + 1 })),
      durations[state.phase],
    );
    return () => clearTimeout(t);
  }, [state, paused, durations]);
  return state;
}

/** `text` revealed one character at a time while `active`; empty otherwise. */
export function useTyped(text: string, active: boolean, charsPerSecond = 55): string {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!active) {
      setN(0);
      return;
    }
    const t = setInterval(() => setN((v) => (v >= text.length ? v : v + 1)), 1000 / charsPerSecond);
    return () => clearInterval(t);
  }, [text, active, charsPerSecond]);
  return active ? text.slice(0, n) : "";
}

/** A number that eases towards `target` whenever it changes. Starts at `initial` (default: the target). */
export function useTween(target: number, ms = 700, initial = target): number {
  const [value, setValue] = useState(initial);
  const current = useRef(initial);
  useEffect(() => {
    const from = current.current;
    if (from === target) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3);
      current.current = from + (target - from) * eased;
      setValue(current.current);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

/** Tweened number rendered through `format`. Isolated so only this span re-renders per frame. */
export function Num({ value, format, ms, initial }: { value: number; format: (v: number) => string; ms?: number; initial?: number }) {
  const v = useTween(value, ms, initial);
  return <>{format(v)}</>;
}

/** Blinking text caret for typed-out copy. */
export function Caret({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <motion.span
      className="ml-px inline-block h-[1em] w-px translate-y-[2px] bg-primary"
      animate={{ opacity: [1, 0] }}
      transition={{ duration: 0.5, repeat: Infinity, repeatType: "reverse" }}
    />
  );
}

/** Wraps a control; while `active`, a pointer glides onto it and clicks. */
export function Press({ active, children, className }: { active: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={cn("relative inline-flex", className)}>
      <motion.span
        className="inline-flex"
        animate={active ? { scale: [1, 1, 0.93, 1] } : { scale: 1 }}
        transition={active ? { duration: 1.05, times: [0, 0.6, 0.72, 1] } : { duration: 0.1 }}
      >
        {children}
      </motion.span>
      <AnimatePresence>
        {active && (
          <motion.span
            className="pointer-events-none absolute top-1/2 left-1/2 z-20"
            initial={{ x: 54, y: 44, opacity: 0 }}
            animate={{ x: 0, y: 0, opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
            transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <motion.span
              className="absolute -top-3 -left-3 size-6 rounded-full border-2 border-primary"
              initial={{ scale: 0.3, opacity: 0 }}
              animate={{ scale: [0.3, 1.7], opacity: [0.9, 0] }}
              transition={{ delay: 0.62, duration: 0.45 }}
            />
            <MousePointer2 className="relative size-5 fill-foreground text-background drop-shadow-md" strokeWidth={1.5} />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

/**
 * Scales a fixed-size design to whatever room the stage has, so demos are laid
 * out once at `width` x `height` and never reflow with the window.
 */
function Fit({ width, height, children }: { width: number; height: number; children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = outer.current;
    if (!el) return;
    const update = () => {
      const s = Math.min(1.2, el.clientWidth / width, el.clientHeight / height);
      if (s > 0) setScale(s);
    };
    const ro = new ResizeObserver(update);
    ro.observe(el);
    update();
    return () => ro.disconnect();
  }, [width, height]);
  return (
    <div ref={outer} className="absolute inset-0 flex items-center justify-center overflow-hidden">
      <div className="pointer-events-none relative shrink-0 select-none" style={{ width, height, transform: `scale(${scale})` }} inert aria-hidden>
        {children}
      </div>
    </div>
  );
}

export const DEMO_W = 600;
export const DEMO_H = 500;

/**
 * Frame for a demo: the scaled scene on top, and under it the caption for the
 * current phase with a progress bar across the loop.
 */
export function Stage({
  children,
  caption,
  progress,
  label = "Example",
}: {
  children: ReactNode;
  caption: string;
  /** 0..1 through the loop; omit for a demo that does not loop. */
  progress?: number;
  label?: string;
}) {
  return (
    <div className="@container flex h-full flex-col">
      <div className="flex items-center justify-between px-7 pt-6">
        <span className="rounded-full bg-foreground/[0.06] px-2.5 py-1 text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
          {label}
        </span>
      </div>
      <div className="relative m-4 min-h-0 flex-1">
        <Fit width={DEMO_W} height={DEMO_H}>
          {children}
        </Fit>
      </div>
      <div className="flex flex-col gap-3 px-7 pb-6">
        <div className="relative h-5">
          <AnimatePresence initial={false} mode="wait">
            <motion.p
              key={caption}
              className="absolute inset-0 truncate text-sm font-medium @max-[520px]:text-xs @max-[520px]:leading-5"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16 }}
            >
              {caption}
            </motion.p>
          </AnimatePresence>
        </div>
        <div className="h-0.5 overflow-hidden rounded-full bg-foreground/[0.07]">
          {progress !== undefined && (
            <motion.div
              className="h-full origin-left rounded-full bg-primary/70"
              initial={false}
              animate={{ scaleX: progress }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** Inset card used inside demos for a slice of a real screen. */
export function Slab({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-2xl border border-border/60 bg-background/45", className)}>{children}</div>;
}

export function SlabLabel({ children }: { children: ReactNode }) {
  return <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{children}</span>;
}
