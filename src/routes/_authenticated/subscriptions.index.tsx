import { fmtDate } from "@/lib/dates";
import { createFileRoute, Link } from "@tanstack/react-router";
import { STALE } from "@/lib/query-cache";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, CalendarClock, Download, FileText } from "lucide-react";
import { StatusBadge, DueAmount, inr } from "@/components/due-status";
import { applyLedgerFilter, defaultLedgerFilter, type LedgerFilterState } from "@/components/ledger-filters";
import { ColumnHead, FilterOptions, useTableSort, sortRows, LEDGER_DATE_KEYS } from "@/components/table-head-controls";
import { fetchLedgerRows } from "@/lib/dues";
import { exportPdf, exportExcel } from "@/lib/report-export";

export const Route = createFileRoute("/_authenticated/subscriptions/")({
  head: () => ({
    meta: [
      { title: "Subscriptions — Vrindavan Meals" },
      { name: "description", content: "One row per student: current status and outstanding due under continuous monthly billing." },
    ],
  }),
  component: SubscriptionList,
});

function SubscriptionList() {
  const [q, setQ] = useState("");
  const [unit, setUnit] = useState("all");
  const [filter, setFilter] = useState<LedgerFilterState>(defaultLedgerFilter);
  const { sort, toggle } = useTableSort({ key: "due_amount", dir: "desc" });

  const { data: units } = useQuery({
    queryKey: ["units"],
    staleTime: STALE.MASTER,
    queryFn: async () => (await supabase.from("units").select("id,name").order("name")).data ?? [],
  });

  const { data: planPrice } = useQuery({
    queryKey: ["default-plan-price"],
    staleTime: STALE.MASTER,
    queryFn: async () => {
      const { data } = await supabase
        .from("subscription_plans").select("price").eq("is_active", true)
        .order("created_at", { ascending: true }).limit(1).maybeSingle();
      return Number(data?.price ?? 3000);
    },
  });

  const { data: ledger, isLoading } = useQuery({
    queryKey: ["subscription-ledger", planPrice],
    staleTime: STALE.LIST,
    enabled: planPrice !== undefined,
    queryFn: () => fetchLedgerRows(planPrice ?? 3000),
  });

  const rows = useMemo(() => {
    const base = (ledger ?? []).filter((r) => {
      if (unit !== "all" && r.unit_id !== unit) return false;
      const s = q.trim().toLowerCase();
      if (s && !(r.full_name.toLowerCase().includes(s) || (r.roll_number ?? "").toLowerCase().includes(s))) return false;
      return true;
    });
    return sortRows(applyLedgerFilter(base, filter), sort, LEDGER_DATE_KEYS);
  }, [ledger, unit, q, filter, sort]);

  const exportColumns = ["Mess No", "Student", "Unit", "Joined", "Exit", "Status", "Total Billed", "Due", "Days Overdue"];
  const exportRows = rows.map((r) => [
    r.roll_number ?? "",
    r.full_name,
    r.unit_name ?? "",
    fmtDate(r.joining_date, ""),
    fmtDate(r.exit_date, ""),
    r.status === "active" ? "Active" : "Inactive",
    r.total_billed,
    r.due_amount,
    r.days_overdue,
  ]);
  const exportTitle = `Subscriptions — ${fmtDate(new Date())}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Subscriptions</h1>
          <p className="text-muted-foreground">
            One row per student — billing accrues automatically every month until the student is deactivated.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => exportPdf({ title: exportTitle, columns: exportColumns, rows: exportRows, filename: "subscriptions" })}>
            <FileText className="h-4 w-4 mr-1" />PDF
          </Button>
          <Button size="sm" variant="outline" onClick={() => exportExcel({ title: "Subscriptions", columns: exportColumns, rows: exportRows, filename: "subscriptions" })}>
            <Download className="h-4 w-4 mr-1" />Excel
          </Button>
          <Button asChild>
            <Link to="/subscriptions/new"><Plus className="h-4 w-4 mr-2" />Assign Subscription</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1 flex-1 min-w-[220px]">
            <Label className="text-xs">Search</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Name or Mess No" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <ColumnHead label="Mess No" sortKey="roll_number" sort={sort} onSort={toggle} />
              <ColumnHead label="Student" sortKey="full_name" sort={sort} onSort={toggle} />
              <ColumnHead
                label="Unit" sortKey="unit_name" sort={sort} onSort={toggle}
                filter={{
                  active: unit !== "all",
                  onClear: () => setUnit("all"),
                  children: (
                    <FilterOptions
                      value={unit}
                      onSelect={setUnit}
                      options={[{ value: "all", label: "All Units" }, ...(units ?? []).map((u) => ({ value: u.id, label: u.name }))]}
                    />
                  ),
                }}
              />
              <ColumnHead label="Joined" sortKey="joining_date" sort={sort} onSort={toggle} />
              <ColumnHead
                label="Status" sortKey="status" sort={sort} onSort={toggle}
                filter={{
                  active: filter.status !== "all",
                  onClear: () => setFilter({ ...filter, status: "all" }),
                  children: (
                    <FilterOptions
                      value={filter.status}
                      onSelect={(v) => setFilter({ ...filter, status: v })}
                      options={[{ value: "all", label: "All" }, { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]}
                    />
                  ),
                }}
              />
              <ColumnHead label="Total Billed" sortKey="total_billed" sort={sort} onSort={toggle} align="right" />
              <ColumnHead
                label="Due" sortKey="due_amount" sort={sort} onSort={toggle} align="right"
                filter={{
                  active: filter.dueRange !== "all",
                  onClear: () => setFilter({ ...filter, dueRange: "all" }),
                  children: (
                    <FilterOptions
                      value={filter.dueRange}
                      onSelect={(v) => setFilter({ ...filter, dueRange: v })}
                      options={[
                        { value: "all", label: "Any amount" },
                        { value: "zero", label: "₹0 (Paid up)" },
                        { value: "low", label: "₹1 – ₹1,000" },
                        { value: "high", label: "₹1,000+" },
                      ]}
                    />
                  ),
                }}
              />
              <TableHead className="w-[80px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12">
                  <CalendarClock className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">No students match the filters.</p>
                </TableCell>
              </TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.student_id}>
                <TableCell className="font-mono text-xs">{r.roll_number ?? "—"}</TableCell>
                <TableCell className="font-medium">
                  <Link to="/students/$id" params={{ id: r.student_id }} className="hover:underline">{r.full_name}</Link>
                </TableCell>
                <TableCell>{r.unit_name ?? "—"}</TableCell>
                <TableCell className="text-sm">{fmtDate(r.joining_date)}</TableCell>
                <TableCell><StatusBadge status={r.status} /></TableCell>
                <TableCell className="text-right text-sm">{inr(r.total_billed)}</TableCell>
                <TableCell className="text-right">
                  <DueAmount status={r.status} due={r.due_amount} daysOverdue={r.days_overdue} />
                </TableCell>
                <TableCell>
                  <Button asChild size="sm" variant="ghost">
                    <Link to="/students/$id" params={{ id: r.student_id }}>View</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
