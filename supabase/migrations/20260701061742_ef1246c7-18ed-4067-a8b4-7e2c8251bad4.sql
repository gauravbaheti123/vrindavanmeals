
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.current_user_unit() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_unit() TO authenticated, service_role;
