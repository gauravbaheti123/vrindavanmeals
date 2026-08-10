CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id),
  action text NOT NULL CHECK (action IN ('create','update','delete')),
  entity text NOT NULL,
  entity_id uuid,
  student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  label text,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_created_at ON public.audit_log (created_at DESC);
CREATE INDEX idx_audit_log_entity ON public.audit_log (entity);
CREATE INDEX idx_audit_log_student ON public.audit_log (student_id);

GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view audit log"
  ON public.audit_log FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Staff can write audit entries as themselves"
  ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());