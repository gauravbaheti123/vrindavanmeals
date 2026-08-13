import { fmtDate } from "@/lib/dates";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { STALE, invalidateLedger } from "@/lib/query-cache";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Fingerprint, Pencil, Printer, Plus, Trash2, IndianRupee, X, FileText, UserCheck, Scale, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { logAudit, diffValues } from "@/lib/audit";
import { isValidMessNo, isMessNoAvailable } from "@/lib/mess-no";
import { computeSubscriptionStatus } from "@/lib/subscription-status";
import { computeActivationBilling, computeDeactivationRefund, addDaysISO } from "@/lib/billing";
import { fetchFeeSlabs, feeForMonth, missingSlabMessage, computeHolidayDeduction, formatDMY, formatMonth, type FeeSlab } from "@/lib/fees";
import { generateNocPdf } from "@/lib/noc";
import type { Database } from "@/integrations/supabase/types";
import { StudentPhoto, StudentPhotoEditor } from "@/components/student-photo";
import { useServerFn } from "@tanstack/react-start";
import { recalcStudentBilling } from "@/lib/billing.functions";
import { Wallet } from "lucide-react";

export const Route = createFileRoute("/_authenticated/students/$id")({
  head: () => ({ meta: [{ title: "Student — Vrindavan Meals" }] }),
  component: StudentDetail,
});

type Student = Database["public"]["Tables"]["students"]["Row"] & { units?: { name: string } | null };
type Subscription = Database["public"]["Tables"]["subscriptions"]["Row"];
type Payment = Database["public"]["Tables"]["payments"]["Row"];
type Mapping = Database["public"]["Tables"]["biometric_mappings"]["Row"];
type PaymentMode = Database["public"]["Enums"]["payment_mode"];
type Adjustment = {
  id: string;
  student_id: string;
  amount: number;
  remarks: string | null;
  entry_date: string;
  created_by: string | null;
  created_at: string;
  kind: string;
  from_date: string | null;
  to_date: string | null;
};


type Deposit = Database["public"]["Tables"]["security_deposits"]["Row"];

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const todayISO = () => new Date().toISOString().slice(0, 10);
/** "2026-05-17" → "May 2026" */
const monthLabel = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { month: "long", year: "numeric" });


