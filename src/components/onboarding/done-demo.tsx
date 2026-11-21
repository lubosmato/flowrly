import { motion } from "motion/react";
import mark from "@/assets/mark.png";
import { CLIENT_COLORS } from "@/components/bits";
import { Stage } from "./kit";

const SHORTCUTS = [
  { keys: ["⌘", "N"], label: "Log time" },
  { keys: ["⌘", "1"], label: "Calendar" },
  { keys: ["⌘", "2"], label: "Entries" },
  { keys: ["⌘", "3"], label: "Activity" },
  { keys: ["⌘", "4"], label: "Clients" },
  { keys: ["⌘", ","], label: "Settings" },
];
const SPARKS = Array.from({ length: 16 }, (_, i) => {
  const angle = (i / 16) * Math.PI * 2 + (i % 2) * 0.2;
  const radius = 120 + (i % 3) * 34;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, color: CLIENT_COLORS[i % 6], size: 6 + (i % 3) * 3 };
});

/** Send-off: the mark, a burst in the client colours, and the shortcuts worth knowing. */
export function DoneDemo({ color }: { color: string }) {
  return (
    <Stage label="Good to know" caption="Press ⌘N anywhere in Flowrly to log time">
      <div className="flex h-full flex-col items-center justify-center gap-12">
        <div className="relative flex size-40 items-center justify-center">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="absolute inset-0 rounded-full border"
              style={{ borderColor: color }}
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: [0.5, 1.7], opacity: [0.55, 0] }}
              transition={{ duration: 3, delay: i, repeat: Infinity, ease: "easeOut" }}
            />
          ))}
          {SPARKS.map((s, i) => (
            <motion.span
              key={i}
              className="absolute rounded-full"
              style={{ width: s.size, height: s.size, background: s.color }}
              initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
              animate={{ x: s.x, y: s.y, opacity: [0, 1, 1, 0], scale: [0, 1, 1, 0.4] }}
              transition={{ duration: 1.5, delay: 0.25 + i * 0.015, ease: [0.1, 0.7, 0.3, 1] }}
            />
          ))}
          <motion.img
            src={mark}
            alt=""
            draggable={false}
            className="relative size-28 drop-shadow-xl"
            initial={{ scale: 0.3, rotate: -24, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 180, damping: 12 }}
          />
        </div>

        <ul className="grid w-[420px] grid-cols-2 gap-x-10 gap-y-3">
          {SHORTCUTS.map((s, i) => (
            <motion.li
              key={s.label}
              className="flex items-center justify-between text-sm"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 + i * 0.08, duration: 0.35, ease: "easeOut" }}
            >
              <span className="text-muted-foreground">{s.label}</span>
              <span className="flex gap-1">
                {s.keys.map((k) => (
                  <kbd
                    key={k}
                    className="flex h-7 min-w-7 items-center justify-center rounded-lg border border-border bg-background/60 px-1.5 font-sans text-xs font-medium shadow-[0_1px_0_0_var(--border)]"
                  >
                    {k}
                  </kbd>
                ))}
              </span>
            </motion.li>
          ))}
        </ul>
      </div>
    </Stage>
  );
}
