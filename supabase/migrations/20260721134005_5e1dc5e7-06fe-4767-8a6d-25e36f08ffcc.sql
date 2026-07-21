
-- Add billed_amount to subscriptions for mid-month (half/full) billing
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS billed_amount numeric;
UPDATE public.subscriptions s
  SET billed_amount = p.price
  FROM public.subscription_plans p
  WHERE s.plan_id = p.id AND s.billed_amount IS NULL;

-- Seed default branding keys (empty values) so Settings UI can render inputs
INSERT INTO public.system_settings (key, value) VALUES
  ('brand_org_name', 'Vrindavan Meals'),
  ('brand_address', ''),
  ('brand_contact', ''),
  ('brand_signature_line', 'Authorised Signatory'),
  ('brand_logo_url', ''),
  ('brand_stamp_url', '')
ON CONFLICT (key) DO NOTHING;
