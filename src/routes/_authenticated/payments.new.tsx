import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { STALE, invalidateLedger } from "@/lib/query-cache";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { StudentPicker, type StudentOption } from "@/components/student-picker";
import { computeSubscriptionStatus, STATUS_LABEL } from "@/lib/subscription-status";
import { toast } from "sonner";

const searchSchema = z.object({ subscription: z.string().optional() });

export const Route = createFileRoute("/_authenticated/payments/new")({
  head: () => ({ meta: [{ title: "Record Payment — Vrindavan Meals" }] }),
  validateSearch: searchSchema,
  component: NewPayment,
});

const MODES = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "razorpay", label: "Razorpay" },
] as const;

function NewPayment() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const search = Route.useSearch();
  const [student, setStudent] = useState<StudentOption | null>(null);
  const [subscriptionId, setSubscriptionId] = useState<string | null>(search.subscription ?? null);
  const [amount, setAmount] = useState<string>("");
  const [mode, setMode] = useState<string>("cash");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: settings } = useQuery({
    queryKey: ["system-settings"],
    staleTime: STALE.MASTER,
    queryFn: async () => {
      const { data } = await supabase.from("system_settings").select("key,value");
      return Object.fromEntries((data ?? []).map((s) => [s.key, s.value])) as Record<string, string>;
    },
  });

  // Preload subscription passed via URL
  const { data: preSub } = useQuery({
    queryKey: ["pay-presub", search.subscription],
    enabled: !!search.subscription,
    queryFn: async () => {
      const { data } = await supabase.from("subscriptions").select("*, students(id, full_name, mobile, roll_number, unit_id)").eq("id", search.subscription!).maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (preSub && !student) {
      const s = (preSub as unknown as { students: StudentOption }).students;
      setStudent(s);
      setSubscriptionId((preSub as { id: string }).id);
    }
  }, [preSub, student]);

  // Fetch subscriptions for the selected student
  const { data: subs } = useQuery({
    queryKey: ["student-subs", student?.id],
    staleTime: STALE.LIST,
    enabled: !!student,
    queryFn: async () => {
      const { data } = await supabase.from("subscriptions")
        .select("id, start_date, end_date, grace_end_date, status")
        .eq("student_id", student!.id)
        .order("start_date", { ascending: false });
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!subs || subscriptionId) return;
    const pending = subs.find((s) => s.status === "pending");
    const active = subs.find((s) => s.status === "active");
    if (pending) setSubscriptionId(pending.id);
    else if (active) setSubscriptionId(active.id);
  }, [subs, subscriptionId]);

  useEffect(() => {
    if (!amount && settings?.subscription_price) setAmount(settings.subscription_price);
  }, [settings, amount]);

  async function save() {
    if (!student) { toast.error("Please select a student"); return; }
    if (!amount || Number(amount) <= 0) { toast.error("Enter a valid amount"); return; }
    setSaving(true);
    const { data: userRes } = await supabase.auth.getUser();
    const noteRef = note.trim();
    const razorpayRef = mode === "razorpay" && noteRef ? { razorpay_payment_id: noteRef } : {};
    const { error } = await supabase.from("payments").insert({
      student_id: student.id,
      subscription_id: subscriptionId,
      amount: Number(amount),
      mode: mode as "cash" | "upi" | "card" | "razorpay",
      status: "success",
      recorded_by: userRes.user?.id,
      created_at: new Date(date + "T" + new Date().toTimeString().slice(0, 8)).toISOString(),
      ...razorpayRef,
    });
    if (error) { setSaving(false); toast.error(error.message); return; }

    // Activate pending subscription
    if (subscriptionId) {
      const sub = subs?.find((s) => s.id === subscriptionId);
      if (sub && sub.status === "pending") {
        await supabase.from("subscriptions").update({ status: "active" }).eq("id", subscriptionId);
      }
    }
    setSaving(false);
    invalidateLedger(qc);
    toast.success("Payment recorded successfully");
    navigate({ to: "/payments" });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Record Payment</h1>
        <p className="text-muted-foreground">Log a payment for a subscription.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Payment details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Student</Label>
            <StudentPicker value={student} onChange={(s) => { setStudent(s); setSubscriptionId(null); }} />
          </div>
          {student && (
            <div className="space-y-2">
              <Label>Subscription</Label>
              {subs && subs.length > 0 ? (
                <div className="space-y-1">
                  {subs.map((s) => {
                    const eff = computeSubscriptionStatus(s);
                    return (
                      <label key={s.id} className="flex items-center gap-2 border rounded-md px-3 py-2 cursor-pointer hover:bg-muted/40">
                        <input type="radio" name="sub" checked={subscriptionId === s.id} onChange={() => setSubscriptionId(s.id)} />
                        <span className="text-sm">{s.start_date} → {s.end_date} · <span className="text-muted-foreground">{STATUS_LABEL[eff]}</span></span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No subscription found. Payment will be recorded without linking.</p>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Amount (₹)</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} min={1} />
            </div>
            <div className="space-y-2">
              <Label>Payment Date</Label>
              <DateInput value={date} onChange={setDate} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Payment Mode</Label>
            <RadioGroup value={mode} onValueChange={setMode} className="grid grid-cols-4 gap-2">
              {MODES.map((m) => (
                <label key={m.value} className={`flex items-center gap-2 border rounded-md px-3 py-2 cursor-pointer ${mode === m.value ? "border-primary bg-primary/5" : ""}`}>
                  <RadioGroupItem value={m.value} />
                  <span className="text-sm">{m.label}</span>
                </label>
              ))}
            </RadioGroup>
          </div>
          <div className="space-y-2">
            <Label>Reference / Note (optional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="UPI txn ID, receipt no., etc." />
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => navigate({ to: "/payments" })}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save Payment"}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
