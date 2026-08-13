CREATE TABLE public.security_deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('received','refunded')),
  amount numeric NOT NULL CHECK (amount >= 0),
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  mode payment_mode,
  remarks text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_security_deposits_student ON public.security_deposits(student_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.security_deposits TO authenticated;
GRANT ALL ON public.security_deposits TO service_role;

ALTER TABLE public.security_deposits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view deposits" ON public.security_deposits
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can add deposits" ON public.security_deposits
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Admins can update deposits" ON public.security_deposits
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'super_admin'::app_role) OR private.has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'super_admin'::app_role) OR private.has_role(auth.uid(), 'manager'::app_role));
CREATE POLICY "Admins can delete deposits" ON public.security_deposits
  FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'super_admin'::app_role) OR private.has_role(auth.uid(), 'manager'::app_role));

CREATE TRIGGER security_deposits_updated_at BEFORE UPDATE ON public.security_deposits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();