ALTER TABLE public.ledger_adjustments
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'adjustment',
  ADD COLUMN IF NOT EXISTS from_date date,
  ADD COLUMN IF NOT EXISTS to_date date;

ALTER TABLE public.ledger_adjustments
  DROP CONSTRAINT IF EXISTS ledger_adjustments_kind_check;
ALTER TABLE public.ledger_adjustments
  ADD CONSTRAINT ledger_adjustments_kind_check CHECK (kind IN ('adjustment','holiday'));