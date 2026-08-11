WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY student_id, date_trunc('month', start_date)
    ORDER BY created_at, id
  ) rn
  FROM public.subscriptions
)
UPDATE public.payments p SET subscription_id = NULL
WHERE p.subscription_id IN (SELECT id FROM ranked WHERE rn > 1);

WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY student_id, date_trunc('month', start_date)
    ORDER BY created_at, id
  ) rn
  FROM public.subscriptions
)
DELETE FROM public.subscriptions s USING ranked r
WHERE s.id = r.id AND r.rn > 1;

UPDATE public.payments SET subscription_id = NULL
WHERE subscription_id IN (
  SELECT id FROM public.subscriptions
  WHERE date_trunc('month', start_date) > date_trunc('month', CURRENT_DATE)
);
DELETE FROM public.subscriptions
WHERE date_trunc('month', start_date) > date_trunc('month', CURRENT_DATE);

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_student_month_uniq
  ON public.subscriptions (student_id, (date_trunc('month', start_date::timestamp)));

CREATE OR REPLACE FUNCTION public.rebuild_student_billing(p_student uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  st public.students%ROWTYPE;
  v_plan uuid; v_grace int; m date; last_m date; join_m date; cur_m date;
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

  cur_m := date_trunc('month', CURRENT_DATE)::date;
  join_m := date_trunc('month', st.joining_date)::date;
  last_m := LEAST(date_trunc('month', COALESCE(st.exit_date, CURRENT_DATE))::date, cur_m);
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
      (p_student, v_plan, st.unit_id, s_date, e_date, e_date + v_grace, 'active', amt)
    ON CONFLICT DO NOTHING;

    total := total + amt;
    m := (m + INTERVAL '1 month')::date;
  END LOOP;

  RETURN total;
END; $function$;

CREATE OR REPLACE FUNCTION public.accrue_monthly_billing()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      VALUES (st.id, v_plan, st.unit_id, s_date, e_date, e_date + v_grace, 'active', amt)
      ON CONFLICT DO NOTHING;
      created := created + 1;
      m := (m + INTERVAL '1 month')::date;
    END LOOP;
  END LOOP;
  RETURN created;
END; $function$;