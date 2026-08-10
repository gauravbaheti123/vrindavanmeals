import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Check, X } from "lucide-react";
import { toast } from "sonner";
import { StudentPhoto } from "@/components/student-photo";

export const Route = createFileRoute("/_authenticated/students/pending")({
  head: () => ({ meta: [{ title: "Pending Approvals — Vrindavan Meals" }] }),
  component: Pending,
});

function Pending() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["students-pending"],
    queryFn: async () => (await supabase.from("students").select("*").eq("is_approved", false).order("created_at", { ascending: false })).data ?? [],
  });

  const approve = async (id: string) => {
    const { error } = await supabase.from("students").update({ is_approved: true }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Student approved");
    qc.invalidateQueries({ queryKey: ["students-pending"] });
    qc.invalidateQueries({ queryKey: ["students-pending-count"] });
  };
  const reject = async (id: string) => {
    if (!confirm("Reject and delete this registration?")) return;
    const { error } = await supabase.from("students").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Registration rejected");
    qc.invalidateQueries({ queryKey: ["students-pending"] });
    qc.invalidateQueries({ queryKey: ["students-pending-count"] });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm"><Link to="/students"><ArrowLeft className="h-4 w-4 mr-1" />Students</Link></Button>
      </div>
      <div>
        <h1 className="text-3xl font-bold">Pending Approvals</h1>
        <p className="text-muted-foreground">Student self-registrations awaiting review.</p>
      </div>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[70px]">Photo</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Mobile</TableHead>
              <TableHead>Roll No.</TableHead>
              <TableHead>Course</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
            ) : data?.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No pending registrations.</TableCell></TableRow>
            ) : data?.map((s) => (
              <TableRow key={s.id}>
                <TableCell><StudentPhoto path={s.photo_url} size={44} /></TableCell>
                <TableCell className="font-medium">{s.full_name}</TableCell>
                <TableCell>{s.mobile}</TableCell>
                <TableCell>{(s as unknown as { college_roll_number?: string | null }).college_roll_number || "—"}</TableCell>
                <TableCell>{s.course || "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{new Date(s.created_at).toLocaleDateString()}</TableCell>
                <TableCell className="text-right space-x-2">
                  <Button size="sm" onClick={() => approve(s.id)}><Check className="h-4 w-4 mr-1" />Approve</Button>
                  <Button size="sm" variant="outline" onClick={() => reject(s.id)}><X className="h-4 w-4 mr-1" />Reject</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
