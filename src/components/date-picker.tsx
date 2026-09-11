import { useState } from "react";
import { format, parseISO } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { isoDay } from "@/lib/format";

const parse = (s: string) => (s ? parseISO(s) : undefined);

export function DatePicker({
  value,
  onChange,
  className,
}: {
  /** YYYY-MM-DD */
  value: string;
  onChange: (iso: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const date = parse(value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("w-full min-w-0 justify-start font-normal", !date && "text-muted-foreground", className)}>
          <CalendarIcon className="text-muted-foreground" />
          <span className="truncate">{date ? format(date, "d MMM yyyy") : "Pick a date"}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          defaultMonth={date}
          weekStartsOn={1}
          onSelect={(d) => {
            if (d) onChange(isoDay(d));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

export function DateRangePicker({
  from,
  to,
  onChange,
  className,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const f = parse(from);
  const t = parse(to);
  const label =
    f && t
      ? format(f, "yyyy-MM") === format(t, "yyyy-MM") && f.getDate() === 1 && t.getDate() === new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()
        ? format(f, "LLLL yyyy")
        : `${format(f, "d MMM")} – ${format(t, "d MMM yyyy")}`
      : f
        ? `from ${format(f, "d MMM yyyy")}`
        : "Any time";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("min-w-0 justify-start font-normal", className)}>
          <CalendarIcon className="text-muted-foreground" />
          <span className="truncate">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          numberOfMonths={2}
          selected={{ from: f, to: t }}
          defaultMonth={f}
          weekStartsOn={1}
          onSelect={(r) => onChange(r?.from ? isoDay(r.from) : "", r?.to ? isoDay(r.to) : r?.from ? isoDay(r.from) : "")}
        />
      </PopoverContent>
    </Popover>
  );
}
