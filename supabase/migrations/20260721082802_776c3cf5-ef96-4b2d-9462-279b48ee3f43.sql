ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS opening_balance numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opening_balance_as_of date;