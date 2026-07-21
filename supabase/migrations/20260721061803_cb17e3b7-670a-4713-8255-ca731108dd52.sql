
-- notifications_log: explicit deny for client-role writes (service_role bypasses RLS)
REVOKE INSERT, UPDATE, DELETE ON public.notifications_log FROM anon, authenticated;

CREATE POLICY "notif_log_no_client_insert" ON public.notifications_log
  AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY "notif_log_no_client_update" ON public.notifications_log
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "notif_log_no_client_delete" ON public.notifications_log
  AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false);

-- registration_rate_limit: enable RLS and deny all client access (server-only)
ALTER TABLE public.registration_rate_limit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.registration_rate_limit FROM anon, authenticated;
GRANT ALL ON public.registration_rate_limit TO service_role;

CREATE POLICY "rate_limit_no_client_access" ON public.registration_rate_limit
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
