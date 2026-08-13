import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invalidateLedger } from "@/lib/query-cache";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Search, IndianRupee, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

interface StudentHit {
  id: string;
  full_name: string;
  roll_number: string | null;
  mobile: string | null;
  units?: { name: string } | null;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

function useStudentSearch(q: string, enabled: boolean) {
  return useQuery({
    queryKey: ["quick-student-search", q],
    enabled,
    queryFn: async () => {
      let query = supabase
        .from("students")
        .select("id, full_name, roll_number, mobile, units(name)")
        .eq("is_approved", true)
        .order("roll_number")
        .limit(25);
      const s = q.trim();
      if (s) query = query.or(`full_name.ilike.%${s}%,roll_number.ilike.%${s}%,mobile.ilike.%${s}%`);
      const { data } = await query;
      return (data ?? []) as unknown as StudentHit[];
    },
  });
}

function ResultList({ q, onPick }: { q: string; onPick: (s: StudentHit) => void }) {
  const { data, isLoading } = useStudentSearch(q, true);
  if (isLoading) return <div className="py-6 text-center text-sm text-muted-foreground">Searching…</div>;
  if (!data?.length) return <div className="py-6 text-center text-sm text-muted-foreground">No students found.</div>;
  return (
    <div className="max-h-[50vh] overflow-y-auto -mx-1 px-1 space-y-1">
      {data.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onPick(s)}
          className="w-full text-left rounded-md border px-3 py-2 min-h-12 hover:bg-accent transition-colors"
        >
          <div className="font-medium truncate">{s.full_name}</div>
          <div className="text-xs text-muted-foreground truncate">
            {s.roll_number ?? "—"}{s.units?.name ? ` · ${s.units.name}` : ""}{s.mobile ? ` · ${s.mobile}` : ""}
          </div>
        </button>
      ))}
    </div>
  );
}

/** Quick "Search Student" overlay — type name / Mess No, tap to open ledger. */
export function StudentSearchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  useEffect(() => { if (open) setQ(""); }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Search Student</DialogTitle></DialogHeader>
        <div className="relative">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus className="pl-9 h-11" placeholder="Name, Mess No or mobile" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <ResultList
          q={q}
          onPick={(s) => {
            onOpenChange(false);
            navigate({ to: "/students/$id", params: { id: s.id } });
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

const MODES = ["cash", "upi", "card", "razorpay", "rtgs", "bank_transfer"] as const;

/** Record a payment starting from a student search step. */
export function QuickPaymentDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [student, setStudent] = useState<StudentHit | null>(null);
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<string>("cash");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<StudentHit | null>(null);

  useEffect(() => {
    if (open) {
      setQ(""); setStudent(null); setAmount(""); setMode("cash");
      setDate(todayISO()); setNote(""); setSaved(null);
    }
  }, [open]);

  async function save() {
    if (!student) return;
    if (!amount || Number(amount) <= 0) { toast.error("Enter a valid amount"); return; }
    setSaving(true);
    const { data: userRes } = await supabase.auth.getUser();
    const razorpayRef = mode === "razorpay" && note.trim() ? { razorpay_payment_id: note.trim() } : {};
    const { error } = await supabase.from("payments").insert({
      student_id: student.id,
      amount: Number(amount),
      mode: mode as (typeof MODES)[number],
      status: "success",
      recorded_by: userRes.user?.id,
      created_at: new Date(date + "T" + new Date().toTimeString().slice(0, 8)).toISOString(),
      ...razorpayRef,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Payment recorded");
    invalidateLedger(qc);
    qc.invalidateQueries({ queryKey: ["dues-collected-month"] });
    setSaved(student);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>

        {saved ? (
          <div className="space-y-4">
            <div className="rounded-md bg-success/10 border border-success/30 px-3 py-3 text-sm">
              Payment of ₹{Number(amount).toLocaleString("en-IN")} recorded for <b>{saved.full_name}</b>.
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>Done</Button>
              <Button
                className="min-h-11"
                onClick={() => { onOpenChange(false); navigate({ to: "/students/$id", params: { id: saved.id } }); }}
              >
                View Student
              </Button>
            </DialogFooter>
          </div>
        ) : !student ? (
          <div className="space-y-3">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input autoFocus className="pl-9 h-11" placeholder="Search student by name or Mess No" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <ResultList q={q} onPick={setStudent} />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 bg-muted/40 rounded-md px-3 py-2">
              <div className="min-w-0">
                <div className="font-semibold truncate">{student.full_name}</div>
                <div className="text-xs text-muted-foreground truncate">{student.roll_number ?? "—"}{student.units?.name ? ` · ${student.units.name}` : ""}</div>
              </div>
              <Button variant="ghost" size="sm" className="min-h-11 shrink-0" onClick={() => setStudent(null)}>
                <ArrowLeft className="h-4 w-4 mr-1" />Change
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Amount (₹)</Label>
                <Input type="number" inputMode="decimal" className="h-11" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Date</Label>
                <DateInput value={date} onChange={setDate} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Mode</Label>
              <RadioGroup value={mode} onValueChange={setMode} className="grid grid-cols-2 gap-2">
                {MODES.map((m) => (
                  <label key={m} className="flex items-center gap-2 rounded-md border px-3 min-h-11 cursor-pointer capitalize text-sm">
                    <RadioGroupItem value={m} id={`qp-${m}`} />
                    {m.replace("_", " ")}
                  </label>
                ))}
              </RadioGroup>
            </div>
            <div className="space-y-1">
              <Label>Remarks {mode === "razorpay" ? "(Razorpay payment id)" : "(optional)"}</Label>
              <Input className="h-11" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button className="min-h-11" disabled={saving} onClick={save}>
                <IndianRupee className="h-4 w-4 mr-1" />{saving ? "Saving…" : "Save Payment"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
