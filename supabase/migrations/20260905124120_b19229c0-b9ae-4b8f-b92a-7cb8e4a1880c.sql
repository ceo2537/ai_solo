DROP POLICY IF EXISTS "Users can read their own roles" ON public.user_roles;

REVOKE ALL PRIVILEGES ON TABLE public.user_roles FROM anon, authenticated, PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.admin_login_events FROM anon, authenticated, PUBLIC;

GRANT ALL ON TABLE public.user_roles TO service_role;
GRANT ALL ON TABLE public.admin_login_events TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_login_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;