import { useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Filter } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SortState = { key: string; dir: "asc" | "desc" } | null;

/** Spreadsheet-style sort cycle: asc → desc → unsorted. */
export function useTableSort(initial: SortState = null) {
  const [sort, setSort] = useState<SortState>(initial);
  const toggle = (key: string) =>
    setSort((cur) => {
      if (!cur || cur.key !== key) return { key, dir: "asc" };
      if (cur.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  return { sort, setSort, toggle };
}

export function ColumnHead({
  label,
  sortKey,
  sort,
  onSort,
  align = "left",
  className,
  filter,
}: {
  label: string;
  sortKey?: string;
  sort?: SortState;
  onSort?: (key: string) => void;
  align?: "left" | "right";
  className?: string;
  filter?: { active: boolean; onClear: () => void; children: ReactNode };
}) {
  const active = !!sortKey && sort?.key === sortKey;
  return (
    <TableHead className={cn(align === "right" && "text-right", className)}>
      <div className={cn("flex items-center gap-1", align === "right" && "justify-end")}>
        <button
          type="button"
          disabled={!sortKey}
          onClick={() => sortKey && onSort?.(sortKey)}
          className={cn(
            "inline-flex items-center gap-1 font-medium",
            sortKey && "hover:text-foreground cursor-pointer select-none",
            active && "text-foreground",
          )}
        >
          {label}
          {active &&
            (sort!.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
        </button>
        {filter && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={`Filter ${label}`}
                className={cn(
                  "rounded p-0.5 hover:bg-muted",
                  filter.active ? "text-primary" : "text-muted-foreground/60",
                )}
              >
                <Filter className={cn("h-3.5 w-3.5", filter.active && "fill-current")} />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-56 p-2 space-y-1">
              {filter.children}
              {filter.active && (
                <Button variant="ghost" size="sm" className="w-full justify-start text-xs" onClick={filter.onClear}>
                  Clear filter
                </Button>
              )}
            </PopoverContent>
          </Popover>
        )}
      </div>
    </TableHead>
  );
}

/** Radio-style option list used inside a header filter popover. */
export function FilterOptions<T extends string>({
  value,
  options,
  onSelect,
}: {
  value: T;
  options: { value: T; label: string }[];
  onSelect: (v: T) => void;
}) {
  return (
    <div className="max-h-64 overflow-auto">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onSelect(o.value)}
          className={cn(
            "w-full text-left text-sm rounded px-2 py-1.5 hover:bg-muted",
            value === o.value && "bg-muted font-medium",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

type SortableRow = Record<string, unknown>;

/** Generic sorter for ledger-style rows; strings compare naturally, dates by timestamp. */
export function sortRows<T extends SortableRow>(rows: T[], sort: SortState, dateKeys: string[] = []): T[] {
  if (!sort) return rows;
  const { key, dir } = sort;
  const mul = dir === "asc" ? 1 : -1;
  const out = [...rows];
  out.sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (dateKeys.includes(key)) {
      const at = av ? Date.parse(String(av)) : 0;
      const bt = bv ? Date.parse(String(bv)) : 0;
      return (at - bt) * mul;
    }
    if (typeof av === "number" || typeof bv === "number") {
      return (Number(av ?? 0) - Number(bv ?? 0)) * mul;
    }
    return String(av ?? "").localeCompare(String(bv ?? "")) * mul;
  });
  return out;
}

export const LEDGER_DATE_KEYS = ["last_payment_date", "joining_date", "exit_date"];
