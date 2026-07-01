import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, CalendarClock, IndianRupee, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Vrindavan Meals" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { data } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [students, active, expiring, unmapped] = await Promise.all([
        supabase.from("students").select("id", { count: "exact", head: true }).eq("is_approved", true),
        supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("subscriptions").select("id", { count: "exact", head: true }).lte("end_date", new Date(Date.now() + 5*86400000).toISOString().slice(0,10)).gte("end_date", today).eq("status", "active"),
        supabase.from("unmapped_scans").select("id", { count: "exact", head: true }).eq("resolved", false),
      ]);
      return {
        students: students.count ?? 0,
        active: active.count ?? 0,
        expiring: expiring.count ?? 0,
        unmapped: unmapped.count ?? 0,
      };
    },
  });

  const stats = [
    { label: "Approved Students", value: data?.students ?? "—", icon: Users, color: "text-primary" },
    { label: "Active Subscriptions", value: data?.active ?? "—", icon: CalendarClock, color: "text-success" },
    { label: "Expiring in 5 days", value: data?.expiring ?? "—", icon: AlertTriangle, color: "text-warning-foreground" },
    { label: "Unmapped Scans", value: data?.unmapped ?? "—", icon: IndianRupee, color: "text-destructive" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Overview of canteen operations across all units.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
              <s.icon className={`h-5 w-5 ${s.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Getting started</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>Phase 1 modules are live: authentication, roles, and student management.</p>
          <p>Coming next: biometric mapping, subscriptions & payments, attendance/token flow, reports, and integrations.</p>
        </CardContent>
      </Card>
    </div>
  );
}
