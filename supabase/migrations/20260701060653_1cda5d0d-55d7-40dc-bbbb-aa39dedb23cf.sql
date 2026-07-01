
CREATE TYPE public.app_role AS ENUM ('super_admin','manager','counter_staff','accountant');
CREATE TYPE public.doc_type AS ENUM ('college_id','aadhar');
CREATE TYPE public.subscription_status AS ENUM ('active','grace','expired','pending');
CREATE TYPE public.payment_mode AS ENUM ('cash','upi','card','razorpay');
CREATE TYPE public.payment_status AS ENUM ('success','failed','pending');
CREATE TYPE public.meal_type AS ENUM ('lunch','dinner');
CREATE TYPE public.scan_type AS ENUM ('biometric','manual');

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.units TO authenticated;
GRANT ALL ON public.units TO service_role;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  email TEXT,
  mobile TEXT,
  unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.current_user_unit()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT unit_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE TABLE public.subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL DEFAULT 3000,
  meal_combo TEXT NOT NULL DEFAULT 'lunch+dinner',
  duration_days INT NOT NULL DEFAULT 30,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscription_plans TO authenticated;
GRANT ALL ON public.subscription_plans TO service_role;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  mobile TEXT NOT NULL,
  roll_number TEXT,
  course TEXT,
  hostel_room TEXT,
  parent_mobile TEXT,
  email TEXT,
  batch_year INT,
  blood_group TEXT,
  address TEXT,
  photo_url TEXT,
  doc_type public.doc_type,
  doc_number TEXT,
  doc_url TEXT,
  unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL,
  is_approved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_students_unit ON public.students(unit_id);
CREATE INDEX idx_students_name ON public.students(full_name);
CREATE INDEX idx_students_roll ON public.students(roll_number);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.students TO authenticated;
GRANT INSERT ON public.students TO anon;
GRANT ALL ON public.students TO service_role;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_students_updated BEFORE UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.subscription_plans(id),
  unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  grace_end_date DATE NOT NULL,
  status public.subscription_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_subs_student ON public.subscriptions(student_id);
CREATE INDEX idx_subs_status ON public.subscriptions(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  amount NUMERIC(10,2) NOT NULL,
  mode public.payment_mode NOT NULL,
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT,
  status public.payment_status NOT NULL DEFAULT 'pending',
  recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_student ON public.payments(student_id);
CREATE INDEX idx_payments_created ON public.payments(created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES public.units(id),
  meal_type public.meal_type NOT NULL,
  scan_type public.scan_type NOT NULL DEFAULT 'biometric',
  scan_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  scan_date DATE GENERATED ALWAYS AS (((scan_time AT TIME ZONE 'Asia/Kolkata'))::date) STORED,
  token_number INT NOT NULL,
  token_printed BOOLEAN NOT NULL DEFAULT false,
  is_override BOOLEAN NOT NULL DEFAULT false,
  override_reason TEXT,
  marked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_att_student ON public.attendance(student_id);
CREATE INDEX idx_att_scan_time ON public.attendance(scan_time);
CREATE UNIQUE INDEX uq_att_daily ON public.attendance(student_id, meal_type, scan_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance TO authenticated;
GRANT ALL ON public.attendance TO service_role;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.token_reprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_id UUID NOT NULL REFERENCES public.attendance(id) ON DELETE CASCADE,
  reprinted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.token_reprints TO authenticated;
GRANT ALL ON public.token_reprints TO service_role;
ALTER TABLE public.token_reprints ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role public.app_role NOT NULL,
  module_name TEXT NOT NULL,
  can_access BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(role, module_name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.meal_windows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  meal_type public.meal_type NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  UNIQUE(unit_id, meal_type)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meal_windows TO authenticated;
GRANT ALL ON public.meal_windows TO service_role;
ALTER TABLE public.meal_windows ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_settings TO authenticated;
GRANT ALL ON public.system_settings TO service_role;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.biometric_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_user_id TEXT NOT NULL,
  device_name TEXT,
  student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  mapped_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  mapped_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_bio_active ON public.biometric_mappings(unit_id, device_user_id) WHERE is_active = true;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.biometric_mappings TO authenticated;
GRANT ALL ON public.biometric_mappings TO service_role;
ALTER TABLE public.biometric_mappings ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.unmapped_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_user_id TEXT NOT NULL,
  unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL,
  scan_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_data JSONB,
  resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.unmapped_scans TO authenticated;
GRANT ALL ON public.unmapped_scans TO service_role;
ALTER TABLE public.unmapped_scans ENABLE ROW LEVEL SECURITY;

-- POLICIES
CREATE POLICY "profiles_self_read" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "profiles_admin_insert" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid() OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "profiles_admin_delete" ON public.profiles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'));

CREATE POLICY "roles_read_own_or_admin" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin'));

CREATE POLICY "units_read" ON public.units FOR SELECT TO authenticated USING (true);
CREATE POLICY "units_admin_ins" ON public.units FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "units_admin_upd" ON public.units FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "units_admin_del" ON public.units FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'));

CREATE POLICY "plans_read" ON public.subscription_plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "plans_write" ON public.subscription_plans FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));

CREATE POLICY "windows_read" ON public.meal_windows FOR SELECT TO authenticated USING (true);
CREATE POLICY "windows_write" ON public.meal_windows FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));

