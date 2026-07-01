import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Fingerprint } from "lucide-react";

export const Route = createFileRoute("/_authenticated/students/$id")({
  head: () => ({ meta: [{ title: "Student — Vrindavan Meals" }] }),
  component: StudentDetail,
});

function StudentDetail() {
  const { id } = useParams({ from: "/_authenticated/students/$id" });
  const { data, isLoading } = useQuery({
    queryKey: ["student", id],
    queryFn: async () => {
      const [student, subs, pays, mapping] = await Promise.all([
        supabase.from("students").select("*, units(name)").eq("id", id).maybeSingle(),
        supabase.from("subscriptions").select("*").eq("student_id", id).order("created_at", { ascending: false }),
        supabase.from("payments").select("*").eq("student_id", id).order("created_at", { ascending: false }),
        supabase.from("biometric_mappings").select("*").eq("student_id", id).eq("is_active", true).maybeSingle(),
      ]);
      return {
        student: student.data,
        subs: subs.data ?? [],
        pays: pays.data ?? [],
        mapping: mapping.data,
      };
    },
  });

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;
  if (!data?.student) return <div>Student not found.</div>;

  const s = data.student;
  const unit = (s as unknown as { units?: { name: string } }).units;

  return (
    <div className="space-y-6 max-w-4xl">
      <Button asChild variant="ghost" size="sm"><Link to="/students"><ArrowLeft className="h-4 w-4 mr-1" />Students</Link></Button>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">{s.full_name}</h1>
          <p className="text-muted-foreground">{s.mobile} · {unit?.name || "No unit"}</p>
        </div>
        <div className="flex gap-2">
          {data.mapping ? (
            <Badge className="bg-success text-success-foreground"><Fingerprint className="h-3 w-3 mr-1" />Mapped</Badge>
          ) : (
            <Badge variant="outline" className="border-warning"><Fingerprint className="h-3 w-3 mr-1" />Unmapped</Badge>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1.5">
            <Row k="Roll Number" v={s.roll_number} />
            <Row k="Course" v={s.course} />
            <Row k="Batch Year" v={s.batch_year?.toString()} />
            <Row k="Hostel Room" v={s.hostel_room} />
            <Row k="Email" v={s.email} />
            <Row k="Parent Mobile" v={s.parent_mobile} />
            <Row k="Blood Group" v={s.blood_group} />
            <Row k="Address" v={s.address} />
            <Row k="Document" v={s.doc_type ? `${s.doc_type} — ${s.doc_number ?? ""}` : null} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Subscriptions</CardTitle></CardHeader>
          <CardContent className="text-sm">
            {data.subs.length === 0 ? <p className="text-muted-foreground">No subscriptions yet.</p> : (
              <ul className="space-y-2">
                {data.subs.map((sub) => (
                  <li key={sub.id} className="flex justify-between border-b pb-2 last:border-0">
                    <span>{sub.start_date} → {sub.end_date}</span>
                    <Badge variant="outline" className="capitalize">{sub.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Payments</CardTitle></CardHeader>
          <CardContent className="text-sm">
            {data.pays.length === 0 ? <p className="text-muted-foreground">No payments yet.</p> : (
              <ul className="space-y-2">
                {data.pays.map((p) => (
                  <li key={p.id} className="flex justify-between border-b pb-2 last:border-0">
                    <span>₹{p.amount} · {p.mode}</span>
                    <span className="text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Biometric Mapping</CardTitle></CardHeader>
          <CardContent className="text-sm">
            {data.mapping ? (
              <div className="space-y-1">
                <Row k="Device User ID" v={data.mapping.device_user_id} />
                <Row k="Device Name" v={data.mapping.device_name} />
                <Row k="Mapped At" v={data.mapping.mapped_at ? new Date(data.mapping.mapped_at).toLocaleString() : null} />
              </div>
            ) : <p className="text-muted-foreground">No active biometric mapping.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
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
