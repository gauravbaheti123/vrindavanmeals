
CREATE TABLE IF NOT EXISTS public.notifications_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
  mobile TEXT NOT NULL,
  template_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  response_data JSONB,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.notifications_log TO authenticated;
GRANT ALL ON public.notifications_log TO service_role;

ALTER TABLE public.notifications_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notif_log_read_staff" ON public.notifications_log FOR SELECT TO authenticated
USING (
  private.has_role(auth.uid(), 'super_admin'::app_role)
  OR private.has_role(auth.uid(), 'manager'::app_role)
  OR private.has_role(auth.uid(), 'accountant'::app_role)
);

CREATE INDEX IF NOT EXISTS idx_notifications_log_student ON public.notifications_log(student_id);
CREATE INDEX IF NOT EXISTS idx_notifications_log_sent_at ON public.notifications_log(sent_at DESC);
