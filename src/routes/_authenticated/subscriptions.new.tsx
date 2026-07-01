import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { StudentPicker, type StudentOption } from "@/components/student-picker";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/subscriptions/new")({
  head: () => ({ meta: [{ title: "Assign Subscription — Vrindavan Meals" }] }),
  component: NewSubscription,
});

function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function NewSubscription() {
  const navigate = useNavigate();
  const [student, setStudent] = useState<StudentOption | null>(null);
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const { data: plan } = useQuery({
    queryKey: ["default-plan"],
    queryFn: async () => (await supabase.from("subscription_plans").select("*").eq("is_active", true).order("created_at").limit(1).maybeSingle()).data,
  });

  const { data: settings } = useQuery({
    queryKey: ["system-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("system_settings").select("key,value");
      return Object.fromEntries((data ?? []).map((s) => [s.key, s.value])) as Record<string, string>;
    },
  });

  const { data: unitName } = useQuery({
    queryKey: ["student-unit", student?.unit_id],
    enabled: !!student?.unit_id,
    queryFn: async () => (await supabase.from("units").select("name").eq("id", student!.unit_id!).maybeSingle()).data?.name ?? "—",
  });

  const durationDays = plan?.duration_days ?? 30;
  const graceDays = Number(settings?.grace_period_days ?? 5);
  const endDate = useMemo(() => addDays(startDate, durationDays), [startDate, durationDays]);
  const graceEnd = useMemo(() => addDays(endDate, graceDays), [endDate, graceDays]);

  async function save() {
    if (!student) { toast.error("Please select a student"); return; }
    if (!plan) { toast.error("No active plan configured"); return; }
    if (!student.unit_id) { toast.error("Student has no unit assigned"); return; }
    setSaving(true);
    const { data, error } = await supabase.from("subscriptions").insert({
      student_id: student.id,
      plan_id: plan.id,
      unit_id: student.unit_id,
      start_date: startDate,
      end_date: endDate,
      grace_end_date: graceEnd,
      status: "pending",
    }).select("id").single();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Subscription assigned");
    navigate({ to: "/subscriptions/$id", params: { id: data.id } });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Assign Subscription</h1>
        <p className="text-muted-foreground">Create a new subscription for an approved student.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Student</Label>
            <StudentPicker value={student} onChange={setStudent} />
          </div>
          <div className="space-y-2">
            <Label>Unit</Label>
            <Input value={student ? (unitName ?? "…") : ""} readOnly placeholder="Auto-filled from student" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>End Date</Label>
              <Input type="date" value={endDate} readOnly />
            </div>
            <div className="space-y-2">
              <Label>Grace End</Label>
              <Input type="date" value={graceEnd} readOnly />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Plan</Label>
            <Input value={plan ? `${plan.name} — ₹${Number(plan.price).toLocaleString("en-IN")}` : "…"} readOnly />
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => navigate({ to: "/subscriptions" })}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save Subscription"}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
