import { fmtDate } from "@/lib/dates";
import { createFileRoute, Link } from "@tanstack/react-router";
import { STALE } from "@/lib/query-cache";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, CreditCard } from "lucide-react";

export const Route = createFileRoute("/_authenticated/payments/")({
  head: () => ({ meta: [{ title: "Payments — Vrindavan Meals" }] }),
  component: PaymentList,
});

const MODES = ["cash", "upi", "card", "razorpay"] as const;

function PaymentList() {
  const [mode, setMode] = useState<string>("all");
  const [unit, setUnit] = useState<string>("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [status, setStatus] = useState<string>("all");

  const { data: units } = useQuery({
    queryKey: ["units"],
    staleTime: STALE.MASTER,
    queryFn: async () => (await supabase.from("units").select("id,name").order("name")).data ?? [],
  });

  const { data: payments, isLoading } = useQuery({
    queryKey: ["payments", mode, unit, from, to, status],
    staleTime: STALE.LIST,
    queryFn: async () => {
      let q = supabase.from("payments")
        .select("id, amount, mode, status, created_at, subscription_id, students(full_name, unit_id, units(name)), subscriptions(start_date, end_date), profiles:recorded_by(name)")
        .order("created_at", { ascending: false }).limit(500);
      if (mode !== "all") q = q.eq("mode", mode as typeof MODES[number]);
      if (status !== "all") q = q.eq("status", status as "success" | "pending" | "failed");
      if (from) q = q.gte("created_at", from);
      if (to) q = q.lte("created_at", to + "T23:59:59");
      const { data, error } = await q;
      if (error) throw error;
      let rows = data ?? [];
      if (unit !== "all") {
        rows = rows.filter((r) => (r as unknown as { students?: { unit_id: string } }).students?.unit_id === unit);
      }
      return rows;
    },
  });

  const summary = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const totals: Record<string, number> = { cash: 0, upi: 0, card: 0, razorpay: 0, total: 0 };
    (payments ?? []).forEach((p) => {
      if (p.status !== "success") return;
      if (p.created_at < monthStart) return;
      const amt = Number(p.amount);
      totals[p.mode] = (totals[p.mode] ?? 0) + amt;
      totals.total += amt;
    });
    return totals;
  }, [payments]);

  const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Payments</h1>
          <p className="text-muted-foreground">All payments across units.</p>
        </div>
        <Button asChild>
          <Link to="/payments/new"><Plus className="h-4 w-4 mr-2" />Record Payment</Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Collected this month</CardTitle></CardHeader>
        <CardContent>
          <div className="text-3xl font-bold mb-3">{inr(summary.total)}</div>
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span>Cash: <span className="text-foreground font-medium">{inr(summary.cash)}</span></span>
            <span>UPI: <span className="text-foreground font-medium">{inr(summary.upi)}</span></span>
            <span>Card: <span className="text-foreground font-medium">{inr(summary.card)}</span></span>
            <span>Razorpay: <span className="text-foreground font-medium">{inr(summary.razorpay)}</span></span>
          </div>
        </CardContent>
      </Card>

      <Card className="p-4 flex flex-wrap gap-3 items-center">
        <Select value={unit} onValueChange={setUnit}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Unit" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Units</SelectItem>
            {units?.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={mode} onValueChange={setMode}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Mode" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Modes</SelectItem>
            {MODES.map((m) => <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
        <DateInput value={from} onChange={setFrom} className="w-[160px]" placeholder="From" />
        <DateInput value={to} onChange={setTo} className="w-[160px]" placeholder="To" />
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Recorded By</TableHead>
              <TableHead>Period</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
            ) : (payments ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12">
                  <CreditCard className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">No payments match the filters.</p>
                </TableCell>
              </TableRow>
            ) : payments?.map((p) => {
              const row = p as unknown as {
                id: string; amount: number; mode: string; status: string; created_at: string;
                students?: { full_name: string; units?: { name: string } };
                subscriptions?: { start_date: string; end_date: string };
                profiles?: { name: string };
              };
              return (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.students?.full_name ?? "—"}<div className="text-xs text-muted-foreground">{row.students?.units?.name ?? ""}</div></TableCell>
                  <TableCell>₹{Number(row.amount).toLocaleString("en-IN")}</TableCell>
                  <TableCell className="capitalize">{row.mode}</TableCell>
                  <TableCell>{fmtDate(row.created_at)}</TableCell>
                  <TableCell>{row.profiles?.name || "—"}</TableCell>
                  <TableCell className="text-xs">{row.subscriptions ? `${fmtDate(row.subscriptions.start_date)} → ${fmtDate(row.subscriptions.end_date)}` : "—"}</TableCell>
                  <TableCell>
                    <Badge variant={row.status === "success" ? "default" : row.status === "failed" ? "destructive" : "secondary"} className="capitalize">{row.status}</Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
