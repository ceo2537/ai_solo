ALTER TABLE public.consultation_operation_logs
  ADD COLUMN IF NOT EXISTS operation_key uuid;

UPDATE public.consultation_operation_logs
  SET operation_key = gen_random_uuid()
  WHERE operation_key IS NULL;

ALTER TABLE public.consultation_operation_logs
  ALTER COLUMN operation_key SET DEFAULT gen_random_uuid(),
  ALTER COLUMN operation_key SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'consultation_operation_logs_operation_key_key'
  ) THEN
    ALTER TABLE public.consultation_operation_logs
      ADD CONSTRAINT consultation_operation_logs_operation_key_key UNIQUE (operation_key);
  END IF;
END $$;

UPDATE public.consultation_operation_logs
  SET nutrition_standard_version = 'kdri-2025'
  WHERE nutrition_standard_version = 'kdri-2020';