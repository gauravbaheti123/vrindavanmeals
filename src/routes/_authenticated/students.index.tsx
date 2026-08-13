import { createFileRoute, Link } from "@tanstack/react-router";
import { STALE } from "@/lib/query-cache";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Plus, Search, UserPlus, Clock, CalendarOff } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge, DueAmount } from "@/components/due-status";
import { MobileOnly, MobileCard, MobileCardList, MobileEmpty } from "@/components/mobile-list";
import { applyLedgerFilter, defaultLedgerFilter, type LedgerFilterState } from "@/components/ledger-filters";
import { ColumnHead, FilterOptions, useTableSort, sortRows, LEDGER_DATE_KEYS } from "@/components/table-head-controls";
import { fetchLedgerRows } from "@/lib/dues";
import { BulkHolidayModal } from "@/components/bulk-holiday-modal";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/students/")({
  head: () => ({
    meta: [
      { title: "Students — Vrindavan Meals" },
      { name: "description", content: "Student records with live status and outstanding dues across all units." },
    ],
  }),
  component: StudentList,
});

function StudentList() {
  const [q, setQ] = useState("");
  const [unit, setUnit] = useState<string>("all");
  const [filter, setFilter] = useState<LedgerFilterState>({ ...defaultLedgerFilter, sort: "name_asc" });
  const { sort, toggle } = useTableSort({ key: "full_name", dir: "asc" });
  const [bulkHoliday, setBulkHoliday] = useState(false);
  const queryClient = useQueryClient();



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
    queryKey: ["students-ledger", planPrice],
    staleTime: STALE.LIST,
    enabled: planPrice !== undefined,
    queryFn: () => fetchLedgerRows(planPrice ?? 3000),
  });

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const base = (ledger ?? []).filter((r) => {
      if (unit !== "all" && r.unit_id !== unit) return false;
      if (
        s &&
        !(
          r.full_name.toLowerCase().includes(s) ||
          (r.mobile ?? "").toLowerCase().includes(s) ||
          (r.roll_number ?? "").toLowerCase().includes(s)
        )
      ) return false;
      return true;
    });
    return sortRows(applyLedgerFilter(base, filter), sort, LEDGER_DATE_KEYS);
  }, [ledger, unit, q, filter, sort]);

  const { data: pendingCount } = useQuery({
    queryKey: ["students-pending-count"],
    staleTime: STALE.LIST,
    queryFn: async () =>
      (await supabase.from("students").select("id", { count: "exact", head: true }).eq("is_approved", false)).count ?? 0,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold">Students</h1>
          <p className="text-sm text-muted-foreground">Manage student records across units.</p>
        </div>
        <div className="grid grid-cols-1 xs:grid-cols-2 gap-2 w-full sm:flex sm:w-auto [&_button]:min-h-11 [&_a]:min-h-11">
          <Button variant="outline" onClick={() => setBulkHoliday(true)}>
            <CalendarOff className="h-4 w-4 mr-2" />
            Bulk Holiday / Leave
          </Button>
          <Button asChild variant="outline">
            <Link to="/students/pending">
              <Clock className="h-4 w-4 mr-2" />
              Pending Approvals
              {pendingCount ? <Badge variant="secondary" className="ml-2">{pendingCount}</Badge> : null}
            </Link>
          </Button>
          <Button asChild>
            <Link to="/students/new"><Plus className="h-4 w-4 mr-2" />Add Student</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1 flex-1 min-w-[220px]">
            <Label className="text-xs">Search</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by Mess No, name or mobile" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="hidden md:block overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <ColumnHead label="Mess No" sortKey="roll_number" sort={sort} onSort={toggle} />
              <ColumnHead label="Name" sortKey="full_name" sort={sort} onSort={toggle} />
              <ColumnHead label="Mobile" sortKey="mobile" sort={sort} onSort={toggle} />
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
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12">
                  <UserPlus className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">No students match the filters.</p>
                </TableCell>
              </TableRow>
            ) : rows.map((s) => (
              <TableRow key={s.student_id}>
                <TableCell className="font-mono text-xs">{s.roll_number || "—"}</TableCell>
                <TableCell className="font-medium">{s.full_name}</TableCell>
                <TableCell>{s.mobile || "—"}</TableCell>
                <TableCell>{s.unit_name || "—"}</TableCell>
                <TableCell><StatusBadge status={s.status} /></TableCell>
                <TableCell className="text-right">
                  <DueAmount status={s.status} due={s.due_amount} daysOverdue={s.days_overdue} />
                </TableCell>
                <TableCell>
                  <Button asChild size="sm" variant="ghost"><Link to="/students/$id" params={{ id: s.student_id }}>View</Link></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Mobile — stacked cards instead of a wide table */}
      <MobileOnly>
        {isLoading ? (
          <MobileEmpty>Loading…</MobileEmpty>
        ) : rows.length === 0 ? (
          <MobileEmpty>No students match the filters.</MobileEmpty>
        ) : (
          <MobileCardList>
            {rows.map((s) => (
              <MobileCard
                key={s.student_id}
                title={s.full_name}
                subtitle={`${s.roll_number || "—"}${s.unit_name ? ` · ${s.unit_name}` : ""}`}
                right={<div className="space-y-1"><StatusBadge status={s.status} /><DueAmount status={s.status} due={s.due_amount} daysOverdue={s.days_overdue} /></div>}
                meta={[{ label: "Mobile", value: s.mobile || "—" }, { label: "Unit", value: s.unit_name || "—" }]}
                actions={
                  <Button asChild size="sm" variant="outline" className="min-h-11 flex-1">
                    <Link to="/students/$id" params={{ id: s.student_id }}>View / Ledger</Link>
                  </Button>
                }
              />
            ))}
          </MobileCardList>
        )}
      </MobileOnly>

      {bulkHoliday && (
        <BulkHolidayModal
          students={rows.map((r) => ({
            student_id: r.student_id,
            full_name: r.full_name,
            roll_number: r.roll_number,
            unit_name: r.unit_name,
            status: r.status,
          }))}
          onClose={() => setBulkHoliday(false)}
          onSaved={() => {
            setBulkHoliday(false);
            queryClient.invalidateQueries({ queryKey: ["students-ledger"] });
            queryClient.invalidateQueries({ queryKey: ["dues"] });
            queryClient.invalidateQueries({ queryKey: ["dashboard"] });
          }}
        />
      )}
    </div>

  );
}
