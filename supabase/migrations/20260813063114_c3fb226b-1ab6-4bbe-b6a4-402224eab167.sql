CREATE OR REPLACE FUNCTION private.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id) $$;

CREATE OR REPLACE FUNCTION private.is_finance_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (
  SELECT 1 FROM public.user_roles
  WHERE user_id = _user_id AND role IN ('super_admin','manager','accountant')
) $$;

REVOKE EXECUTE ON FUNCTION private.is_staff(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.is_finance_staff(uuid) FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "Authenticated can read billing rebuild log" ON public.billing_backfill_log;
CREATE POLICY "Finance staff read billing rebuild log" ON public.billing_backfill_log
FOR SELECT TO authenticated USING (private.is_finance_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can view fee settings" ON public.fee_settings;
CREATE POLICY "Finance staff view fee settings" ON public.fee_settings
FOR SELECT TO authenticated USING (private.is_finance_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can view adjustments" ON public.ledger_adjustments;
CREATE POLICY "Finance staff view adjustments" ON public.ledger_adjustments
FOR SELECT TO authenticated USING (private.is_finance_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can view deposits" ON public.security_deposits;
CREATE POLICY "Finance staff view deposits" ON public.security_deposits
FOR SELECT TO authenticated USING (private.is_finance_staff(auth.uid()));

DROP POLICY IF EXISTS "auth read role permissions" ON public.role_permissions;
DROP POLICY IF EXISTS "Authenticated can read role permissions" ON public.role_permissions;
DROP POLICY IF EXISTS "Staff can view role permissions" ON public.role_permissions;
CREATE POLICY "Admins view role permissions" ON public.role_permissions
FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "auth read settings" ON public.system_settings;
DROP POLICY IF EXISTS "Authenticated can read settings" ON public.system_settings;
DROP POLICY IF EXISTS "Staff can view settings" ON public.system_settings;
CREATE POLICY "Staff view system settings" ON public.system_settings
FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));

DROP POLICY IF EXISTS "auth read categories" ON public.pos_categories;
CREATE POLICY "Staff read pos categories" ON public.pos_categories
FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));

DROP POLICY IF EXISTS "auth read items" ON public.pos_items;
CREATE POLICY "Staff read pos items" ON public.pos_items
FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));

DROP POLICY IF EXISTS "auth read pmodes" ON public.pos_payment_modes;
CREATE POLICY "Staff read pos payment modes" ON public.pos_payment_modes
FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));

DROP POLICY IF EXISTS "auth read sales" ON public.pos_sales;
CREATE POLICY "Staff read pos sales" ON public.pos_sales
FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));

DROP POLICY IF EXISTS "auth read sale items" ON public.pos_sale_items;
CREATE POLICY "Staff read pos sale items" ON public.pos_sale_items
FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can read student photos" ON storage.objects;
CREATE POLICY "Staff can read student photos" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'student-photos' AND private.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can upload student photos" ON storage.objects;
CREATE POLICY "Staff can upload student photos" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'student-photos' AND (
    private.has_role(auth.uid(), 'super_admin')
    OR private.has_role(auth.uid(), 'manager')
    OR private.has_role(auth.uid(), 'counter_staff')
  )
);

DROP POLICY IF EXISTS "Staff can update student photos" ON storage.objects;
CREATE POLICY "Staff can update student photos" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'student-photos' AND (
    private.has_role(auth.uid(), 'super_admin')
    OR private.has_role(auth.uid(), 'manager')
    OR private.has_role(auth.uid(), 'counter_staff')
  )
)
WITH CHECK (
  bucket_id = 'student-photos' AND (
    private.has_role(auth.uid(), 'super_admin')
    OR private.has_role(auth.uid(), 'manager')
    OR private.has_role(auth.uid(), 'counter_staff')
  )
);

DROP POLICY IF EXISTS "Staff can delete student photos" ON storage.objects;
CREATE POLICY "Staff can delete student photos" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'student-photos' AND (
    private.has_role(auth.uid(), 'super_admin')
    OR private.has_role(auth.uid(), 'manager')
  )
);