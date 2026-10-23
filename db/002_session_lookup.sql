-- Install with the application migrations, using a trusted migration role.
-- The lookup reveals only a tenant id for an unguessable hashed session token.
CREATE OR REPLACE FUNCTION auth_session_tenant(p_hash text)
RETURNS TABLE(tenant_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ SELECT s.tenant_id FROM sessions s WHERE s.token_hash = p_hash AND s.expires_at > now() LIMIT 1 $$;
REVOKE ALL ON FUNCTION auth_session_tenant(text) FROM PUBLIC;
-- Grant EXECUTE to the exact application database role during provisioning.
