-- CABO PostgreSQL tenant-safe runtime role.
-- Execute as migration owner after schema creation. Do NOT grant BYPASSRLS.
-- This is an operational script and must not be added to the regular migration directory.
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='cabo_runtime') THEN
  CREATE ROLE cabo_runtime NOLOGIN NOBYPASSRLS;
 END IF;
END $$;
GRANT cabo_runtime TO cabo_human_capital_owner;
GRANT USAGE ON SCHEMA public TO cabo_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO cabo_runtime;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO cabo_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE cabo_human_capital_owner IN SCHEMA public
 GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO cabo_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE cabo_human_capital_owner IN SCHEMA public
 GRANT USAGE,SELECT ON SEQUENCES TO cabo_runtime;
