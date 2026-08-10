CREATE OR REPLACE FUNCTION public.fee_for_month(p_month date)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT f.monthly_fee FROM public.fee_settings f
  WHERE date_trunc('month', p_month)::date >= f.effective_month
    AND (f.effective_to_month IS NULL OR date_trunc('month', p_month)::date <= f.effective_to_month)
  ORDER BY f.effective_month DESC LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.fee_for_month(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fee_for_month(date) TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.billing_backfill_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at timestamptz NOT NULL DEFAULT now(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  before_billed numeric NOT NULL DEFAULT 0,
  after_billed numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.billing_backfill_log TO authenticated;
GRANT ALL ON public.billing_backfill_log TO service_role;
ALTER TABLE public.billing_backfill_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can read billing rebuild log" ON public.billing_backfill_log;
CREATE POLICY "Authenticated can read billing rebuild log" ON public.billing_backfill_log
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.rebuild_student_billing(p_student uuid)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  st public.students%ROWTYPE;
  v_plan uuid; v_grace int; m date; last_m date; join_m date;
  fee numeric; amt numeric; s_date date; e_date date; total numeric := 0;
BEGIN
  SELECT * INTO st FROM public.students WHERE id = p_student;
  IF NOT FOUND OR st.joining_date IS NULL THEN RETURN 0; END IF;

  SELECT id INTO v_plan FROM public.subscription_plans WHERE is_active ORDER BY created_at LIMIT 1;
  IF v_plan IS NULL THEN SELECT id INTO v_plan FROM public.subscription_plans ORDER BY created_at LIMIT 1; END IF;
  IF v_plan IS NULL THEN RETURN 0; END IF;

  SELECT COALESCE(NULLIF(value,'')::int, 5) INTO v_grace FROM public.system_settings WHERE key = 'grace_period_days';
  v_grace := COALESCE(v_grace, 5);

  UPDATE public.payments SET subscription_id = NULL WHERE student_id = p_student;
  DELETE FROM public.subscriptions WHERE student_id = p_student;

  join_m := date_trunc('month', st.joining_date)::date;
  last_m := date_trunc('month', COALESCE(st.exit_date, CURRENT_DATE))::date;
  m := join_m;

  WHILE m <= last_m LOOP
    fee := COALESCE(public.fee_for_month(m), 0);
    amt := fee;
    s_date := m;
    e_date := (m + INTERVAL '1 month - 1 day')::date;

    IF m = join_m THEN
      s_date := st.joining_date;
      IF EXTRACT(DAY FROM st.joining_date) > 15 THEN amt := fee / 2; END IF;
    END IF;

    IF st.exit_date IS NOT NULL AND m = date_trunc('month', st.exit_date)::date THEN
      e_date := st.exit_date;
      IF EXTRACT(DAY FROM st.exit_date) <= 15 THEN amt := LEAST(amt, fee / 2); END IF;
    END IF;

    INSERT INTO public.subscriptions
      (student_id, plan_id, unit_id, start_date, end_date, grace_end_date, status, billed_amount)
    VALUES
      (p_student, v_plan, st.unit_id, s_date, e_date, e_date + v_grace, 'active', amt);

    total := total + amt;
    m := (m + INTERVAL '1 month')::date;
  END LOOP;

  RETURN total;
END; $$;
REVOKE ALL ON FUNCTION public.rebuild_student_billing(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rebuild_student_billing(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.rebuild_all_billing()
RETURNS TABLE(students_processed int, before_total numeric, after_total numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n int := 0; b numeric := 0; a numeric := 0; prev numeric; nowt numeric;
BEGIN
  IF NOT private.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'Only a super admin can rebuild billing';
  END IF;
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
REVOKE ALL ON FUNCTION public.rebuild_all_billing() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rebuild_all_billing() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.accrue_monthly_billing()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  st record; v_plan uuid; v_grace int; m date; last_billed date; fee numeric; amt numeric;
  s_date date; e_date date; created int := 0; cur_m date := date_trunc('month', CURRENT_DATE)::date;
BEGIN
  SELECT id INTO v_plan FROM public.subscription_plans WHERE is_active ORDER BY created_at LIMIT 1;
  IF v_plan IS NULL THEN RETURN 0; END IF;
  SELECT COALESCE(NULLIF(value,'')::int, 5) INTO v_grace FROM public.system_settings WHERE key = 'grace_period_days';
  v_grace := COALESCE(v_grace, 5);

  FOR st IN
    SELECT s.id, s.unit_id, s.joining_date FROM public.students s
    WHERE s.exit_date IS NULL AND s.joining_date IS NOT NULL AND s.joining_date <= CURRENT_DATE
  LOOP
    SELECT MAX(date_trunc('month', start_date)::date) INTO last_billed
      FROM public.subscriptions WHERE student_id = st.id;
    m := COALESCE((last_billed + INTERVAL '1 month')::date, date_trunc('month', st.joining_date)::date);
    WHILE m <= cur_m LOOP
      fee := COALESCE(public.fee_for_month(m), 0);
      amt := fee;
      s_date := m;
      e_date := (m + INTERVAL '1 month - 1 day')::date;
      IF m = date_trunc('month', st.joining_date)::date THEN
        s_date := st.joining_date;
        IF EXTRACT(DAY FROM st.joining_date) > 15 THEN amt := fee / 2; END IF;
      END IF;
      INSERT INTO public.subscriptions
        (student_id, plan_id, unit_id, start_date, end_date, grace_end_date, status, billed_amount)
      VALUES (st.id, v_plan, st.unit_id, s_date, e_date, e_date + v_grace, 'active', amt);
      created := created + 1;
      m := (m + INTERVAL '1 month')::date;
    END LOOP;
  END LOOP;
  RETURN created;
END; $$;
REVOKE ALL ON FUNCTION public.accrue_monthly_billing() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accrue_monthly_billing() TO authenticated, service_role;

INSERT INTO public.system_settings (key, value) VALUES
  ('due_amount_threshold', '3000'),
  ('days_overdue_threshold', '15')
ON CONFLICT (key) DO NOTHING;