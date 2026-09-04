CREATE INDEX IF NOT EXISTS idx_students_exit_date ON public.students (exit_date);
CREATE INDEX IF NOT EXISTS idx_ledger_adjustments_student2 ON public.ledger_adjustments (student_id);
CREATE INDEX IF NOT EXISTS idx_payments_student_status ON public.payments (student_id, status);
CREATE INDEX IF NOT EXISTS idx_subs_student_end ON public.subscriptions (student_id, end_date DESC);

CREATE OR REPLACE VIEW public.student_ledger_summary
WITH (security_invoker = true) AS
SELECT
  s.id                              AS student_id,
  s.full_name,
  s.mobile,
  s.roll_number,
  s.college_roll_number,
  s.unit_id,
  u.name                            AS unit_name,
  s.joining_date,
  s.exit_date,
  s.opening_balance_as_of,
  COALESCE(s.opening_balance, 0)::numeric      AS opening_balance,
  CASE WHEN s.exit_date IS NULL THEN 'active' ELSE 'inactive' END AS status,
  COALESCE(sub.billed, 0)::numeric             AS total_billed,
  COALESCE(pay.paid, 0)::numeric               AS total_paid,
  COALESCE(adj.adjustments, 0)::numeric        AS total_adjustments,
  COALESCE(dep.held, 0)::numeric               AS security_deposit_held,
  pay.last_payment_date,
  sub.latest_sub_id                            AS sub_id,
  sub.first_start_date,
  (COALESCE(sub.billed, 0) + COALESCE(s.opening_balance, 0) + COALESCE(adj.adjustments, 0) - COALESCE(pay.paid, 0))::numeric AS total_due
FROM public.students s
LEFT JOIN public.units u ON u.id = s.unit_id
LEFT JOIN LATERAL (
  SELECT SUM(COALESCE(x.billed_amount, 0)) AS billed,
         MIN(x.start_date)                 AS first_start_date,
         (SELECT y.id FROM public.subscriptions y WHERE y.student_id = s.id ORDER BY y.end_date DESC LIMIT 1) AS latest_sub_id
  FROM public.subscriptions x WHERE x.student_id = s.id
) sub ON TRUE
LEFT JOIN LATERAL (
  SELECT SUM(p.amount) AS paid, MAX(p.created_at) AS last_payment_date
  FROM public.payments p WHERE p.student_id = s.id AND p.status = 'success'
) pay ON TRUE
LEFT JOIN LATERAL (
  SELECT SUM(a.amount) AS adjustments
  FROM public.ledger_adjustments a WHERE a.student_id = s.id
) adj ON TRUE
LEFT JOIN LATERAL (
  SELECT SUM(CASE WHEN d.kind = 'refunded' THEN -d.amount ELSE d.amount END) AS held
  FROM public.security_deposits d WHERE d.student_id = s.id
) dep ON TRUE;

GRANT SELECT ON public.student_ledger_summary TO authenticated;
GRANT SELECT ON public.student_ledger_summary TO service_role;