function StudentDetail() {
  const { id } = useParams({ from: "/_authenticated/students/$id" });
  const qc = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["student-detail", id],
    staleTime: STALE.LIST,
    queryFn: async () => {
      const [student, subs, pays, mapping, plans, units, adjs, deposits] = await Promise.all([
        supabase.from("students").select("*, units(name)").eq("id", id).maybeSingle(),
        supabase.from("subscriptions").select("*").eq("student_id", id).order("start_date", { ascending: false }),
        supabase.from("payments").select("*").eq("student_id", id).order("created_at", { ascending: true }),
        supabase.from("biometric_mappings").select("*").eq("student_id", id).eq("is_active", true).maybeSingle(),
        supabase.from("subscription_plans").select("*").eq("is_active", true).order("created_at"),
        supabase.from("units").select("id, name").eq("is_active", true).order("name"),
        supabase.from("ledger_adjustments").select("*").eq("student_id", id).order("entry_date", { ascending: true }),
        supabase.from("security_deposits").select("*").eq("student_id", id).order("entry_date", { ascending: true }),
      ]);
      return {
        student: student.data as Student | null,
        subs: (subs.data ?? []) as Subscription[],
        pays: (pays.data ?? []) as Payment[],
        mapping: mapping.data as Mapping | null,
        plans: plans.data ?? [],
        units: units.data ?? [],
        adjs: (adjs.data ?? []) as unknown as Adjustment[],
        deposits: (deposits.data ?? []) as Deposit[],
      };
    },
  });

  const { data: feeSlabs } = useQuery({ queryKey: ["fee-settings"], queryFn: fetchFeeSlabs });

  const [editProfile, setEditProfile] = useState(false);
  const [editSub, setEditSub] = useState<Subscription | null>(null);
  const [newSub, setNewSub] = useState(false);
  const [payModal, setPayModal] = useState<{ mode: "new" | "edit"; payment?: Payment } | null>(null);
  const [adjModal, setAdjModal] = useState<{ existing: Adjustment | null } | null>(null);
  const [holidayModal, setHolidayModal] = useState<{ existing: Adjustment | null } | null>(null);
  const [depositModal, setDepositModal] = useState<{ kind: "received" | "refunded"; existing: Deposit | null; held: number } | null>(null);

  const [activateOpen, setActivateOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [nocLoading, setNocLoading] = useState(false);

  const refresh = () => {
    refetch();
    invalidateLedger(qc);
  };

  const summary = useMemo(() => {
    if (!data) return { paid: 0, due: 0, advance: 0, last: null as Payment | null, billed: 0, opening: 0, adjustments: 0, openingAsOf: null as string | null };
    const paid = data.pays.filter((p) => p.status === "success").reduce((s, p) => s + Number(p.amount), 0);
    const price = Number(data.plans[0]?.price ?? 3000);
    const opening = Number((data.student as unknown as { opening_balance?: number })?.opening_balance ?? 0);
    const openingAsOf = ((data.student as unknown as { opening_balance_as_of?: string })?.opening_balance_as_of ?? null) as string | null;
    // Net adjustments = manual ledger adjustments + opening balance carried forward.
    const adjustments = data.adjs.reduce((s, a) => s + Number(a.amount), 0) + opening;
    const subsBilled = data.subs.reduce((sum, sub) => {
      const b = (sub as unknown as { billed_amount?: number | null }).billed_amount;
      return sum + Number(b ?? price);
    }, 0);
    // Total Billed is always gross monthly billing — adjustments are tracked separately.
    const billed = subsBilled;
    const balance = billed + adjustments - paid;
    return {
      paid,
      due: Math.max(0, balance),
      advance: Math.max(0, -balance),
      billed,
      opening,
      adjustments,
      openingAsOf,
      last: data.pays.filter((p) => p.status === "success").slice(-1)[0] ?? null,
    };
  }, [data]);


  // Security deposit is a held refundable balance — never part of billing / dues.
  const depositHeld = useMemo(() => {
    if (!data) return 0;
    return data.deposits.reduce(
      (sum, d) => sum + (d.kind === "refunded" ? -Number(d.amount) : Number(d.amount)),
      0,
    );
  }, [data]);

  async function handleIssueNoc() {
    if (!data) return;
    if (summary.due > 0) {
      toast.error(`Clear outstanding payment before issuing NOC — current due ${inr(summary.due)}`);
      return;
    }
    setNocLoading(true);
    try {
      const { data: settingsRows } = await supabase.from("system_settings").select("key,value");
      const settings = Object.fromEntries((settingsRows ?? []).map((r) => [r.key, r.value])) as Record<string, string>;
      const st = data.student;
      if (!st) throw new Error("Student not loaded");
      const doc = generateNocPdf(
        {
          orgName: settings.brand_org_name || "Vrindavan Meals",
          address: settings.brand_address || "",
          contact: settings.brand_contact || "",
          signatureLine: settings.brand_signature_line || "Authorised Signatory",
          logoDataUrl: settings.brand_logo_url || null,
          stampDataUrl: settings.brand_stamp_url || null,
        },
        {
          studentName: st.full_name,
          messNo: st.roll_number,
          room: st.hostel_room,
          unitName: st.units?.name ?? null,
          mobile: st.mobile,
          subscriptionPeriods: data.subs
            .slice()
            .sort((a, b) => (a.start_date < b.start_date ? -1 : 1))
            .map((sub) => ({ start: sub.start_date, end: sub.end_date })),
          issueDate: new Date().toISOString().slice(0, 10),
        },
      );
      const safeName = st.full_name.replace(/[^a-z0-9]+/gi, "_");
      doc.save(`NOC_${safeName}.pdf`);
      toast.success("NOC generated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not generate NOC");
    } finally {
      setNocLoading(false);
    }
  }

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;
  if (!data?.student) return <div>Student not found.</div>;

  const s = data.student;
  const unitName = s.units?.name ?? "No unit";
  const activeSub = data.subs[0];
  const effStatus = activeSub ? computeSubscriptionStatus(activeSub) : null;

  return (
    <div className="space-y-6 max-w-5xl print:max-w-none print:space-y-3">
      <div className="flex items-center justify-between print:hidden flex-wrap gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/students"><ArrowLeft className="h-4 w-4 mr-1" />Students</Link>
        </Button>
        <div className="flex gap-2 flex-wrap">
          {(!s.is_approved || (s as unknown as { exit_date?: string | null }).exit_date) && (
            <Button size="sm" onClick={() => setActivateOpen(true)}>
              <UserCheck className="h-4 w-4 mr-1" />Activate Student
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={nocLoading}
            onClick={() => handleIssueNoc()}
          >
            <FileText className="h-4 w-4 mr-1" />{nocLoading ? "Preparing…" : "Issue NOC"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-1" />Print
          </Button>
        </div>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3 border-b pb-4">
        <div className="flex items-start gap-4 min-w-0">
          <StudentPhoto path={s.photo_url} size={80} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-3xl font-bold">{s.full_name}</h1>
              <Button size="icon" variant="ghost" className="h-7 w-7 print:hidden" onClick={() => setEditProfile(true)}>
                <Pencil className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-muted-foreground text-sm">
              {s.roll_number ?? "—"}{s.mobile ? ` · ${s.mobile}` : ""} · {unitName}
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {effStatus && (
            <Badge variant={effStatus === "expired" ? "destructive" : effStatus === "grace" ? "secondary" : "outline"} className="capitalize">
              {effStatus}
            </Badge>
          )}
          {!s.is_approved && <Badge variant="outline">Pending Approval</Badge>}
          {(s as unknown as { exit_date?: string | null }).exit_date && <Badge variant="outline" className="bg-muted">Inactive</Badge>}
          {data.mapping ? (
            <Badge className="bg-success text-success-foreground"><Fingerprint className="h-3 w-3 mr-1" />Mapped</Badge>
          ) : (
            <Badge variant="outline" className="border-warning"><Fingerprint className="h-3 w-3 mr-1" />Unmapped</Badge>
          )}
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <SummaryTile label="Total Billed" value={inr(summary.billed)} />
        <SummaryTile label="Total Paid" value={inr(summary.paid)} tone="success" />
        <SummaryTile
          label="Adjustments"
          value={(summary.adjustments < 0 ? "−" : summary.adjustments > 0 ? "+" : "") + inr(Math.abs(summary.adjustments))}
          tone={summary.adjustments < 0 ? "success" : summary.adjustments > 0 ? "destructive" : "muted"}
        />
        <SummaryTile label={summary.advance > 0 ? "Advance" : "Total Due"} value={inr(summary.advance > 0 ? summary.advance : summary.due)} tone={summary.due > 0 ? "destructive" : "muted"} />
        <SummaryTile label="Last Payment" value={summary.last ? fmtDate(summary.last.created_at) : "—"} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Profile */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Profile</CardTitle>
            <Button size="sm" variant="ghost" className="print:hidden" onClick={() => setEditProfile(true)}>
              <Pencil className="h-3 w-3 mr-1" />Edit
            </Button>
          </CardHeader>
          <CardContent className="text-sm space-y-1.5">
            <div className="pb-3 mb-2 border-b">
              <StudentPhotoEditor studentId={s.id} path={s.photo_url} onChanged={refresh} />
            </div>
            <Row k="Mess No" v={s.roll_number} />
            <Row k="Roll Number" v={(s as unknown as { college_roll_number?: string | null }).college_roll_number} />
            <Row k="Course" v={s.course} />
            <Row k="Hostel Room" v={s.hostel_room} />
            <Row k="Email" v={s.email} />
            <Row k="Parent Mobile" v={s.parent_mobile} />
            <Row k="Blood Group" v={s.blood_group} />
            <Row k="Joining Date" v={fmtDate((s as unknown as { joining_date?: string | null }).joining_date, "")} />
            <Row k="Exit Date" v={fmtDate((s as unknown as { exit_date?: string | null }).exit_date, "")} />


            {s.is_approved && !(s as unknown as { exit_date?: string | null }).exit_date && (
              <div className="pt-3 mt-3 border-t print:hidden">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDeactivateOpen(true)}
                >
                  <Trash2 className="h-3 w-3 mr-1" />Deactivate Student
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Subscriptions */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Subscriptions</CardTitle>
            <Button size="sm" className="print:hidden" onClick={() => setNewSub(true)}>
              <Plus className="h-3 w-3 mr-1" />Add / Renew
            </Button>
          </CardHeader>
          <CardContent className="text-sm">
            {data.subs.length === 0 ? (
              <p className="text-muted-foreground">No subscriptions yet.</p>
            ) : (
              <ul className="space-y-2">
                {data.subs.map((sub) => {
                  const eff = computeSubscriptionStatus(sub);
                  return (
                    <li key={sub.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                      <div>
                        <div className="font-medium">{fmtDate(sub.start_date)} → {fmtDate(sub.end_date)}</div>
                        <div className="text-xs text-muted-foreground">Grace till {fmtDate(sub.grace_end_date)}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={eff === "expired" ? "destructive" : eff === "grace" ? "secondary" : "outline"} className="capitalize">{eff}</Badge>
                        <Button size="icon" variant="ghost" className="h-7 w-7 print:hidden" onClick={() => setEditSub(sub)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-7 w-7 print:hidden text-destructive hover:text-destructive">
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                Delete this subscription entry ({monthLabel(sub.start_date)})?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                This removes the billing charge for that month. This cannot be undone directly,
                                though “Rebuild All Billing” will regenerate it if the student is still Active for that period.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={async () => {
                                  await supabase.from("payments").update({ subscription_id: null }).eq("subscription_id", sub.id);
                                  const { error } = await supabase.from("subscriptions").delete().eq("id", sub.id);
                                  if (error) return toast.error(error.message);
                                  await logAudit({
                                    action: "delete", entity: "subscription", entityId: sub.id, studentId: s.id,
                                    label: `Billing charge for ${monthLabel(sub.start_date)}`,
                                    oldValues: {
                                      start_date: sub.start_date, end_date: sub.end_date,
                                      billed_amount: sub.billed_amount, status: sub.status,
                                    },
                                  });
                                  toast.success(`Subscription for ${monthLabel(sub.start_date)} deleted`);
                                  refresh();
                                }}
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>

                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Payment Ledger */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Payment Ledger</CardTitle>
          <div className="flex gap-2 print:hidden">
            <Button size="sm" variant="outline" onClick={() => setAdjModal({ existing: null })}>
              <Scale className="h-3 w-3 mr-1" />Add Adjustment
            </Button>
            <Button size="sm" variant="outline" onClick={() => setHolidayModal({ existing: null })}>
              <CalendarDays className="h-3 w-3 mr-1" />Add Holiday / Leave
            </Button>
            <Button size="sm" onClick={() => setPayModal({ mode: "new" })}>
              <IndianRupee className="h-3 w-3 mr-1" />Record Payment
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Running Paid</TableHead>
                <TableHead className="text-right print:hidden">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.opening > 0 && (
                <TableRow className="bg-muted/40">
                  <TableCell className="text-sm">{summary.openingAsOf ? fmtDate(summary.openingAsOf) : "—"}</TableCell>
                  <TableCell className="text-sm italic">Opening Balance</TableCell>
                  <TableCell><Badge variant="secondary">carry-forward</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">Imported</TableCell>
                  <TableCell className="text-right font-semibold">{inr(summary.opening)}</TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">—</TableCell>
                  <TableCell className="print:hidden" />
                </TableRow>
              )}
              {data.pays.length === 0 && summary.opening <= 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No payments yet.</TableCell></TableRow>
              ) : (() => {
                let running = 0;
                return data.pays.map((p) => {
                  if (p.status === "success") running += Number(p.amount);
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="text-sm">{fmtDate(p.created_at)}</TableCell>
                      <TableCell className="capitalize text-sm">{p.mode}</TableCell>
                      <TableCell>
                        <Badge variant={p.status === "success" ? "outline" : "secondary"} className="capitalize">{p.status}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">{p.razorpay_payment_id ?? "—"}</TableCell>
                      <TableCell className="text-right font-semibold">{inr(Number(p.amount))}</TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">{inr(running)}</TableCell>
                      <TableCell className="text-right print:hidden">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setPayModal({ mode: "edit", payment: p })}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive">
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete this payment?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {inr(Number(p.amount))} · {p.mode} · {fmtDate(p.created_at)} will be permanently removed.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={async () => {
                                    const { error } = await supabase.from("payments").delete().eq("id", p.id);
                                    if (error) return toast.error(error.message);
                                    await logAudit({
                                      action: "delete", entity: "payment", entityId: p.id, studentId: s.id,
                                      label: `${inr(Number(p.amount))} · ${p.mode} · ${fmtDate(p.created_at)}`,
                                      oldValues: { amount: p.amount, mode: p.mode, date: p.created_at.slice(0, 10), status: p.status },
                                    });
                                    toast.success("Payment deleted");
                                    refresh();
                                  }}
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                });
              })()}
              {data.adjs.map((a) => {
                const isHoliday = a.kind === "holiday";
                const hDays = isHoliday && a.from_date && a.to_date
                  ? Math.round((Date.parse(a.to_date) - Date.parse(a.from_date)) / 86400000) + 1
                  : 0;
                const rangeLabel = isHoliday && a.from_date && a.to_date
                  ? `${formatDMY(a.from_date)} → ${formatDMY(a.to_date)} (${hDays} day${hDays === 1 ? "" : "s"})`
                  : null;
                return (
                <TableRow key={a.id} className={isHoliday ? "bg-success/5" : "bg-muted/20"}>
                  <TableCell className="text-sm">{fmtDate(a.entry_date)}</TableCell>
                  <TableCell className="text-sm italic">{isHoliday ? "Holiday Deduction" : "Adjustment"}</TableCell>
                  <TableCell>
                    {isHoliday
                      ? <Badge className="bg-success text-success-foreground">Holiday</Badge>
                      : <Badge variant="secondary">{Number(a.amount) < 0 ? "Credit" : "Charge"}</Badge>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {isHoliday
                      ? <span>{rangeLabel}{a.remarks ? ` · ${a.remarks}` : ""}</span>
                      : (a.remarks ?? "—")}
                  </TableCell>
                  <TableCell className={`text-right font-semibold ${Number(a.amount) < 0 ? "text-success" : ""}`}>
                    {Number(a.amount) < 0 ? "−" : "+"}{inr(Math.abs(Number(a.amount)))}
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">—</TableCell>
                  <TableCell className="text-right print:hidden">
                    <div className="flex justify-end gap-1">
                    <Button
                      size="icon" variant="ghost" className="h-7 w-7"
                      onClick={() => (isHoliday ? setHolidayModal({ existing: a }) : setAdjModal({ existing: a }))}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <AlertDialog>

                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{isHoliday ? "Delete this holiday deduction?" : "Delete this adjustment?"}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {inr(Math.abs(Number(a.amount)))} · {rangeLabel ?? a.remarks ?? "no remarks"} will be permanently removed from the ledger.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={async () => {
                              const { error } = await supabase.from("ledger_adjustments").delete().eq("id", a.id);
                              if (error) return toast.error(error.message);
                              await logAudit({
                                action: "delete", entity: isHoliday ? "holiday" : "adjustment", entityId: a.id, studentId: s.id,
                                label: rangeLabel ?? a.remarks ?? "Ledger adjustment",
                                oldValues: { amount: a.amount, entry_date: a.entry_date, remarks: a.remarks, from_date: a.from_date, to_date: a.to_date },
                              });
                              toast.success(isHoliday ? "Holiday deduction deleted" : "Adjustment deleted");
                              refresh();
                            }}
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    </div>
                  </TableCell>

                </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <div className="flex flex-wrap gap-6 border-t px-4 py-3 text-sm">
            <span>Total Billed: <b>{inr(summary.billed)}</b></span>
            <span>Total Paid: <b>{inr(summary.paid)}</b></span>
            {summary.adjustments !== 0 && (
              <span>Adjustments: <b className={summary.adjustments < 0 ? "text-success" : ""}>{summary.adjustments < 0 ? "−" : "+"}{inr(Math.abs(summary.adjustments))}</b></span>
            )}
            <span>Total Due: <b className={summary.due > 0 ? "text-destructive" : ""}>{inr(summary.due)}</b></span>
            {summary.advance > 0 && <span>Advance: <b className="text-success">{inr(summary.advance)}</b></span>}
          </div>
        </CardContent>
      </Card>


      {/* Security Deposit — refundable, tracked separately from billing */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Wallet className="h-4 w-4" />Security Deposit
          </CardTitle>
          <div className="flex gap-2 print:hidden">
            <Button size="sm" variant="outline" onClick={() => setDepositModal({ kind: "received", existing: null, held: depositHeld })}>
              <Plus className="h-3 w-3 mr-1" />Add Deposit
            </Button>
            <Button
              size="sm" variant="outline" disabled={depositHeld <= 0}
              onClick={() => setDepositModal({ kind: "refunded", existing: null, held: depositHeld })}
            >
              <IndianRupee className="h-3 w-3 mr-1" />Refund Deposit
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-baseline gap-2">
            <span className="text-sm text-muted-foreground">Security Deposit Held:</span>
            <span className="text-2xl font-bold">{inr(depositHeld)}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Refundable — not counted in Total Billed, Paid, Adjustments or Due.
          </p>
          {data.deposits.length > 0 && (
            <>
              <DesktopOnly>
                <div className="border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Mode</TableHead>
                        <TableHead>Remarks</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right print:hidden">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.deposits.map((d) => (
                        <TableRow key={d.id}>
                          <TableCell className="text-sm whitespace-nowrap">{fmtDate(d.entry_date)}</TableCell>
                          <TableCell>
                            <Badge variant={d.kind === "refunded" ? "secondary" : "outline"} className="capitalize">
                              {d.kind === "refunded" ? "Refunded" : "Received"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm uppercase">{d.mode ?? "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{d.remarks ?? "—"}</TableCell>
                          <TableCell className={`text-right font-semibold whitespace-nowrap ${d.kind === "refunded" ? "text-destructive" : ""}`}>
                            {d.kind === "refunded" ? "−" : "+"}{inr(Number(d.amount))}
                          </TableCell>
                          <TableCell className="text-right print:hidden">
                            <div className="flex justify-end gap-1">{depActions(d)}</div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </DesktopOnly>
              <MobileOnly>
                <MobileCardList>
                  {data.deposits.map((d) => (
                    <MobileCard
                      key={d.id}
                      title={d.kind === "refunded" ? "Refunded" : "Received"}
                      subtitle={fmtDate(d.entry_date)}
                      right={
                        <span className={`font-semibold whitespace-nowrap ${d.kind === "refunded" ? "text-destructive" : ""}`}>
                          {d.kind === "refunded" ? "−" : "+"}{inr(Number(d.amount))}
                        </span>
                      }
                      meta={[
                        { label: "Mode", value: <span className="uppercase">{d.mode ?? "—"}</span> },
                        { label: "Remarks", value: d.remarks ?? "—" },
                      ]}
                      actions={<div className="flex gap-1 print:hidden">{depActions(d)}</div>}
                    />
                  ))}
                </MobileCardList>
              </MobileOnly>
            </>
          )}
        </CardContent>
      </Card>

      {/* Biometric */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Biometric Mapping</CardTitle>
          {data.mapping && (
            <Button
              size="sm"
              variant="outline"
              className="print:hidden"
              onClick={async () => {
                const { error } = await supabase.from("biometric_mappings").update({ is_active: false }).eq("id", data.mapping!.id);
                if (error) return toast.error(error.message);
                toast.success("Biometric unmapped");
                refresh();
              }}
            >
              <X className="h-3 w-3 mr-1" />Unmap
            </Button>
          )}
        </CardHeader>
        <CardContent className="text-sm">
          {data.mapping ? (
            <div className="space-y-1">
              <Row k="Device User ID" v={data.mapping.device_user_id} />
              <Row k="Device Name" v={data.mapping.device_name} />
              <Row k="Mapped At" v={data.mapping.mapped_at ? new Date(data.mapping.mapped_at).toLocaleString() : null} />
            </div>
          ) : (
            <p className="text-muted-foreground">
              No active biometric mapping. Assign one from{" "}
              <Link to="/biometric" className="text-primary hover:underline">Biometric Mapping</Link>.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Modals */}
      {editProfile && (
        <ProfileEditModal
          student={s}
          units={data.units}
          onClose={() => setEditProfile(false)}
          onSaved={() => { setEditProfile(false); refresh(); }}
        />
      )}
      {(newSub || editSub) && (
        <SubscriptionModal
          studentId={s.id}
          unitId={s.unit_id}
          plans={data.plans}
          existing={editSub}
          onClose={() => { setNewSub(false); setEditSub(null); }}
          onSaved={() => { setNewSub(false); setEditSub(null); refresh(); }}
        />
      )}
      {payModal && (
        <PaymentModal
          studentId={s.id}
          subId={activeSub?.id ?? null}
          defaultAmount={Number(data.plans[0]?.price ?? 3000)}
          existing={payModal.mode === "edit" ? payModal.payment : undefined}
          onClose={() => setPayModal(null)}
          onSaved={() => { setPayModal(null); refresh(); }}
        />
      )}
      {activateOpen && (
        <ActivateStudentModal
          student={s}
          plan={data.plans[0]}
          slabs={feeSlabs ?? []}
          onClose={() => setActivateOpen(false)}
          onSaved={() => { setActivateOpen(false); refresh(); }}
        />
      )}
      {deactivateOpen && (
        <DeactivateStudentModal
          student={s}
          advance={summary.advance}
          plan={data.plans[0]}
          slabs={feeSlabs ?? []}
          onClose={() => setDeactivateOpen(false)}
          onSaved={() => { setDeactivateOpen(false); refresh(); }}
        />
      )}
      {adjModal && (
        <AdjustmentModal
          studentId={s.id}
          existing={adjModal.existing}
          onClose={() => setAdjModal(null)}
          onSaved={() => { setAdjModal(null); refresh(); }}
        />
      )}
      {depositModal && (
        <DepositModal
          studentId={s.id}
          kind={depositModal.kind}
          held={depositModal.held}
          existing={depositModal.existing}
          onClose={() => setDepositModal(null)}
          onSaved={() => { setDepositModal(null); refresh(); }}
        />
      )}
      {holidayModal && (
        <HolidayModal
          studentId={s.id}
          slabs={feeSlabs ?? []}
          existing={holidayModal.existing}
          onClose={() => setHolidayModal(null)}
          onSaved={() => { setHolidayModal(null); refresh(); }}
        />
      )}


    </div>
  );
}

function SummaryTile({ label, value, tone = "muted" }: { label: string; value: string; tone?: "muted" | "success" | "destructive" }) {
  const color = tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : "";
  return (
    <Card>
      <CardContent className="pt-3 pb-3">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`text-xl font-bold ${color}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function Row({ k, v }: { k: string; v?: string | null }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium text-right">{v || "—"}</span>
    </div>
  );
}

/* ---------------- Profile Edit ---------------- */

function ProfileEditModal({
  student, units, onClose, onSaved,
}: { student: Student; units: { id: string; name: string }[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    full_name: student.full_name,
    mobile: student.mobile ?? "",
    roll_number: student.roll_number ?? "",
    college_roll_number: (student as unknown as { college_roll_number?: string | null }).college_roll_number ?? "",
    course: student.course ?? "",
    hostel_room: student.hostel_room ?? "",
    email: student.email ?? "",
    parent_mobile: student.parent_mobile ?? "",
    blood_group: student.blood_group ?? "",
    joining_date: (student as unknown as { joining_date?: string | null }).joining_date ?? "",
    exit_date: (student as unknown as { exit_date?: string | null }).exit_date ?? "",
    unit_id: student.unit_id ?? "",
  });
  const [saving, setSaving] = useState(false);
  const recalc = useServerFn(recalcStudentBilling);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    if (!form.full_name.trim()) return toast.error("Name is required");
    const messNo = form.roll_number.trim();
    if (!messNo) return toast.error("Mess No is required");
    const legacy = (student.roll_number ?? "").trim();
    const changed = messNo !== legacy;
    if (changed && !isValidMessNo(messNo)) return toast.error("Mess No must follow format VM-0001");
    const mobile = form.mobile.trim();
    if (mobile && !/^\d{10}$/.test(mobile.replace(/\D/g, "").slice(-10))) {
      return toast.error("Mobile must be a 10-digit number");
    }
    setSaving(true);
    if (changed && !(await isMessNoAvailable(messNo, student.id))) {
      setSaving(false);
      return toast.error("Mess No already in use — duplicate");
    }
    const { error } = await supabase.from("students").update({
      full_name: form.full_name.trim(),
      mobile: mobile || null,
      roll_number: messNo,
      college_roll_number: form.college_roll_number.trim() || null,
      course: form.course || null,
      hostel_room: form.hostel_room || null,
      email: form.email || null,
      parent_mobile: form.parent_mobile || null,
      blood_group: form.blood_group || null,
      joining_date: form.joining_date || null,
      exit_date: form.exit_date || null,
      unit_id: form.unit_id || null,
    }).eq("id", student.id);
    if (error) { setSaving(false); return toast.error(error.message); }

    // Joining / Exit date drives the billing calendar — recalculate this student only.
    const oldJoin = (student as unknown as { joining_date?: string | null }).joining_date ?? "";
    const oldExit = (student as unknown as { exit_date?: string | null }).exit_date ?? "";
    const datesChanged = oldJoin !== (form.joining_date || "") || oldExit !== (form.exit_date || "");
    if (datesChanged) {
      try {
        const res = await recalc({ data: { student_id: student.id } });
        await logAudit({
          action: "update", entity: "billing", entityId: student.id, studentId: student.id,
          label: `Billing recalculated due to date change: ${oldJoin || "—"} → ${form.joining_date || "—"}` +
            (oldExit !== (form.exit_date || "") ? ` (exit ${oldExit || "—"} → ${form.exit_date || "—"})` : ""),
          oldValues: { joining_date: oldJoin || null, exit_date: oldExit || null },
          newValues: { joining_date: form.joining_date || null, exit_date: form.exit_date || null, total_billed: res.total },
        });
        toast.success(`Profile updated — billing recalculated (${inr(res.total)})`);
      } catch (e: any) {
        toast.error(`Profile saved, but billing recalculation failed: ${e?.message ?? e}`);
      }
    } else {
      toast.success("Profile updated");
    }
    setSaving(false);
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit Profile</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Mess No *"><Input value={form.roll_number} onChange={(e) => set("roll_number", e.target.value)} placeholder="VM-0001" /></Field>
          <Field label="Roll Number"><Input value={form.college_roll_number} onChange={(e) => set("college_roll_number", e.target.value)} placeholder="College roll no (optional)" /></Field>

          <Field label="Full Name *"><Input value={form.full_name} onChange={(e) => set("full_name", e.target.value)} /></Field>
          <Field label="Mobile"><Input value={form.mobile} onChange={(e) => set("mobile", e.target.value)} placeholder="Optional" /></Field>
          <Field label="Unit">
            <Select value={form.unit_id || "none"} onValueChange={(v) => set("unit_id", v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {units.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Course"><Input value={form.course} onChange={(e) => set("course", e.target.value)} /></Field>
          <Field label="Hostel Room"><Input value={form.hostel_room} onChange={(e) => set("hostel_room", e.target.value)} /></Field>
          <Field label="Blood Group"><Input value={form.blood_group} onChange={(e) => set("blood_group", e.target.value)} /></Field>
          <Field label="Email"><Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></Field>
          <Field label="Parent Mobile"><Input value={form.parent_mobile} onChange={(e) => set("parent_mobile", e.target.value)} /></Field>
          <Field label="Joining Date"><DateInput value={form.joining_date} onChange={(v) => set("joining_date", v)} /></Field>
          <Field label="Exit Date"><DateInput value={form.exit_date} onChange={(v) => set("exit_date", v)} /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}

/* ---------------- Subscription Modal ---------------- */

function SubscriptionModal({
  studentId, unitId, plans, existing, onClose, onSaved,
}: {
  studentId: string; unitId: string | null;
  plans: Database["public"]["Tables"]["subscription_plans"]["Row"][];
  existing: Subscription | null; onClose: () => void; onSaved: () => void;
}) {
  const [planId, setPlanId] = useState(existing?.plan_id ?? plans[0]?.id ?? "");
  const [startDate, setStartDate] = useState(existing?.start_date ?? todayISO());
  const [endDate, setEndDate] = useState(existing?.end_date ?? "");
  const [graceEnd, setGraceEnd] = useState(existing?.grace_end_date ?? "");
  const [status, setStatus] = useState<Database["public"]["Enums"]["subscription_status"]>(existing?.status ?? "active");
  const [billedAmount, setBilledAmount] = useState<string>(
    existing ? String((existing as unknown as { billed_amount?: number | null }).billed_amount ?? "") : "",
  );
  const [saving, setSaving] = useState(false);

  const plan = plans.find((p) => p.id === planId);
  const monthlyPrice = Number(plan?.price ?? 3000);
  const slice = useMemo(() => computeActivationBilling(startDate, monthlyPrice), [startDate, monthlyPrice]);

  // Auto-fill end/grace/amount from 15th-pivot rule (new only)
  useEffect(() => {
    if (existing) return;
    setEndDate(slice.endDate);
    setGraceEnd(addDaysISO(slice.endDate, 5));
    setBilledAmount(String(slice.amount));
  }, [slice.endDate, slice.amount, existing]);

  async function save() {
    if (!planId || !startDate || !endDate || !graceEnd) return toast.error("All fields required");
    const amt = billedAmount === "" ? monthlyPrice : Number(billedAmount);
    if (Number.isNaN(amt) || amt < 0) return toast.error("Invalid billed amount");
    setSaving(true);
    if (existing) {
      const next = {
        plan_id: planId, start_date: startDate, end_date: endDate, grace_end_date: graceEnd, status, billed_amount: amt,
      };
      const { error } = await supabase.from("subscriptions").update(next).eq("id", existing.id);
      setSaving(false);
      if (error) return toast.error(error.message);
      const d = diffValues(existing as unknown as Record<string, unknown>, next as unknown as Record<string, unknown>);
      await logAudit({
        action: "update", entity: "subscription", entityId: existing.id, studentId,
        label: `Subscription ${startDate} → ${endDate}`, oldValues: d.old, newValues: d.new,
      });
      toast.success("Subscription updated");
    } else {
      const { error } = await supabase.from("subscriptions").insert({
        student_id: studentId, plan_id: planId, start_date: startDate,
        end_date: endDate, grace_end_date: graceEnd, status, unit_id: unitId, billed_amount: amt,
      });
      setSaving(false);
      if (error) return toast.error(error.message);
      await logAudit({
        action: "create", entity: "subscription", studentId,
        label: `Subscription ${startDate} → ${endDate}`,
        newValues: { start_date: startDate, end_date: endDate, billed_amount: amt, status },
      });
      toast.success("Subscription added");
    }
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{existing ? "Edit Subscription" : "Add / Renew Subscription"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Plan">
            <Select value={planId} onValueChange={setPlanId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} — {inr(Number(p.price))} / {p.duration_days}d</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Start Date"><DateInput value={startDate} onChange={setStartDate} /></Field>
            <Field label="End Date"><DateInput value={endDate} onChange={setEndDate} /></Field>
            <Field label="Grace Until"><DateInput value={graceEnd} onChange={setGraceEnd} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Billed Amount (₹)">
              <Input type="number" value={billedAmount} onChange={(e) => setBilledAmount(e.target.value)} />
            </Field>
            <Field label="Status">
              <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["active", "grace", "expired", "pending"] as const).map((v) => (
                    <SelectItem key={v} value={v} className="capitalize">{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          {!existing && (
            <div className="rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground">
              15th-pivot: {slice.isFullMonth ? "Full month" : "Half month"} · Ends {slice.endDate} · Auto ₹{slice.amount.toLocaleString("en-IN")}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Payment Modal ---------------- */

function PaymentModal({
  studentId, subId, defaultAmount, existing, onClose, onSaved,
}: {
  studentId: string; subId: string | null; defaultAmount: number;
  existing?: Payment; onClose: () => void; onSaved: () => void;
}) {
  const [amount, setAmount] = useState(String(existing?.amount ?? defaultAmount));
  const [mode, setMode] = useState<PaymentMode>((existing?.mode ?? "cash") as PaymentMode);
  const [date, setDate] = useState(existing ? existing.created_at.slice(0, 10) : todayISO());
  const [note, setNote] = useState(existing?.razorpay_payment_id ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!amount || Number(amount) <= 0) return toast.error("Enter a valid amount");
    setSaving(true);
    const { data: userRes } = await supabase.auth.getUser();
    const payload = {
      student_id: studentId,
      subscription_id: subId,
      amount: Number(amount),
      mode,
      status: "success" as const,
      recorded_by: userRes.user?.id,
      razorpay_payment_id: note.trim() || null,
      created_at: new Date(date + "T" + new Date().toTimeString().slice(0, 8)).toISOString(),
    };
    const q = existing
      ? supabase.from("payments").update(payload).eq("id", existing.id)
      : supabase.from("payments").insert(payload);
    const { error } = await q;
    setSaving(false);
    if (error) return toast.error(error.message);
    if (existing) {
      const d = diffValues(
        { amount: existing.amount, mode: existing.mode, created_at: existing.created_at.slice(0, 10), razorpay_payment_id: existing.razorpay_payment_id },
        { amount: payload.amount, mode: payload.mode, created_at: date, razorpay_payment_id: payload.razorpay_payment_id },
      );
      await logAudit({
        action: "update", entity: "payment", entityId: existing.id, studentId,
        label: `Payment of ${inr(Number(amount))}`, oldValues: d.old, newValues: d.new,
      });
    } else {
      await logAudit({
        action: "create", entity: "payment", studentId,
        label: `Payment of ${inr(Number(amount))}`,
        newValues: { amount: payload.amount, mode: payload.mode, date },
      });
    }
    toast.success(existing ? "Payment updated" : "Payment recorded");
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{existing ? "Edit Payment" : "Record Payment"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (₹)"><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
            <Field label="Date"><DateInput value={date} onChange={setDate} /></Field>
          </div>
          <Field label="Mode">
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as PaymentMode)} className="grid grid-cols-4 gap-2">
              {(["cash", "upi", "card", "razorpay"] as PaymentMode[]).map((m) => (
                <label key={m} className={`flex items-center gap-1 border rounded-md px-2 py-1.5 cursor-pointer text-sm capitalize ${mode === m ? "border-primary bg-primary/5" : ""}`}>
                  <RadioGroupItem value={m} />{m}
                </label>
              ))}
            </RadioGroup>
          </Field>
          <Field label="Reference / Note"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="UPI txn ID, receipt no." /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Activate Student Modal ---------------- */

function ActivateStudentModal({
  student, plan, slabs, onClose, onSaved,
}: {
  student: Student;
  plan: Database["public"]["Tables"]["subscription_plans"]["Row"] | undefined;
  slabs: FeeSlab[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [joinDate, setJoinDate] = useState(todayISO());
  const [saving, setSaving] = useState(false);
  const slabFee = feeForMonth(slabs, joinDate);
  const monthlyPrice = slabFee ?? Number(plan?.price ?? 3000);
  const slice = useMemo(() => computeActivationBilling(joinDate, monthlyPrice), [joinDate, monthlyPrice]);

  async function save() {
    if (!plan) return toast.error("No active plan configured");
    if (slabFee === null) return toast.error(missingSlabMessage(joinDate));
    setSaving(true);

    const { error: upErr } = await supabase.from("students").update({ is_approved: true, exit_date: null }).eq("id", student.id);
    if (upErr) { setSaving(false); return toast.error(upErr.message); }
    const { error: subErr } = await supabase.from("subscriptions").insert({
      student_id: student.id,
      plan_id: plan.id,
      unit_id: student.unit_id,
      start_date: slice.startDate,
      end_date: slice.endDate,
      grace_end_date: addDaysISO(slice.endDate, 5),
      status: "active",
      billed_amount: slice.amount,
    });
    setSaving(false);
    if (subErr) return toast.error(subErr.message);
    toast.success(`Activated — ${slice.isFullMonth ? "Full" : "Half"} month · ₹${slice.amount.toLocaleString("en-IN")}`);
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Activate Student</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Choose the join/activation date. Billing applies the 15th-pivot rule:
            day 1–15 = full month, day 16–EOM = half month. Subscription runs till last day of that month.
          </p>
          <Field label="Join / Activation Date">
            <DateInput value={joinDate} onChange={setJoinDate} />
          </Field>
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <div className="flex justify-between"><span>Rule</span><span className="font-medium">{slice.isFullMonth ? "Full month (day ≤ 15)" : "Half month (day 16 – EOM)"}</span></div>
            <div className="flex justify-between"><span>Period</span><span className="font-medium">{slice.startDate} → {slice.endDate}</span></div>
            <div className="flex justify-between pt-1 border-t mt-1"><span className="text-muted-foreground">Amount to bill</span><span className="font-bold">{inr(slice.amount)}</span></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Activating…" : "Activate & Bill"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Deactivate Student Modal ---------------- */

function DeactivateStudentModal({
  student, advance, plan, slabs, onClose, onSaved,
}: {
  student: Student;
  advance: number;
  plan: Database["public"]["Tables"]["subscription_plans"]["Row"] | undefined;
  slabs: FeeSlab[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [deactivateDate, setDeactivateDate] = useState(todayISO());
  const [action, setAction] = useState<"none" | "credit" | "refund">("none");
  const [refundMode, setRefundMode] = useState<PaymentMode>("cash");
  const [saving, setSaving] = useState(false);
  const monthlyPrice = feeForMonth(slabs, deactivateDate) ?? Number(plan?.price ?? 3000);
  const refundable = useMemo(
    () => computeDeactivationRefund(deactivateDate, monthlyPrice, advance),
    [deactivateDate, monthlyPrice, advance],
  );


  async function save() {
    setSaving(true);
    try {
      if (action === "refund" && refundable > 0) {
        const { data: userRes } = await supabase.auth.getUser();
        const { error } = await supabase.from("payments").insert({
          student_id: student.id,
          subscription_id: null,
          amount: -refundable,
          mode: refundMode,
          status: "success",
          recorded_by: userRes.user?.id,
          razorpay_payment_id: `REFUND on deactivation ${deactivateDate}`,
          created_at: new Date(deactivateDate + "T12:00:00").toISOString(),
        });
        if (error) throw new Error(error.message);
      }
      // "credit" leaves the advance as-is (still visible on ledger). "none" also leaves it.
      const { error: dErr } = await supabase.from("students").update({ exit_date: deactivateDate }).eq("id", student.id);
      if (dErr) throw new Error(dErr.message);
      toast.success("Student deactivated");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to deactivate");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Deactivate Student</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            15th-pivot mirror: exit day 1–15 → liable half month (₹{(monthlyPrice / 2).toLocaleString("en-IN")}) →
            up to that portion of advance refundable. Exit day 16–EOM → liable full month → no refund.
          </p>
          <Field label="Deactivation Date">
            <DateInput value={deactivateDate} onChange={setDeactivateDate} />
          </Field>
          <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
            <div className="flex justify-between"><span>Current Advance</span><span className="font-medium">{inr(advance)}</span></div>
            <div className="flex justify-between"><span>Refundable</span><span className="font-bold text-success">{inr(refundable)}</span></div>
          </div>
          {refundable > 0 && (
            <div className="space-y-2">
              <Label className="text-xs">Refundable amount — choose action</Label>
              <RadioGroup value={action} onValueChange={(v) => setAction(v as typeof action)} className="space-y-1">
                <label className={`flex items-start gap-2 border rounded-md px-3 py-2 cursor-pointer ${action === "credit" ? "border-primary bg-primary/5" : ""}`}>
                  <RadioGroupItem value="credit" className="mt-1" />
                  <div>
                    <div className="font-medium text-sm">Record as Credit</div>
                    <div className="text-xs text-muted-foreground">Keep {inr(refundable)} as advance on the ledger.</div>
                  </div>
                </label>
                <label className={`flex items-start gap-2 border rounded-md px-3 py-2 cursor-pointer ${action === "refund" ? "border-primary bg-primary/5" : ""}`}>
                  <RadioGroupItem value="refund" className="mt-1" />
                  <div>
                    <div className="font-medium text-sm">Record as Cash Refund</div>
                    <div className="text-xs text-muted-foreground">Add a negative entry in Payment Ledger for {inr(refundable)}.</div>
                  </div>
                </label>
              </RadioGroup>
              {action === "refund" && (
                <Field label="Refund Mode">
                  <RadioGroup value={refundMode} onValueChange={(v) => setRefundMode(v as PaymentMode)} className="grid grid-cols-4 gap-2">
                    {(["cash", "upi", "card", "razorpay"] as PaymentMode[]).map((m) => (
                      <label key={m} className={`flex items-center gap-1 border rounded-md px-2 py-1.5 cursor-pointer text-sm capitalize ${refundMode === m ? "border-primary bg-primary/5" : ""}`}>
                        <RadioGroupItem value={m} />{m}
                      </label>
                    ))}
                  </RadioGroup>
                </Field>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || (refundable > 0 && action === "none")}>
            {saving ? "Saving…" : "Confirm Deactivation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Ledger Adjustment Modal ---------------- */

function AdjustmentModal({
  studentId, existing, onClose, onSaved,
}: {
  studentId: string;
  existing?: Adjustment | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<"credit" | "charge">(existing && Number(existing.amount) > 0 ? "charge" : "credit");
  const [amount, setAmount] = useState(existing ? String(Math.abs(Number(existing.amount))) : "");
  const [entryDate, setEntryDate] = useState(existing?.entry_date ?? todayISO());
  const [remarks, setRemarks] = useState(existing?.remarks ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    const abs = Number(amount);
    if (!abs || abs <= 0) return toast.error("Amount must be a positive number");
    if (!remarks.trim()) return toast.error("Remarks are required for an adjustment");
    setSaving(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const signed = kind === "credit" ? -abs : abs;
      if (existing) {
        const { error } = await supabase.from("ledger_adjustments")
          .update({ amount: signed, entry_date: entryDate, remarks: remarks.trim() })
          .eq("id", existing.id);
        if (error) throw new Error(error.message);
        const d = diffValues(
          { amount: existing.amount, entry_date: existing.entry_date, remarks: existing.remarks },
          { amount: signed, entry_date: entryDate, remarks: remarks.trim() },
        );
        await logAudit({
          action: "update", entity: "adjustment", entityId: existing.id, studentId,
          label: remarks.trim(), oldValues: d.old, newValues: d.new,
        });
        toast.success("Adjustment updated");
      } else {
        const { error } = await supabase.from("ledger_adjustments").insert({
          student_id: studentId,
          amount: signed,
          entry_date: entryDate,
          remarks: remarks.trim(),
          created_by: userRes.user?.id ?? null,
        });
        if (error) throw new Error(error.message);
        await logAudit({
          action: "create", entity: "adjustment", studentId, label: remarks.trim(),
          newValues: { amount: signed, entry_date: entryDate, remarks: remarks.trim() },
        });
        toast.success(`${kind === "credit" ? "Credit" : "Charge"} of ${inr(abs)} added to ledger`);
      }
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save adjustment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{existing ? "Edit Ledger Adjustment" : "Add Ledger Adjustment"}</DialogTitle></DialogHeader>

        <div className="space-y-3">
          <Field label="Type">
            <RadioGroup value={kind} onValueChange={(v) => setKind(v as typeof kind)} className="grid grid-cols-2 gap-2">
              <label className={`flex items-center gap-2 border rounded-md px-3 py-2 cursor-pointer text-sm ${kind === "credit" ? "border-primary bg-primary/5" : ""}`}>
                <RadioGroupItem value="credit" />Credit (reduces due)
              </label>
              <label className={`flex items-center gap-2 border rounded-md px-3 py-2 cursor-pointer text-sm ${kind === "charge" ? "border-primary bg-primary/5" : ""}`}>
                <RadioGroupItem value="charge" />Charge (increases due)
              </label>
            </RadioGroup>
          </Field>
          <Field label="Amount (₹)">
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="500" />
          </Field>
          <Field label="Date">
            <DateInput value={entryDate} onChange={setEntryDate} />
          </Field>
          <Field label="Remarks (required)">
            <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="e.g. Waiver for mess closure" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save Adjustment"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


/* ---------------- Holiday / Leave Modal ---------------- */

function HolidayModal({
  studentId, slabs, existing, onClose, onSaved,
}: {
  studentId: string;
  slabs: FeeSlab[];
  existing?: Adjustment | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fromDate, setFromDate] = useState(existing?.from_date ?? todayISO());
  const [toDate, setToDate] = useState(existing?.to_date ?? todayISO());
  const [remarks, setRemarks] = useState(existing?.remarks ?? "");
  const [saving, setSaving] = useState(false);

  const valid = Boolean(fromDate && toDate && toDate >= fromDate);
  const calc = useMemo(
    () => (valid ? computeHolidayDeduction(slabs, fromDate, toDate) : null),
    [valid, slabs, fromDate, toDate],
  );

  async function save() {
    if (!valid) return toast.error("To Date must be on or after From Date");
    if (!calc || calc.missingMonths.length > 0) {
      return toast.error(missingSlabMessage((calc?.missingMonths[0] ?? fromDate)));
    }
    if (calc.amount <= 0) return toast.error("Deduction works out to ₹0 — check the fee slab");
    setSaving(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const payload = {
        amount: -calc.amount,
        entry_date: fromDate,
        from_date: fromDate,
        to_date: toDate,
        kind: "holiday",
        remarks: remarks.trim() || null,
      };
      const label = `Holiday ${formatDMY(fromDate)} → ${formatDMY(toDate)} (${calc.days} days)`;
      if (existing) {
        const { error } = await supabase.from("ledger_adjustments").update(payload).eq("id", existing.id);
        if (error) throw new Error(error.message);
        const d = diffValues(
          { amount: existing.amount, from_date: existing.from_date, to_date: existing.to_date, remarks: existing.remarks },
          { amount: payload.amount, from_date: fromDate, to_date: toDate, remarks: payload.remarks },
        );
        await logAudit({ action: "update", entity: "holiday", entityId: existing.id, studentId, label, oldValues: d.old, newValues: d.new });
        toast.success("Holiday deduction updated");
      } else {
        const { error } = await supabase.from("ledger_adjustments").insert({
          student_id: studentId, created_by: userRes.user?.id ?? null, ...payload,
        });
        if (error) throw new Error(error.message);
        await logAudit({ action: "create", entity: "holiday", studentId, label, newValues: payload });
        toast.success(`Holiday credit of ${inr(calc.amount)} applied`);
      }
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save holiday deduction");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit Holiday / Leave" : "Add Holiday / Leave"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="From Date">
              <DateInput value={fromDate} onChange={setFromDate} />
            </Field>
            <Field label="To Date">
              <DateInput value={toDate} onChange={setToDate} />
            </Field>
          </div>
          <Field label="Remarks (optional)">
            <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="e.g. Went home for Diwali" />
          </Field>

          <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
            {!valid ? (
              <p className="text-destructive">To Date must be on or after From Date.</p>
            ) : calc && calc.missingMonths.length > 0 ? (
              <p className="text-destructive">{missingSlabMessage(calc.missingMonths[0])}</p>
            ) : calc ? (
              <>
                {calc.segments.map((seg) => (
                  <div key={seg.month} className="flex justify-between text-xs text-muted-foreground">
                    <span>
                      {formatMonth(seg.month)} — {seg.days} day{seg.days === 1 ? "" : "s"} ×{" "}
                      {inr(seg.monthlyFee)}/{seg.daysInMonth}
                    </span>
                    <span>−{inr(seg.amount)}</span>
                  </div>
                ))}
                <div className="flex justify-between font-semibold pt-1 border-t">
                  <span>{calc.days} holiday day{calc.days === 1 ? "" : "s"}</span>
                  <span className="text-success">−{inr(calc.amount)}</span>
                </div>
              </>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || !valid}>{saving ? "Saving…" : "Save Holiday Deduction"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


/* ---------------- Security Deposit Modal ---------------- */

const DEPOSIT_MODES: PaymentMode[] = ["cash", "upi", "card", "rtgs", "bank_transfer"];

function DepositModal({
  studentId, kind, held, existing, onClose, onSaved,
}: {
  studentId: string; kind: "received" | "refunded"; held: number;
  existing: Deposit | null; onClose: () => void; onSaved: () => void;
}) {
  const isRefund = kind === "refunded";
  const [amount, setAmount] = useState(
    existing ? String(existing.amount) : isRefund ? String(Math.max(0, held)) : "",
  );
  const [date, setDate] = useState(existing?.entry_date ?? todayISO());
  const [mode, setMode] = useState<PaymentMode>((existing?.mode as PaymentMode) ?? "cash");
  const [remarks, setRemarks] = useState(existing?.remarks ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    const amt = Number(amount);
    if (!amt || Number.isNaN(amt) || amt <= 0) return toast.error("Enter a valid amount");
    setSaving(true);
    const payload = { amount: amt, entry_date: date, mode, remarks: remarks.trim() || null };
    if (existing) {
      const { error } = await supabase.from("security_deposits").update(payload).eq("id", existing.id);
      setSaving(false);
      if (error) return toast.error(error.message);
      const d = diffValues(
        { amount: existing.amount, entry_date: existing.entry_date, mode: existing.mode, remarks: existing.remarks },
        payload,
      );
      await logAudit({
        action: "update", entity: "security_deposit", entityId: existing.id, studentId,
        label: `Deposit ${existing.kind} ${inr(amt)}`, oldValues: d.old, newValues: d.new,
      });
      toast.success("Deposit entry updated");
    } else {
      const { data: auth } = await supabase.auth.getUser();
      const { data: row, error } = await supabase.from("security_deposits").insert({
        student_id: studentId, kind, created_by: auth.user?.id ?? null, ...payload,
      }).select("id").maybeSingle();
      setSaving(false);
      if (error) return toast.error(error.message);
      await logAudit({
        action: "create", entity: "security_deposit", entityId: row?.id ?? null, studentId,
        label: `Deposit ${kind} ${inr(amt)}`, newValues: { kind, ...payload },
      });
      toast.success(isRefund ? "Deposit refund recorded" : "Security deposit recorded");
    }
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit Deposit Entry" : isRefund ? "Refund Security Deposit" : "Add Security Deposit"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {isRefund && !existing && (
            <p className="text-xs text-muted-foreground">Currently held: <b>{inr(held)}</b> — edit the amount for a partial refund.</p>
          )}
          <Field label="Amount *"><Input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label={isRefund ? "Date" : "Date Received"}><DateInput value={date} onChange={setDate} /></Field>
          <Field label="Mode">
            <Select value={mode} onValueChange={(v) => setMode(v as PaymentMode)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DEPOSIT_MODES.map((m) => <SelectItem key={m} value={m} className="uppercase">{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Remarks"><Input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Optional" /></Field>
          <p className="text-xs text-muted-foreground">
            Security deposit is refundable and is never included in billing, payments or dues.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
