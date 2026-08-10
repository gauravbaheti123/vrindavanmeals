CREATE OR REPLACE FUNCTION public.rebuild_billing_reset()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE n int;
BEGIN
  DELETE FROM public.billing_backfill_log WHERE id IS NOT NULL;
  SELECT count(*) INTO n FROM public.students;
  RETURN n;
END; $function$;

CREATE OR REPLACE FUNCTION public.rebuild_all_billing()
 RETURNS TABLE(students_processed integer, before_total numeric, after_total numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r record; n int := 0; b numeric := 0; a numeric := 0; prev numeric; nowt numeric;
BEGIN
  DELETE FROM public.billing_backfill_log WHERE id IS NOT NULL;
  FOR r IN SELECT id FROM public.students ORDER BY roll_number NULLS LAST LOOP
    SELECT COALESCE(SUM(billed_amount), 0) INTO prev FROM public.subscriptions WHERE student_id = r.id;
    nowt := public.rebuild_student_billing(r.id);
    INSERT INTO public.billing_backfill_log (student_id, before_billed, after_billed)
      VALUES (r.id, prev, nowt);
    n := n + 1; b := b + prev; a := a + nowt;
  END LOOP;
  RETURN QUERY SELECT n, b, a;
END; $function$;