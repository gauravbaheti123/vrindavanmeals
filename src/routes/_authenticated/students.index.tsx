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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, UserPlus, Clock, CalendarOff } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge, DueAmount } from "@/components/due-status";
import { applyLedgerFilter, defaultLedgerFilter, LedgerFilterControls, type LedgerFilterState } from "@/components/ledger-filters";
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
    return applyLedgerFilter(base, filter);
  }, [ledger, unit, q, filter]);

  const { data: pendingCount } = useQuery({
    queryKey: ["students-pending-count"],
    staleTime: STALE.LIST,
    queryFn: async () =>
      (await supabase.from("students").select("id", { count: "exact", head: true }).eq("is_approved", false)).count ?? 0,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Students</h1>
          <p className="text-muted-foreground">Manage student records across units.</p>
        </div>
        <div className="flex gap-2">
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
          <div className="space-y-1">
            <Label className="text-xs">Unit</Label>
            <Select value={unit} onValueChange={setUnit}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Units</SelectItem>
                {units?.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <LedgerFilterControls value={filter} onChange={setFilter} />
        </CardContent>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mess No</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Mobile</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Due</TableHead>
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
