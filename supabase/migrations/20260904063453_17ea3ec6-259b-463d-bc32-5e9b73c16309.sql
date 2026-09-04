CREATE POLICY "pay_delete" ON public.payments FOR DELETE TO authenticated
USING (private.has_role(auth.uid(), 'super_admin'::app_role) OR private.has_role(auth.uid(), 'manager'::app_role));