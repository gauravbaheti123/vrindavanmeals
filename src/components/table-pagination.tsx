import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const PAGE_SIZE_OPTIONS = ["10", "25", "100", "all"] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

/**
 * Client-side pagination for already-fetched, already-filtered rows.
 * Exports must always use the full `rows` array — only rendering is paged.
 */
export function usePagination<T>(rows: T[], defaultSize: PageSize = "25") {
  const [size, setSize] = useState<PageSize>(defaultSize);
  const [page, setPage] = useState(1);

  const perPage = size === "all" ? rows.length || 1 : Number(size);
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / perPage));

  // Filters/sorting changing the row set must reset to page 1.
  useEffect(() => {
    setPage(1);
  }, [total, size]);

  const current = Math.min(page, pageCount);
  const pageRows = useMemo(
    () => (size === "all" ? rows : rows.slice((current - 1) * perPage, current * perPage)),
    [rows, size, current, perPage],
  );

  return { pageRows, page: current, pageCount, total, size, setSize, setPage };
}

export type PaginationState = ReturnType<typeof usePagination<unknown>>;

export function PaginationBar({
  page, pageCount, total, size, setSize, setPage,
}: {
  page: number; pageCount: number; total: number;
  size: PageSize; setSize: (s: PageSize) => void; setPage: (p: number) => void;
}) {
  if (total === 0) return null;

  const nearby: number[] = [];
  for (let p = Math.max(1, page - 2); p <= Math.min(pageCount, page + 2); p++) nearby.push(p);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-2 print:hidden">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Rows per page</span>
        <Select value={size} onValueChange={(v) => setSize(v as PageSize)}>
          <SelectTrigger className="h-8 w-[90px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((o) => (
              <SelectItem key={o} value={o}>{o === "all" ? "All" : o}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span>{total} row{total === 1 ? "" : "s"}</span>
      </div>

      {size !== "all" && pageCount > 1 && (
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {nearby.map((p) => (
            <Button
              key={p}
              size="sm"
              variant={p === page ? "default" : "outline"}
              className="w-9 px-0"
              onClick={() => setPage(p)}
            >
              {p}
            </Button>
          ))}
          <Button size="sm" variant="outline" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="ml-2 text-xs text-muted-foreground whitespace-nowrap">Page {page} of {pageCount}</span>
        </div>
      )}
    </div>
  );
}
