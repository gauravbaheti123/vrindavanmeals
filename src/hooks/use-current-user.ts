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

    const load = async (uid: string) => {
      const [{ data: r }, { data: p }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", uid),
        supabase.from("profiles").select("id,name,email,unit_id").eq("id", uid).maybeSingle(),
      ]);
      if (!mounted) return;
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
      setUser(session?.user ?? null);
      if (session?.user) {
        setLoading(true);
        load(session.user.id);
      } else {
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
