CREATE TABLE public.consultation_operation_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  status text NOT NULL CHECK (status IN ('processing','succeeded','failed','cancelled')),
  duration_ms integer NULL CHECK (duration_ms >= 0),
  error_type text NULL CHECK (error_type IN ('external_ai','timeout','format_validation','server_internal')),
  error_code text NULL,
  ai_model_version text NOT NULL,
  prompt_version text NOT NULL,
  nutrition_standard_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT completed_after_requested CHECK (completed_at IS NULL OR completed_at >= requested_at),
  CONSTRAINT succeeded_has_no_error CHECK (status <> 'succeeded' OR (error_type IS NULL AND error_code IS NULL)),
  CONSTRAINT failed_has_error_type CHECK (status <> 'failed' OR error_type IS NOT NULL)
);

GRANT ALL ON public.consultation_operation_logs TO service_role;

ALTER TABLE public.consultation_operation_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX consultation_operation_logs_requested_at_desc_idx
  ON public.consultation_operation_logs (requested_at DESC);

CREATE INDEX consultation_operation_logs_failed_completed_at_desc_idx
  ON public.consultation_operation_logs (completed_at DESC)
  WHERE status = 'failed';