CREATE POLICY "settings_read" ON public.system_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "settings_write" ON public.system_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));

CREATE POLICY "perms_read" ON public.role_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "perms_write" ON public.role_permissions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));

CREATE POLICY "students_read" ON public.students FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'super_admin')
  OR public.has_role(auth.uid(),'manager')
  OR public.has_role(auth.uid(),'accountant')
  OR (public.has_role(auth.uid(),'counter_staff') AND unit_id = public.current_user_unit())
);
CREATE POLICY "students_public_selfreg" ON public.students FOR INSERT TO anon
  WITH CHECK (is_approved = false);
CREATE POLICY "students_admin_ins" ON public.students FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "students_admin_upd" ON public.students FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "students_admin_del" ON public.students FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'));

CREATE POLICY "subs_read" ON public.subscriptions FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'super_admin')
  OR public.has_role(auth.uid(),'manager')
  OR public.has_role(auth.uid(),'accountant')
  OR (public.has_role(auth.uid(),'counter_staff') AND unit_id = public.current_user_unit())
);
CREATE POLICY "subs_write" ON public.subscriptions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'manager'));

CREATE POLICY "pay_read" ON public.payments FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'super_admin')
  OR public.has_role(auth.uid(),'manager')
  OR public.has_role(auth.uid(),'accountant')
  OR public.has_role(auth.uid(),'counter_staff')
);
CREATE POLICY "pay_insert" ON public.payments FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'super_admin')
    OR public.has_role(auth.uid(),'accountant')
    OR public.has_role(auth.uid(),'counter_staff')
  );
CREATE POLICY "pay_update" ON public.payments FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'accountant'));

CREATE POLICY "att_read" ON public.attendance FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'super_admin')
  OR public.has_role(auth.uid(),'manager')
  OR (public.has_role(auth.uid(),'counter_staff') AND unit_id = public.current_user_unit())
);
CREATE POLICY "att_write" ON public.attendance FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'super_admin')
    OR (public.has_role(auth.uid(),'counter_staff') AND unit_id = public.current_user_unit())
  );

CREATE POLICY "reprint_read" ON public.token_reprints FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'manager')
  OR public.has_role(auth.uid(),'counter_staff')
);
CREATE POLICY "reprint_write" ON public.token_reprints FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'counter_staff'));

CREATE POLICY "bio_read" ON public.biometric_mappings FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'manager')
);
CREATE POLICY "bio_write" ON public.biometric_mappings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'manager'));

CREATE POLICY "unmap_read" ON public.unmapped_scans FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'manager')
);
CREATE POLICY "unmap_update" ON public.unmapped_scans FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'manager'));

-- Auto profile + seed super admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name',''), NEW.email)
  ON CONFLICT (id) DO NOTHING;
  IF NEW.email = 'admin@vrindavanmeals.in' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'super_admin')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- SEEDS
INSERT INTO public.units (name) VALUES ('Unit 1'), ('Unit 2');
INSERT INTO public.subscription_plans (name, price, meal_combo, duration_days)
VALUES ('Monthly Standard', 3000, 'lunch+dinner', 30);
INSERT INTO public.system_settings (key, value) VALUES
  ('subscription_price','3000'),
  ('grace_period_days','5'),
  ('expiry_warning_days','5');
INSERT INTO public.meal_windows (unit_id, meal_type, start_time, end_time)
SELECT id, 'lunch'::public.meal_type, '10:00'::time, '14:00'::time FROM public.units
UNION ALL
SELECT id, 'dinner'::public.meal_type, '18:00'::time, '23:30'::time FROM public.units;

INSERT INTO public.role_permissions (role, module_name, can_access) VALUES
  ('super_admin','students',true),('super_admin','biometric',true),('super_admin','subscriptions',true),
  ('super_admin','payments',true),('super_admin','attendance',true),('super_admin','reports',true),
  ('super_admin','settings',true),('super_admin','roles',true),('super_admin','users',true),
  ('manager','students',true),('manager','biometric',true),('manager','subscriptions',true),
  ('manager','payments',true),('manager','attendance',true),('manager','reports',true),
  ('manager','settings',false),('manager','roles',false),('manager','users',false),
  ('counter_staff','students',true),('counter_staff','biometric',false),('counter_staff','subscriptions',false),
  ('counter_staff','payments',true),('counter_staff','attendance',true),('counter_staff','reports',false),
  ('counter_staff','settings',false),('counter_staff','roles',false),('counter_staff','users',false),
  ('accountant','students',true),('accountant','biometric',false),('accountant','subscriptions',true),
  ('accountant','payments',true),('accountant','attendance',false),('accountant','reports',true),
  ('accountant','settings',false),('accountant','roles',false),('accountant','users',false);
