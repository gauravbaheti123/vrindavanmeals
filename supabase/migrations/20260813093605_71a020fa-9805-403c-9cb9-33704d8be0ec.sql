-- audit_log: no client-side inserts; only backend (service role) may write
DROP POLICY IF EXISTS "Staff can write audit entries as themselves" ON public.audit_log;
REVOKE INSERT, UPDATE, DELETE ON public.audit_log FROM authenticated;
GRANT ALL ON public.audit_log TO service_role;

-- role_permissions: remove the blanket read; users may only see their own role's rows
DROP POLICY IF EXISTS "perms_read" ON public.role_permissions;
CREATE POLICY "Users read own role permissions" ON public.role_permissions
FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), role));

-- system_settings: remove the blanket read (staff-only policy already exists)
DROP POLICY IF EXISTS "settings_read" ON public.system_settings;