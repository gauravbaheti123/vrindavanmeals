
DROP POLICY IF EXISTS "auth insert sales" ON public.pos_sales;
CREATE POLICY "auth insert sales" ON public.pos_sales
  FOR INSERT TO authenticated
  WITH CHECK (cashier_id = auth.uid());

DROP POLICY IF EXISTS "auth insert sale items" ON public.pos_sale_items;
CREATE POLICY "auth insert sale items" ON public.pos_sale_items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.pos_sales s
    WHERE s.id = pos_sale_items.sale_id
      AND s.cashier_id = auth.uid()
  ));
