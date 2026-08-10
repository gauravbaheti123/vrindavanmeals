ALTER TABLE public.students ALTER COLUMN mobile DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS students_roll_number_unique ON public.students (roll_number) WHERE roll_number IS NOT NULL;