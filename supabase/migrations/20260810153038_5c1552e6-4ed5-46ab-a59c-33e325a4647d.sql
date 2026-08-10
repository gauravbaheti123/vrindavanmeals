CREATE OR REPLACE FUNCTION public.fee_for_month(p_month date)
RETURNS numeric LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT f.monthly_fee FROM public.fee_settings f
  WHERE date_trunc('month', p_month)::date >= f.effective_month
    AND (f.effective_to_month IS NULL OR date_trunc('month', p_month)::date <= f.effective_to_month)
  ORDER BY f.effective_month DESC LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.rebuild_all_billing()
RETURNS TABLE(students_processed int, before_total numeric, after_total numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n int := 0; b numeric := 0; a numeric := 0; prev numeric; nowt numeric;
BEGIN
  DELETE FROM public.billing_backfill_log;
  FOR r IN SELECT id FROM public.students ORDER BY roll_number NULLS LAST LOOP
    SELECT COALESCE(SUM(billed_amount), 0) INTO prev FROM public.subscriptions WHERE student_id = r.id;
    nowt := public.rebuild_student_billing(r.id);
    INSERT INTO public.billing_backfill_log (student_id, before_billed, after_billed)
      VALUES (r.id, prev, nowt);
    n := n + 1; b := b + prev; a := a + nowt;
  END LOOP;
  RETURN QUERY SELECT n, b, a;
END; $$;

REVOKE ALL ON FUNCTION public.rebuild_all_billing() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_all_billing() TO service_role;
REVOKE ALL ON FUNCTION public.accrue_monthly_billing() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accrue_monthly_billing() TO service_role;
REVOKE ALL ON FUNCTION public.rebuild_student_billing(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_student_billing(uuid) TO service_role;