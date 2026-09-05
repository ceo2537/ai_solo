REVOKE ALL ON public.consultation_operation_logs FROM anon;
REVOKE ALL ON public.consultation_operation_logs FROM authenticated;
REVOKE ALL ON SEQUENCE public.consultation_operation_logs_id_seq FROM anon;
REVOKE ALL ON SEQUENCE public.consultation_operation_logs_id_seq FROM authenticated;
GRANT ALL ON public.consultation_operation_logs TO service_role;