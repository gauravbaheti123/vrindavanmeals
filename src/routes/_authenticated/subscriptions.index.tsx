import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, CalendarClock, Download, FileText } from "lucide-react";
import { computeSubscriptionStatus, STATUS_STYLES, STATUS_LABEL, type EffectiveStatus } from "@/lib/subscription-status";
import { exportPdf, exportExcel } from "@/lib/report-export";

export const Route = createFileRoute("/_authenticated/subscriptions/")({
  head: () => ({ meta: [{ title: "Subscriptions — Vrindavan Meals" }] }),
  component: SubscriptionList,
});

function SubscriptionList() {
  const [q, setQ] = useState("");
  const [unit, setUnit] = useState("all");
  const [status, setStatus] = useState<"all" | EffectiveStatus>("all");

  const { data: units } = useQuery({
    queryKey: ["units"],
    queryFn: async () => (await supabase.from("units").select("id,name").order("name")).data ?? [],
  });

  const { data: subs, isLoading } = useQuery({
    queryKey: ["subscriptions", unit],
    queryFn: async () => {
      let query = supabase
        .from("subscriptions")
        .select("id, start_date, end_date, grace_end_date, status, unit_id, students(id, full_name), units(name), subscription_plans(name)")
        .order("start_date", { ascending: false })
        .limit(500);
      if (unit !== "all") query = query.eq("unit_id", unit);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const rows = useMemo(() => {
    const list = (subs ?? []).map((s) => {
      const r = s as unknown as {
        id: string; start_date: string; end_date: string; grace_end_date: string;
        status: "active" | "pending" | "grace" | "expired";
        students?: { full_name: string }; units?: { name: string }; subscription_plans?: { name: string };
      };
      return { ...r, effective: computeSubscriptionStatus(r) };
    });
    return list.filter((r) => {
      if (status !== "all" && r.effective !== status) return false;
      if (q && !r.students?.full_name?.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [subs, status, q]);

  const exportColumns = ["Student", "Unit", "Plan", "Start", "End", "Grace End", "Status"];
  const exportRows = rows.map((r) => [
    r.students?.full_name ?? "",
    r.units?.name ?? "",
    r.subscription_plans?.name ?? "",
    r.start_date,
    r.end_date,
    r.grace_end_date,
    STATUS_LABEL[r.effective],
  ]);
  const exportTitle = `Subscriptions — ${new Date().toLocaleDateString("en-IN")}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Subscriptions</h1>
          <p className="text-muted-foreground">Track and manage student meal subscriptions.</p>
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

      <Card className="p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by student name" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={unit} onValueChange={setUnit}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Units</SelectItem>
            {units?.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="grace">Grace</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Start</TableHead>
              <TableHead>End</TableHead>
              <TableHead>Grace End</TableHead>
              <TableHead>Status</TableHead>
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
                  <p className="text-muted-foreground">No subscriptions match the filters.</p>
                </TableCell>
              </TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.students?.full_name ?? "—"}</TableCell>
                <TableCell>{r.units?.name ?? "—"}</TableCell>
                <TableCell>{r.subscription_plans?.name ?? "—"}</TableCell>
                <TableCell>{r.start_date}</TableCell>
                <TableCell>{r.end_date}</TableCell>
                <TableCell>{r.grace_end_date}</TableCell>
                <TableCell>
                  <Badge className={STATUS_STYLES[r.effective]}>{STATUS_LABEL[r.effective]}</Badge>
                </TableCell>
                <TableCell>
                  <Button asChild size="sm" variant="ghost">
                    <Link to="/subscriptions/$id" params={{ id: r.id }}>View</Link>
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
