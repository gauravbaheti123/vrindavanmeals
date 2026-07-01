
-- 1) Drop public anon INSERT on students
DROP POLICY IF EXISTS students_public_selfreg ON public.students;

-- 2) Registration rate limit table (server-managed)
CREATE TABLE IF NOT EXISTS public.registration_rate_limit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS registration_rate_limit_ip_time_idx ON public.registration_rate_limit (ip_hash, created_at DESC);
GRANT ALL ON public.registration_rate_limit TO service_role;
ALTER TABLE public.registration_rate_limit ENABLE ROW LEVEL SECURITY;
-- no policies -> no client access; service_role bypasses RLS

-- 3) Revoke direct EXECUTE on trigger-only SECURITY DEFINER function
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- 4) Explicit write restrictions on user_roles (super_admin only)
CREATE POLICY user_roles_admin_insert ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY user_roles_admin_update ON public.user_roles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY user_roles_admin_delete ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));
