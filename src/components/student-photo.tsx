import { useRef, useState } from "react";
import { Camera, Loader2, Trash2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { removeStudentPhoto, uploadStudentPhoto, useStudentPhotoUrl } from "@/lib/photos";

export function StudentPhoto({ path, size = 96 }: { path: string | null | undefined; size?: number }) {
  const url = useStudentPhotoUrl(path);
  return (
    <div
      className="rounded-lg overflow-hidden bg-muted grid place-items-center shrink-0 border"
      style={{ width: size, height: size }}
    >
      {url ? (
        <img src={url} alt="Student photo" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <User className="h-1/3 w-1/3 text-muted-foreground" />
      )}
    </div>
  );
}

/** Photo with upload / remove controls, persisting students.photo_url. */
export function StudentPhotoEditor({
  studentId, path, onChanged, size = 112,
}: { studentId: string; path: string | null | undefined; onChanged: () => void; size?: number }) {
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function pick(file: File) {
    setBusy(true);
    try {
      const newPath = await uploadStudentPhoto(file, studentId);
      const { error } = await supabase.from("students").update({ photo_url: newPath }).eq("id", studentId);
      if (error) throw new Error(error.message);
      if (path && !path.startsWith("http")) await removeStudentPhoto(path);
      toast.success("Photo updated");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true);
    try {
      const { error } = await supabase.from("students").update({ photo_url: null }).eq("id", studentId);
      if (error) throw new Error(error.message);
      if (path && !path.startsWith("http")) await removeStudentPhoto(path);
      toast.success("Photo removed");
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <StudentPhoto path={path} size={size} />
      <div className="flex flex-col gap-2 print:hidden">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])}
        />
        <Button size="sm" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Camera className="h-3 w-3 mr-1" />}
          {path ? "Change Photo" : "Upload Photo"}
        </Button>
        {path && (
          <Button size="sm" variant="ghost" className="text-destructive" disabled={busy} onClick={clear}>
            <Trash2 className="h-3 w-3 mr-1" />Remove
          </Button>
        )}
        <span className="text-[11px] text-muted-foreground">JPG / PNG, max 2 MB</span>
      </div>
    </div>
  );
}
