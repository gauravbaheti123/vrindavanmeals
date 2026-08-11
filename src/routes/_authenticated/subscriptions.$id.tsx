import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { STALE } from "@/lib/query-cache";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, CreditCard, RefreshCcw } from "lucide-react";
import { computeSubscriptionStatus, STATUS_STYLES, STATUS_LABEL } from "@/lib/subscription-status";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/subscriptions/$id")({
  head: () => ({ meta: [{ title: "Subscription — Vrindavan Meals" }] }),
  component: SubscriptionDetail,
});

function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function SubscriptionDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [renewing, setRenewing] = useState(false);

  const { data: sub } = useQuery({
    queryKey: ["subscription", id],
    staleTime: STALE.LIST,
    queryFn: async () => {
      const { data, error } = await supabase.from("subscriptions")
        .select("*, students(id, full_name, mobile, roll_number), units(name), subscription_plans(name, price, duration_days)")
        .eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: payments } = useQuery({
    queryKey: ["subscription-payments", id],
    staleTime: STALE.LIST,
    queryFn: async () => {
      const { data } = await supabase.from("payments").select("id, amount, mode, status, created_at").eq("subscription_id", id).order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: settings } = useQuery({
    queryKey: ["system-settings"],
    staleTime: STALE.MASTER,
    queryFn: async () => {
      const { data } = await supabase.from("system_settings").select("key,value");
      return Object.fromEntries((data ?? []).map((s) => [s.key, s.value])) as Record<string, string>;
    },
  });

  if (!sub) return <div className="text-muted-foreground">Loading…</div>;
  const s = sub as unknown as {
    id: string; start_date: string; end_date: string; grace_end_date: string;
    status: "active" | "pending" | "grace" | "expired"; plan_id: string;
    students?: { id: string; full_name: string; mobile: string; roll_number: string | null };
    units?: { name: string };
    subscription_plans?: { name: string; price: number; duration_days: number };
  };
  const effective = computeSubscriptionStatus(s);

  async function renew() {
    setRenewing(true);
    const duration = s.subscription_plans?.duration_days ?? 30;
    const grace = Number(settings?.grace_period_days ?? 5);
    const newStart = addDays(s.end_date, 1);
    const newEnd = addDays(newStart, duration);
    const newGrace = addDays(newEnd, grace);
    const { data, error } = await supabase.from("subscriptions").insert({
      student_id: s.students!.id,
      plan_id: s.plan_id,
      unit_id: (sub as { unit_id: string | null }).unit_id,
      start_date: newStart,
      end_date: newEnd,
      grace_end_date: newGrace,
      status: "pending",
    }).select("id").single();
    setRenewing(false);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["subscriptions"] });
    toast.success("Renewal created");
    navigate({ to: "/subscriptions/$id", params: { id: data.id } });
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2">
          <Link to="/subscriptions"><ArrowLeft className="h-4 w-4 mr-1" />Back</Link>
        </Button>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold">{s.students?.full_name}</h1>
            <p className="text-muted-foreground">{s.students?.mobile} {s.students?.roll_number ? `· ${s.students.roll_number}` : ""} · {s.units?.name}</p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link to="/payments/new" search={{ subscription: s.id } as never}>
                <CreditCard className="h-4 w-4 mr-2" />Record Payment
              </Link>
            </Button>
            <Button onClick={renew} disabled={renewing}>
              <RefreshCcw className="h-4 w-4 mr-2" />{renewing ? "Renewing…" : "Renew"}
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Subscription</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Plan" value={s.subscription_plans?.name ?? "—"} />
            <Row label="Price" value={s.subscription_plans ? `₹${Number(s.subscription_plans.price).toLocaleString("en-IN")}` : "—"} />
            <Row label="Start" value={s.start_date} />
            <Row label="End" value={s.end_date} />
            <Row label="Grace End" value={s.grace_end_date} />
            <div className="flex justify-between pt-1">
              <span className="text-muted-foreground">Status</span>
              <Badge className={STATUS_STYLES[effective]}>{STATUS_LABEL[effective]}</Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Payments</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments?.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No payments yet</TableCell></TableRow>
                ) : payments?.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{new Date(p.created_at).toLocaleDateString("en-IN")}</TableCell>
                    <TableCell className="capitalize">{p.mode}</TableCell>
                    <TableCell>₹{Number(p.amount).toLocaleString("en-IN")}</TableCell>
                    <TableCell><Badge variant={p.status === "success" ? "default" : p.status === "failed" ? "destructive" : "secondary"} className="capitalize">{p.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
