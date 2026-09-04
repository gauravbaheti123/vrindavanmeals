CREATE OR REPLACE FUNCTION public.student_total_due(p_student uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT GREATEST(
    COALESCE((SELECT SUM(COALESCE(billed_amount, 0)) FROM public.subscriptions WHERE student_id = p_student), 0)
    + COALESCE((SELECT opening_balance FROM public.students WHERE id = p_student), 0)
    + COALESCE((SELECT SUM(amount) FROM public.ledger_adjustments WHERE student_id = p_student), 0)
    - COALESCE((SELECT SUM(amount) FROM public.payments WHERE student_id = p_student AND status = 'success'), 0)
  , 0)
$$;

REVOKE ALL ON FUNCTION public.student_total_due(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.student_total_due(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enforce_no_deactivate_with_due()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_due numeric;
BEGIN
  IF NEW.exit_date IS NOT NULL AND OLD.exit_date IS DISTINCT FROM NEW.exit_date THEN
    v_due := public.student_total_due(NEW.id);
    IF v_due > 0 THEN
      RAISE EXCEPTION 'This student has % outstanding due. Settle the balance to 0 before deactivating.', round(v_due)
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.enforce_no_deactivate_with_due() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS students_block_deactivate_with_due ON public.students;
CREATE TRIGGER students_block_deactivate_with_due
BEFORE UPDATE ON public.students
FOR EACH ROW EXECUTE FUNCTION public.enforce_no_deactivate_with_due();