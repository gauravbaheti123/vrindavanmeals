
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role); $$;

CREATE OR REPLACE FUNCTION private.current_user_unit()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT unit_id FROM public.profiles WHERE id = auth.uid(); $$;

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.current_user_unit() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.current_user_unit() TO authenticated, service_role;

-- Drop every policy that references the public helpers
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (qual ILIKE '%has_role%' OR qual ILIKE '%current_user_unit%'
        OR with_check ILIKE '%has_role%' OR with_check ILIKE '%current_user_unit%')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- Recreate policies pointing at private helpers
CREATE POLICY profiles_self_read ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR private.has_role(auth.uid(),'super_admin') OR private.has_role(auth.uid(),'manager'));
CREATE POLICY profiles_self_update ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR private.has_role(auth.uid(),'super_admin'));
CREATE POLICY profiles_admin_insert ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid() OR private.has_role(auth.uid(),'super_admin'));
CREATE POLICY profiles_admin_delete ON public.profiles FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(),'super_admin'));

CREATE POLICY roles_read_own_or_admin ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.has_role(auth.uid(),'super_admin'));
CREATE POLICY user_roles_admin_insert ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(),'super_admin'));
CREATE POLICY user_roles_admin_update ON public.user_roles FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(),'super_admin')) WITH CHECK (private.has_role(auth.uid(),'super_admin'));
CREATE POLICY user_roles_admin_delete ON public.user_roles FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(),'super_admin'));

CREATE POLICY units_admin_ins ON public.units FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(),'super_admin'));
CREATE POLICY units_admin_upd ON public.units FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(),'super_admin'));
CREATE POLICY units_admin_del ON public.units FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(),'super_admin'));

CREATE POLICY plans_write ON public.subscription_plans FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'super_admin')) WITH CHECK (private.has_role(auth.uid(),'super_admin'));
CREATE POLICY windows_write ON public.meal_windows FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'super_admin')) WITH CHECK (private.has_role(auth.uid(),'super_admin'));
CREATE POLICY settings_write ON public.system_settings FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'super_admin')) WITH CHECK (private.has_role(auth.uid(),'super_admin'));
CREATE POLICY perms_write ON public.role_permissions FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'super_admin')) WITH CHECK (private.has_role(auth.uid(),'super_admin'));

CREATE POLICY students_read ON public.students FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(),'super_admin') OR private.has_role(auth.uid(),'manager') OR private.has_role(auth.uid(),'accountant') OR (private.has_role(auth.uid(),'counter_staff') AND unit_id = private.current_user_unit()));
CREATE POLICY students_admin_ins ON public.students FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(),'super_admin') OR private.has_role(auth.uid(),'manager'));
CREATE POLICY students_admin_upd ON public.students FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(),'super_admin') OR private.has_role(auth.uid(),'manager'));
CREATE POLICY students_admin_del ON public.students FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(),'super_admin'));

CREATE POLICY subs_read ON public.subscriptions FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(),'super_admin') OR private.has_role(auth.uid(),'manager') OR private.has_role(auth.uid(),'accountant') OR (private.has_role(auth.uid(),'counter_staff') AND unit_id = private.current_user_unit()));
CREATE POLICY subs_write ON public.subscriptions FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'super_admin') OR private.has_role(auth.uid(),'manager'))
  WITH CHECK (private.has_role(auth.uid(),'super_admin') OR private.has_role(auth.uid(),'manager'));

CREATE POLICY pay_read ON public.payments FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(),'super_admin') OR private.has_role(auth.uid(),'manager') OR private.has_role(auth.uid(),'accountant') OR private.has_role(auth.uid(),'counter_staff'));
CREATE POLICY pay_insert ON public.payments FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(),'super_admin') OR private.has_role(auth.uid(),'accountant') OR private.has_role(auth.uid(),'counter_staff'));
CREATE POLICY pay_update ON public.payments FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(),'super_admin') OR private.has_role(auth.uid(),'accountant'));

CREATE POLICY att_read ON public.attendance FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(),'super_admin') OR private.has_role(auth.uid(),'manager') OR (private.has_role(auth.uid(),'counter_staff') AND unit_id = private.current_user_unit()));
CREATE POLICY att_write ON public.attendance FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(),'super_admin') OR (private.has_role(auth.uid(),'counter_staff') AND unit_id = private.current_user_unit()));

CREATE POLICY reprint_read ON public.token_reprints FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(),'super_admin') OR private.has_role(auth.uid(),'manager') OR private.has_role(auth.uid(),'counter_staff'));
CREATE POLICY reprint_write ON public.token_reprints FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(),'super_admin') OR private.has_role(auth.uid(),'counter_staff'));

CREATE POLICY bio_read ON public.biometric_mappings FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(),'super_admin') OR private.has_role(auth.uid(),'manager'));
CREATE POLICY bio_write ON public.biometric_mappings FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'super_admin') OR private.has_role(auth.uid(),'manager'))
  WITH CHECK (private.has_role(auth.uid(),'super_admin') OR private.has_role(auth.uid(),'manager'));

CREATE POLICY unmap_read ON public.unmapped_scans FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(),'super_admin') OR private.has_role(auth.uid(),'manager'));
CREATE POLICY unmap_write ON public.unmapped_scans FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(),'super_admin') OR private.has_role(auth.uid(),'manager'));
CREATE POLICY unmap_update ON public.unmapped_scans FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(),'super_admin') OR private.has_role(auth.uid(),'manager'))
  WITH CHECK (private.has_role(auth.uid(),'super_admin') OR private.has_role(auth.uid(),'manager'));

-- Now safe to drop the public-schema helpers
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);
DROP FUNCTION IF EXISTS public.current_user_unit();
