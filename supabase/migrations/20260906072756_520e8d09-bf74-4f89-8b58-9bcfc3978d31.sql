GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rate_limit_hit(text, integer, integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rate_limit_peek(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rate_limit_reset(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.log_admin_login_event(_success boolean, _admin_user_id uuid, _failure_reason text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  INSERT INTO public.admin_login_events (success, admin_user_id, failure_reason)
  VALUES (_success, _admin_user_id, left(coalesce(_failure_reason, ''), 60));
$$;

REVOKE ALL ON FUNCTION public.log_admin_login_event(boolean, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_admin_login_event(boolean, uuid, text) TO anon, authenticated, service_role;