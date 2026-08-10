import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const PHOTO_BUCKET = "student-photos";
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024; // 2 MB

/** Upload (or replace) a student photo. Returns the storage path to save in students.photo_url. */
export async function uploadStudentPhoto(file: File, studentId: string): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file (JPG or PNG)");
  if (file.size > MAX_PHOTO_BYTES) throw new Error("Photo must be under 2 MB");
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${studentId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: true,
  });
  if (error) throw new Error(error.message);
  return path;
}

export async function removeStudentPhoto(path: string) {
  await supabase.storage.from(PHOTO_BUCKET).remove([path]);
}

export async function signedPhotoUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

/** Signed URL for a stored photo path (private bucket). */
export function useStudentPhotoUrl(path: string | null | undefined) {
  const { data } = useQuery({
    queryKey: ["student-photo", path],
    queryFn: () => signedPhotoUrl(path),
    enabled: !!path,
    staleTime: 50 * 60 * 1000,
  });
  return data ?? null;
}

/** Read a File into a base64 data URL (used by public registration → server upload). */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Could not read the selected file"));
    r.readAsDataURL(file);
  });
}
