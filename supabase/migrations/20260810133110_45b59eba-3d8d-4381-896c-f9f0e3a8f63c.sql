ALTER TABLE public.students ADD COLUMN IF NOT EXISTS college_roll_number text;

ALTER TYPE public.payment_mode ADD VALUE IF NOT EXISTS 'rtgs';
ALTER TYPE public.payment_mode ADD VALUE IF NOT EXISTS 'bank_transfer';

CREATE TABLE public.ledger_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  remarks text,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ledger_adjustments TO authenticated;
GRANT ALL ON public.ledger_adjustments TO service_role;

ALTER TABLE public.ledger_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view adjustments"
  ON public.ledger_adjustments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can add adjustments"
  ON public.ledger_adjustments FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Admins can update adjustments"
  ON public.ledger_adjustments FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'super_admin') OR private.has_role(auth.uid(), 'manager'))
  WITH CHECK (private.has_role(auth.uid(), 'super_admin') OR private.has_role(auth.uid(), 'manager'));
CREATE POLICY "Admins can delete adjustments"
  ON public.ledger_adjustments FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'super_admin') OR private.has_role(auth.uid(), 'manager'));

CREATE INDEX idx_ledger_adjustments_student ON public.ledger_adjustments(student_id);

CREATE TABLE public.fee_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monthly_fee numeric NOT NULL CHECK (monthly_fee > 0),
  effective_month date NOT NULL UNIQUE,
  effective_to_month date,
  is_active boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fee_settings TO authenticated;
GRANT ALL ON public.fee_settings TO service_role;

ALTER TABLE public.fee_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view fee settings"
  ON public.fee_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage fee settings insert"
  ON public.fee_settings FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Admins manage fee settings update"
  ON public.fee_settings FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (private.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Admins manage fee settings delete"
  ON public.fee_settings FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER fee_settings_updated_at BEFORE UPDATE ON public.fee_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.fee_settings (monthly_fee, effective_month, effective_to_month, is_active) VALUES
  (2300, DATE '2025-12-01', DATE '2025-12-01', false),
  (2400, DATE '2026-01-01', DATE '2026-04-01', false),
  (2700, DATE '2026-05-01', NULL, true);