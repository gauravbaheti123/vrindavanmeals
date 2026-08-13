import * as React from "react";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { isoToDMY, maskDMY, parseDMY, toISODate } from "@/lib/dates";

export type DateInputProps = {
  /** ISO date "YYYY-MM-DD" (or empty string). */
  value: string;
  onChange: (iso: string) => void;
  id?: string;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
};

/**
 * DD-MM-YYYY date field, locale-independent (native <input type="date"> follows
 * browser locale and would render MM/DD/YYYY for many users).
 * Value in/out is always ISO "YYYY-MM-DD".
 */
export function DateInput({ value, onChange, id, disabled, className, placeholder = "DD-MM-YYYY" }: DateInputProps) {
  const [text, setText] = React.useState(() => isoToDMY(value));
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    setText((prev) => (parseDMY(prev) === (value || null) ? prev : isoToDMY(value)));
  }, [value]);

  function handleText(raw: string) {
    const masked = maskDMY(raw);
    setText(masked);
    if (masked === "") { onChange(""); return; }
    const iso = parseDMY(masked);
    if (iso) onChange(iso);
  }

  const selected = value ? new Date(value + "T00:00:00") : undefined;

  return (
    <div className={cn("relative", className)}>
      <Input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder}
        value={text}
        onChange={(e) => handleText(e.target.value)}
        onBlur={() => setText(isoToDMY(value))}
        className="pr-9"
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            className="absolute right-0 top-0 h-full w-9 text-muted-foreground hover:bg-transparent"
            aria-label="Open calendar"
          >
            <CalendarIcon className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected}
            onSelect={(d) => {
              if (d) { onChange(toISODate(d)); setText(isoToDMY(toISODate(d))); }
              setOpen(false);
            }}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
