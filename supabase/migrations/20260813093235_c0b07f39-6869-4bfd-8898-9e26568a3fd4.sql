DROP POLICY IF EXISTS "Staff can add adjustments" ON public.ledger_adjustments;
CREATE POLICY "Finance staff can add adjustments" ON public.ledger_adjustments
FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid() AND private.is_finance_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can add deposits" ON public.security_deposits;
CREATE POLICY "Finance staff can add deposits" ON public.security_deposits
FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid() AND private.is_finance_staff(auth.uid()));

DROP POLICY IF EXISTS "auth insert sales" ON public.pos_sales;
CREATE POLICY "Staff can insert sales" ON public.pos_sales
FOR INSERT TO authenticated
WITH CHECK (cashier_id = auth.uid() AND private.is_staff(auth.uid()));