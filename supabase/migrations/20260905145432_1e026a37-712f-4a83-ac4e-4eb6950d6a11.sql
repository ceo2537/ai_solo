CREATE OR REPLACE FUNCTION public.finish_request_lock(_lock_key text, _ttl_seconds integer)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  DELETE FROM public.consultation_request_locks WHERE expires_at < now();
  UPDATE public.consultation_request_locks
  SET expires_at = now() + make_interval(secs => LEAST(300, GREATEST(_ttl_seconds, 5)))
  WHERE lock_key = _lock_key;
$function$;

REVOKE ALL ON FUNCTION public.finish_request_lock(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_request_lock(text, integer) TO service_role;