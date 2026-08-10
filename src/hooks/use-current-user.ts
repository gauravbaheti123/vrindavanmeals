import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

export interface CurrentUserData {
  user: User | null;
  loading: boolean;
  roles: AppRole[];
  profile: { id: string; name: string; email: string | null; unit_id: string | null } | null;
}

export function useCurrentUser(): CurrentUserData {
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [profile, setProfile] = useState<CurrentUserData["profile"]>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    // Tracks the user we've already loaded so background auth events
    // (TOKEN_REFRESHED / SIGNED_IN fired on browser tab focus) never re-enter
    // the loading state — that would unmount the page and wipe in-progress forms.
    let loadedUserId: string | null = null;

    const load = async (uid: string) => {
      const [{ data: r }, { data: p }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", uid),
        supabase.from("profiles").select("id,name,email,unit_id").eq("id", uid).maybeSingle(),
      ]);
      if (!mounted) return;
      loadedUserId = uid;
      setRoles((r ?? []).map((row) => row.role as AppRole));
      setProfile(p ?? null);
      setLoading(false);
    };

    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setUser(data.user);
      if (data.user) load(data.user.id);
      else setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      setUser((prev) => (prev?.id === nextUser?.id ? prev : nextUser));

      if (nextUser) {
        // Same user (token refresh / tab focus): refresh roles silently in the
        // background, keeping the current render mounted.
        if (loadedUserId !== nextUser.id) setLoading(true);
        load(nextUser.id);
      } else {
        loadedUserId = null;
        setRoles([]);
        setProfile(null);
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);


  return { user, loading, roles, profile };
}

export const roleFlags = (roles: AppRole[]) => ({
  isSuperAdmin: roles.includes("super_admin"),
  isManager: roles.includes("manager"),
  isCounterStaff: roles.includes("counter_staff"),
  isAccountant: roles.includes("accountant"),
  hasAny: roles.length > 0,
});
