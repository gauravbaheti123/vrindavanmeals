
-- Categories
CREATE TABLE public.pos_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_categories TO authenticated;
GRANT ALL ON public.pos_categories TO service_role;
ALTER TABLE public.pos_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read categories" ON public.pos_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "super admin manage categories" ON public.pos_categories FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'super_admin')) WITH CHECK (private.has_role(auth.uid(), 'super_admin'));

-- Items
CREATE TABLE public.pos_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category_id UUID REFERENCES public.pos_categories(id) ON DELETE SET NULL,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_items TO authenticated;
GRANT ALL ON public.pos_items TO service_role;
ALTER TABLE public.pos_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read items" ON public.pos_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "super admin manage items" ON public.pos_items FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'super_admin')) WITH CHECK (private.has_role(auth.uid(), 'super_admin'));

-- Payment modes
CREATE TABLE public.pos_payment_modes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL UNIQUE,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_payment_modes TO authenticated;
GRANT ALL ON public.pos_payment_modes TO service_role;
ALTER TABLE public.pos_payment_modes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read pmodes" ON public.pos_payment_modes FOR SELECT TO authenticated USING (true);
CREATE POLICY "super admin manage pmodes" ON public.pos_payment_modes FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'super_admin')) WITH CHECK (private.has_role(auth.uid(), 'super_admin'));

-- Sales
CREATE TABLE public.pos_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_number BIGSERIAL,
  subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount_type TEXT NOT NULL DEFAULT 'none', -- 'none' | 'percentage' | 'fixed'
  discount_value NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_mode TEXT NOT NULL,
  cashier_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sold_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_sales TO authenticated;
GRANT ALL ON public.pos_sales TO service_role;
ALTER TABLE public.pos_sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read sales" ON public.pos_sales FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert sales" ON public.pos_sales FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "super admin manage sales" ON public.pos_sales FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'super_admin')) WITH CHECK (private.has_role(auth.uid(), 'super_admin'));

-- Sale items
CREATE TABLE public.pos_sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES public.pos_sales(id) ON DELETE CASCADE,
  item_id UUID REFERENCES public.pos_items(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  unit_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  quantity INT NOT NULL DEFAULT 1,
  line_total NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX pos_sale_items_sale_idx ON public.pos_sale_items(sale_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_sale_items TO authenticated;
GRANT ALL ON public.pos_sale_items TO service_role;
ALTER TABLE public.pos_sale_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read sale items" ON public.pos_sale_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert sale items" ON public.pos_sale_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "super admin manage sale items" ON public.pos_sale_items FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'super_admin')) WITH CHECK (private.has_role(auth.uid(), 'super_admin'));

-- Updated_at triggers
CREATE TRIGGER pos_categories_updated_at BEFORE UPDATE ON public.pos_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER pos_items_updated_at BEFORE UPDATE ON public.pos_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed defaults
INSERT INTO public.pos_categories (name, sort_order) VALUES
  ('Snacks', 1), ('Beverages', 2), ('Extras', 3);

INSERT INTO public.pos_payment_modes (label, sort_order) VALUES
  ('Cash', 1), ('UPI', 2), ('Card', 3), ('Razorpay', 4);

INSERT INTO public.system_settings (key, value) VALUES ('pos_tax_rate', '0')
  ON CONFLICT (key) DO NOTHING;
