CREATE OR REPLACE FUNCTION public.enforce_deposit_non_negative()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_student uuid; v_held numeric;
BEGIN
  v_student := COALESCE(NEW.student_id, OLD.student_id);
  SELECT COALESCE(SUM(CASE WHEN kind = 'refunded' THEN -amount ELSE amount END), 0)
    INTO v_held FROM public.security_deposits WHERE student_id = v_student;
  IF v_held < 0 THEN
    RAISE EXCEPTION 'Security deposit held cannot be negative (would be %). Refunds cannot exceed the amount received.', v_held
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS security_deposits_non_negative ON public.security_deposits;
CREATE CONSTRAINT TRIGGER security_deposits_non_negative
AFTER INSERT OR UPDATE OR DELETE ON public.security_deposits
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION public.enforce_deposit_non_negative();