import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { STALE } from "@/lib/query-cache";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { StudentPicker, type StudentOption } from "@/components/student-picker";
import { toast } from "sonner";
import { computeActivationBilling, addDaysISO } from "@/lib/billing";
import { fetchFeeSlabs, feeForMonth, missingSlabMessage } from "@/lib/fees";

export const Route = createFileRoute("/_authenticated/subscriptions/new")({
  head: () => ({ meta: [{ title: "Assign Subscription — Vrindavan Meals" }] }),
  component: NewSubscription,
});

function NewSubscription() {
  const navigate = useNavigate();
  const [student, setStudent] = useState<StudentOption | null>(null);
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const { data: plan } = useQuery({
    queryKey: ["default-plan"],
    staleTime: STALE.MASTER,
    queryFn: async () => (await supabase.from("subscription_plans").select("*").eq("is_active", true).order("created_at").limit(1).maybeSingle()).data,
  });

  const { data: settings } = useQuery({
    queryKey: ["system-settings"],
    staleTime: STALE.MASTER,
    queryFn: async () => {
      const { data } = await supabase.from("system_settings").select("key,value");
      return Object.fromEntries((data ?? []).map((s) => [s.key, s.value])) as Record<string, string>;
    },
  });

  const { data: unitName } = useQuery({
    queryKey: ["student-unit", student?.unit_id],
    staleTime: STALE.MASTER,
    enabled: !!student?.unit_id,
    queryFn: async () => (await supabase.from("units").select("name").eq("id", student!.unit_id!).maybeSingle()).data?.name ?? "—",
  });

  const { data: feeSlabs } = useQuery({ queryKey: ["fee-settings"], staleTime: STALE.MASTER, queryFn: fetchFeeSlabs });

  const graceDays = Number(settings?.grace_period_days ?? 5);
  // Monthly fee comes from Fee Settings — the same source the billing engine uses.
  const slabFee = feeForMonth(feeSlabs ?? [], startDate);
  const monthlyPrice = Number(slabFee ?? 0);
  const slice = useMemo(() => computeActivationBilling(startDate, monthlyPrice), [startDate, monthlyPrice]);
  const graceEnd = useMemo(() => addDaysISO(slice.endDate, graceDays), [slice.endDate, graceDays]);

  async function save() {
    if (!student) { toast.error("Please select a student"); return; }
    if (!plan) { toast.error("No active plan configured"); return; }
    if (slabFee === null) { toast.error(missingSlabMessage(startDate)); return; }
    if (!student.unit_id) { toast.error("Student has no unit assigned"); return; }
    setSaving(true);
    const { data, error } = await supabase.from("subscriptions").insert({
      student_id: student.id,
      plan_id: plan.id,
      unit_id: student.unit_id,
      start_date: slice.startDate,
      end_date: slice.endDate,
      grace_end_date: graceEnd,
      billed_amount: slice.amount,
      status: "pending",
    }).select("id").single();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Subscription assigned — ${slice.isFullMonth ? "Full" : "Half"} month · ₹${slice.amount.toLocaleString("en-IN")}`);
    navigate({ to: "/subscriptions/$id", params: { id: data.id } });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Assign Subscription</h1>
        <p className="text-muted-foreground">15th-pivot billing: 1–15 = full month, 16–EOM = half month. Ends on the last day of that month.</p>
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
              <Label>Start / Join Date</Label>
              <DateInput value={startDate} onChange={setStartDate} />
            </div>
            <div className="space-y-2">
              <Label>End Date (EOM)</Label>
              <DateInput value={slice.endDate} onChange={() => {}} disabled />
            </div>
            <div className="space-y-2">
              <Label>Grace End</Label>
              <DateInput value={graceEnd} onChange={() => {}} disabled />
            </div>
          </div>
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <div className="font-semibold">Billing Preview</div>
            <div className="text-muted-foreground">
              {slice.isFullMonth ? "Full month (day ≤ 15)" : "Half month (day 16 – end of month)"} · Plan {plan?.name ?? ""} · ₹{monthlyPrice.toLocaleString("en-IN")}/mo (Fee Settings)
            </div>
            <div className="text-lg font-bold pt-1">Amount to bill: ₹{slice.amount.toLocaleString("en-IN")}</div>
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
