import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UtensilsCrossed, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/register")({
  head: () => ({ meta: [{ title: "Student Registration — Vrindavan Meals" }] }),
  component: RegisterPage,
});

function RegisterPage() {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [form, setForm] = useState({
    full_name: "", mobile: "", roll_number: "", course: "", hostel_room: "",
    parent_mobile: "", email: "", unit_id: "",
  });
  const set = <K extends keyof typeof form>(k: K, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const { data: units } = useQuery({
    queryKey: ["public-units"],
    queryFn: async () => (await supabase.from("units").select("id,name").order("name")).data ?? [],
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim() || !form.mobile.trim()) return toast.error("Name and mobile are required");
    setBusy(true);
    const { error } = await supabase.from("students").insert({
      full_name: form.full_name.trim(),
      mobile: form.mobile.trim(),
      roll_number: form.roll_number || null,
      course: form.course || null,
      hostel_room: form.hostel_room || null,
      parent_mobile: form.parent_mobile || null,
      email: form.email || null,
      unit_id: form.unit_id || null,
      is_approved: false,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setDone(true);
  };

  if (done) {
    return (
      <div className="min-h-screen grid place-items-center px-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-8 space-y-3">
            <CheckCircle2 className="h-12 w-12 text-success mx-auto" />
            <h2 className="text-xl font-semibold">Registration submitted</h2>
            <p className="text-muted-foreground text-sm">
              Your details have been sent for approval. You'll be notified once approved.
            </p>
            <Button asChild variant="outline"><Link to="/">Back to home</Link></Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-accent/40 py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <Link to="/" className="flex items-center gap-2 justify-center">
          <div className="h-10 w-10 rounded-lg bg-primary text-primary-foreground grid place-items-center">
            <UtensilsCrossed className="h-5 w-5" />
          </div>
          <span className="font-semibold text-xl">Vrindavan Meals</span>
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>Student Registration</CardTitle>
            <CardDescription>Submit your details. Admin will review and approve.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
              <F label="Full Name *" v={form.full_name} onChange={(v) => set("full_name", v)} required />
              <F label="Mobile *" v={form.mobile} onChange={(v) => set("mobile", v)} required />
              <F label="Roll Number" v={form.roll_number} onChange={(v) => set("roll_number", v)} />
              <F label="Course" v={form.course} onChange={(v) => set("course", v)} />
              <F label="Hostel Room" v={form.hostel_room} onChange={(v) => set("hostel_room", v)} />
              <F label="Parent Mobile" v={form.parent_mobile} onChange={(v) => set("parent_mobile", v)} />
              <F label="Email" type="email" v={form.email} onChange={(v) => set("email", v)} />
              <div className="space-y-2">
                <Label>Unit</Label>
                <Select value={form.unit_id} onValueChange={(v) => set("unit_id", v)}>
                  <SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger>
                  <SelectContent>{units?.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2 flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" asChild><Link to="/">Cancel</Link></Button>
                <Button type="submit" disabled={busy}>
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Submit for approval
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function F({ label, v, onChange, type = "text", required }: { label: string; v: string; onChange: (v: string) => void; type?: string; required?: boolean }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type={type} value={v} required={required} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
