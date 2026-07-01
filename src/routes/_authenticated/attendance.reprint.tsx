import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Printer } from "lucide-react";
import { printToken, type TokenData } from "@/lib/token-print";
import { useCurrentUser } from "@/hooks/use-current-user";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/attendance/reprint")({
  head: () => ({ meta: [{ title: "Reprint Queue — Vrindavan Meals" }] }),
  component: Reprint,
});

function Reprint() {
  const [confirm, setConfirm] = useState<{ token: TokenData } | null>(null);
  const [pw, setPw] = useState("");
  const [reason, setReason] = useState("");
  const { user } = useCurrentUser();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["reprint-queue"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase.from("attendance")
        .select("id, meal_type, scan_time, token_number, token_printed, students(id, full_name, roll_number, mobile), units(name)")
        .eq("scan_date", today).eq("token_printed", false).order("scan_time", { ascending: false });
      return data ?? [];
    },
  });

  async function doReprint() {
    if (!confirm) return;
    if (!pw) return toast.error("Enter authorization password");
    const { data: session } = await supabase.auth.getSession();
    const email = session.session?.user.email;
    if (!email) return toast.error("Not signed in");
    const { error: signErr } = await supabase.auth.signInWithPassword({ email, password: pw });
    if (signErr) return toast.error("Incorrect password");

    await supabase.from("token_reprints").insert({
      attendance_id: confirm.token.attendance_id, reprinted_by: user?.id ?? null, reason: reason || "manual",
    });
    printToken(confirm.token);
    qc.invalidateQueries({ queryKey: ["reprint-queue"] });
    setConfirm(null); setPw(""); setReason("");
    toast.success("Reprint logged");
  }

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm"><Link to="/attendance"><ArrowLeft className="h-4 w-4 mr-1" />Back</Link></Button>
      <div>
        <h1 className="text-3xl font-bold">Reprint Queue</h1>
        <p className="text-muted-foreground">Tokens that failed to print today.</p>
      </div>
      <Card>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Student</TableHead><TableHead>Meal</TableHead>
            <TableHead>Token</TableHead><TableHead>Scan Time</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {(data ?? []).length === 0
              ? <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No pending reprints.</TableCell></TableRow>
              : (data ?? []).map((r) => {
                const row = r as { id: string; meal_type: "lunch" | "dinner"; scan_time: string; token_number: number; students?: { id: string; full_name: string; roll_number: string | null; mobile: string }; units?: { name: string } };
                const unitPrefix = (row.units?.name ?? "1").replace(/[^0-9]/g, "") || "1";
                const token_label = `U${unitPrefix}-${row.meal_type === "lunch" ? "L" : "D"}-${String(row.token_number).padStart(3, "0")}`;
                const tok: TokenData = {
                  attendance_id: row.id, student_name: row.students?.full_name ?? "—",
                  roll_number: row.students?.roll_number ?? null, unit: row.units?.name ?? "",
                  meal_type: row.meal_type, token_number: row.token_number, token_label,
                  scan_time: row.scan_time, student_mobile: row.students?.mobile,
                  student_id: row.students?.id ?? null,
                };
                return (
                  <TableRow key={row.id}>
                    <TableCell>{row.students?.full_name}</TableCell>
                    <TableCell className="capitalize">{row.meal_type}</TableCell>
                    <TableCell className="font-mono">{token_label}</TableCell>
                    <TableCell>{new Date(row.scan_time).toLocaleTimeString("en-IN")}</TableCell>
                    <TableCell>
                      <Button size="sm" onClick={() => setConfirm({ token: tok })}>
                        <Printer className="h-4 w-4 mr-1" />Reprint
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={!!confirm} onOpenChange={() => setConfirm(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirm Reprint</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Re-enter your password to authorize the reprint.</p>
            <div className="space-y-2"><Label>Password</Label><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
            <div className="space-y-2"><Label>Reason (optional)</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button onClick={doReprint}>Authorize & Print</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
