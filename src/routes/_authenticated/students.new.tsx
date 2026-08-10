import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getNextMessNo, isValidMessNo, isMessNoAvailable } from "@/lib/mess-no";

export const Route = createFileRoute("/_authenticated/students/new")({
  head: () => ({ meta: [{ title: "Add Student — Vrindavan Meals" }] }),
  component: NewStudent,
});

function NewStudent() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    full_name: "", mobile: "", roll_number: "", course: "", hostel_room: "",
    parent_mobile: "", email: "", batch_year: "", blood_group: "", address: "",
    doc_type: "" as "" | "college_id" | "aadhar", doc_number: "", unit_id: "",
  });

  const { data: units } = useQuery({
    queryKey: ["units"],
    queryFn: async () => (await supabase.from("units").select("id,name").order("name")).data ?? [],
  });

  const { data: suggested } = useQuery({
    queryKey: ["next-mess-no"],
    queryFn: getNextMessNo,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
  const [messTouched, setMessTouched] = useState(false);
  useEffect(() => {
    if (suggested && !messTouched && !form.roll_number) setForm((f) => ({ ...f, roll_number: suggested }));
  }, [suggested, messTouched, form.roll_number]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim()) return toast.error("Full name is required");
    const messNo = form.roll_number.trim();
    if (!messNo) return toast.error("Mess No is required");
    if (!isValidMessNo(messNo)) return toast.error("Mess No must follow format VM-0001");
    const mobile = form.mobile.trim();
    if (mobile && !/^\d{10}$/.test(mobile.replace(/\D/g, "").slice(-10))) {
      return toast.error("Mobile must be a 10-digit number");
    }
    setBusy(true);
    if (!(await isMessNoAvailable(messNo))) {
      setBusy(false);
      return toast.error("Mess No already in use — duplicate");
    }
    const { error } = await supabase.from("students").insert({
      full_name: form.full_name.trim(),
      mobile: mobile || null,
      roll_number: messNo,
      course: form.course || null,
      hostel_room: form.hostel_room || null,
      parent_mobile: form.parent_mobile || null,
      email: form.email || null,
      batch_year: form.batch_year ? Number(form.batch_year) : null,
      blood_group: form.blood_group || null,
      address: form.address || null,
      doc_type: form.doc_type || null,
      doc_number: form.doc_number || null,
      unit_id: form.unit_id || null,
      is_approved: true,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Student added");
    navigate({ to: "/students" });
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm"><Link to="/students"><ArrowLeft className="h-4 w-4 mr-1" />Back</Link></Button>
      </div>
      <div>
        <h1 className="text-3xl font-bold">Add Student</h1>
        <p className="text-muted-foreground">Mess No and Full Name are required. Mobile is optional.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Student details</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
            <Field label="Mess No *" v={form.roll_number} onChange={(v) => { setMessTouched(true); set("roll_number", v); }} required />
            <Field label="Full Name *" v={form.full_name} onChange={(v) => set("full_name", v)} required />
            <Field label="Mobile" v={form.mobile} onChange={(v) => set("mobile", v)} />
            <Field label="Course" v={form.course} onChange={(v) => set("course", v)} />
            <Field label="Hostel Room" v={form.hostel_room} onChange={(v) => set("hostel_room", v)} />
            <Field label="Parent Mobile" v={form.parent_mobile} onChange={(v) => set("parent_mobile", v)} />
            <Field label="Email" type="email" v={form.email} onChange={(v) => set("email", v)} />
            <Field label="Batch Year" type="number" v={form.batch_year} onChange={(v) => set("batch_year", v)} />
            <Field label="Blood Group" v={form.blood_group} onChange={(v) => set("blood_group", v)} />
            <div className="space-y-2">
              <Label>Unit</Label>
              <Select value={form.unit_id} onValueChange={(v) => set("unit_id", v)}>
                <SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger>
                <SelectContent>{units?.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>ID Document Type</Label>
              <Select value={form.doc_type} onValueChange={(v: "college_id" | "aadhar") => set("doc_type", v)}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="college_id">College ID</SelectItem>
                  <SelectItem value="aadhar">Aadhaar</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Field label="Document Number" v={form.doc_number} onChange={(v) => set("doc_number", v)} />
            <div className="md:col-span-2 space-y-2">
              <Label>Address</Label>
              <Input value={form.address} onChange={(e) => set("address", e.target.value)} />
            </div>
            <div className="md:col-span-2 flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" asChild><Link to="/students">Cancel</Link></Button>
              <Button type="submit" disabled={busy}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save Student
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, v, onChange, type = "text", required }: { label: string; v: string; onChange: (v: string) => void; type?: string; required?: boolean }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type={type} value={v} required={required} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
