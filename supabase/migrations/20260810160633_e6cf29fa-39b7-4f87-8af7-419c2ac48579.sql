CREATE OR REPLACE FUNCTION public.rebuild_billing_reset()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE n int;
BEGIN
  DELETE FROM public.billing_backfill_log;
  SELECT count(*) INTO n FROM public.students;
  RETURN n;
END; $$;

CREATE OR REPLACE FUNCTION public.rebuild_billing_batch(p_offset integer, p_limit integer)
RETURNS TABLE(students_processed integer, before_total numeric, after_total numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r record; n int := 0; b numeric := 0; a numeric := 0; prev numeric; nowt numeric;
BEGIN
  FOR r IN
    SELECT id FROM public.students
    ORDER BY roll_number NULLS LAST, id
    OFFSET GREATEST(p_offset, 0) LIMIT GREATEST(p_limit, 1)
  LOOP
    SELECT COALESCE(SUM(billed_amount), 0) INTO prev FROM public.subscriptions WHERE student_id = r.id;
    nowt := public.rebuild_student_billing(r.id);
    INSERT INTO public.billing_backfill_log (student_id, before_billed, after_billed)
      VALUES (r.id, prev, nowt);
    n := n + 1; b := b + prev; a := a + COALESCE(nowt, 0);
  END LOOP;
  RETURN QUERY SELECT n, b, a;
END; $$;

REVOKE ALL ON FUNCTION public.rebuild_billing_reset() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rebuild_billing_batch(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_billing_reset() TO service_role;
GRANT EXECUTE ON FUNCTION public.rebuild_billing_batch(integer, integer) TO service_role;