import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { STALE } from "@/lib/query-cache";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Camera, Loader2, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import { getNextMessNo, isValidMessNo, isMessNoAvailable } from "@/lib/mess-no";
import { MAX_PHOTO_BYTES, uploadStudentPhoto } from "@/lib/photos";

export const Route = createFileRoute("/_authenticated/students/new")({
  head: () => ({ meta: [{ title: "Add Student — Vrindavan Meals" }] }),
  component: NewStudent,
});

function NewStudent() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    full_name: "", mobile: "", roll_number: "", college_roll_number: "", course: "",
    hostel_room: "", parent_mobile: "", email: "", blood_group: "", unit_id: "",
    joining_date: new Date().toISOString().slice(0, 10),
  });

  const { data: units } = useQuery({
    queryKey: ["units-active"],
    staleTime: STALE.MASTER,
    queryFn: async () =>
      (await supabase.from("units").select("id,name").eq("is_active", true).order("name")).data ?? [],
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

  function pickPhoto(file: File) {
    if (!file.type.startsWith("image/")) return toast.error("Please choose an image file");
    if (file.size > MAX_PHOTO_BYTES) return toast.error("Photo must be under 2 MB");
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

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
    const { data: created, error } = await supabase.from("students").insert({
      full_name: form.full_name.trim(),
      mobile: mobile || null,
      roll_number: messNo,
      college_roll_number: form.college_roll_number.trim() || null,
      course: form.course || null,
      hostel_room: form.hostel_room || null,
      parent_mobile: form.parent_mobile || null,
      email: form.email || null,
      blood_group: form.blood_group || null,
      unit_id: form.unit_id || null,
      joining_date: form.joining_date || null,
      is_approved: true,
    }).select("id").single();
    if (error || !created) {
      setBusy(false);
      return toast.error(error?.message ?? "Could not add student");
    }
    if (photoFile) {
      try {
        const path = await uploadStudentPhoto(photoFile, created.id);
        await supabase.from("students").update({ photo_url: path }).eq("id", created.id);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Student saved, but photo upload failed");
      }
    }
    setBusy(false);
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
        <p className="text-muted-foreground">Mess No and Full Name are required. Everything else is optional.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Student details</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2 flex items-center gap-4">
              <div className="h-24 w-24 rounded-lg border bg-muted grid place-items-center overflow-hidden">
                {photoPreview ? (
                  <img src={photoPreview} alt="Student photo preview" className="h-full w-full object-cover" />
                ) : (
                  <User className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <div className="space-y-2">
                <input ref={fileRef} type="file" accept="image/*" className="hidden"
                  onChange={(e) => e.target.files?.[0] && pickPhoto(e.target.files[0])} />
                <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                  <Camera className="h-4 w-4 mr-1" />{photoFile ? "Change Photo" : "Upload Photo"}
                </Button>
                {photoFile && (
                  <Button type="button" variant="ghost" size="sm" className="text-destructive"
                    onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}>
                    <Trash2 className="h-4 w-4 mr-1" />Remove
                  </Button>
                )}
                <p className="text-xs text-muted-foreground">Optional · JPG / PNG, max 2 MB</p>
              </div>
            </div>

            <Field label="Mess No *" v={form.roll_number} onChange={(v) => { setMessTouched(true); set("roll_number", v); }} required />
            <Field label="Full Name *" v={form.full_name} onChange={(v) => set("full_name", v)} required />
            <Field label="Mobile" v={form.mobile} onChange={(v) => set("mobile", v)} />
            <Field label="Roll Number" v={form.college_roll_number} onChange={(v) => set("college_roll_number", v)} />
            <Field label="Course" v={form.course} onChange={(v) => set("course", v)} />
            <Field label="Hostel Room" v={form.hostel_room} onChange={(v) => set("hostel_room", v)} />
            <Field label="Parent Mobile" v={form.parent_mobile} onChange={(v) => set("parent_mobile", v)} />
            <Field label="Email" type="email" v={form.email} onChange={(v) => set("email", v)} />
            <Field label="Blood Group" v={form.blood_group} onChange={(v) => set("blood_group", v)} />
            <Field label="Joining Date" type="date" v={form.joining_date} onChange={(v) => set("joining_date", v)} />
            <div className="space-y-2">
              <Label>Unit</Label>
              <Select value={form.unit_id} onValueChange={(v) => set("unit_id", v)}>
                <SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger>
                <SelectContent>{units?.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
              </Select>
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
      {type === "date" ? (
        <DateInput value={v} onChange={onChange} />
      ) : (
        <Input type={type} value={v} required={required} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}
