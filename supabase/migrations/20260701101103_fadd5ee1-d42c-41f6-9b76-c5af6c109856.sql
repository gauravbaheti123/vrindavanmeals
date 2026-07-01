
-- Import logs table
CREATE TABLE public.import_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_type text NOT NULL,
  file_name text,
  total_rows integer NOT NULL DEFAULT 0,
  imported_rows integer NOT NULL DEFAULT 0,
  skipped_rows integer NOT NULL DEFAULT 0,
  error_rows integer NOT NULL DEFAULT 0,
  error_report jsonb,
  imported_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.import_logs TO authenticated;
GRANT ALL ON public.import_logs TO service_role;

ALTER TABLE public.import_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "import_logs_read_admin_manager"
ON public.import_logs FOR SELECT TO authenticated
USING (private.has_role(auth.uid(),'super_admin') OR private.has_role(auth.uid(),'manager'));

CREATE POLICY "import_logs_insert_admin_manager"
ON public.import_logs FOR INSERT TO authenticated
WITH CHECK (private.has_role(auth.uid(),'super_admin') OR private.has_role(auth.uid(),'manager'));
