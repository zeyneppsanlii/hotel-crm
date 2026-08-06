-- Dedicated NON-SUPERUSER application role for runtime (app) connections.
--
-- Why this exists: PostgreSQL Row-Level Security is ALWAYS bypassed by superuser
-- and BYPASSRLS roles -- even with FORCE ROW LEVEL SECURITY. The default docker
-- role (`hotelcrm`, from POSTGRES_USER) is a superuser, so if the app connects as
-- it, RLS is silently inert and every tenant sees every tenant's rows. The app
-- MUST therefore connect as this restricted role instead.
--
-- Role split:
--   hotelcrm      (superuser) -> migrations / DDL         -> DIRECT_DATABASE_URL
--   hotelcrm_app  (this role) -> application runtime, RLS -> DATABASE_URL
--
-- This script runs automatically on a FRESH volume (mounted into
-- /docker-entrypoint-initdb.d). For an already-initialized volume it does not
-- re-run, so apply it once by hand -- it is idempotent.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hotelcrm_app') THEN
    CREATE ROLE hotelcrm_app
      LOGIN PASSWORD 'hotelcrm_app_dev_2026'
      NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

-- Access to the schema itself.
GRANT USAGE ON SCHEMA public TO hotelcrm_app;

-- DML (SELECT/INSERT/UPDATE/DELETE) on all EXISTING tables + sequences.
-- RLS still restricts WHICH rows are visible; these grants only say the role may
-- touch the tables at all.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hotelcrm_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO hotelcrm_app;

-- FUTURE tables/sequences created by `hotelcrm` (e.g. via Prisma migrations) are
-- auto-granted to the app role, so a new migration does not silently lock it out.
ALTER DEFAULT PRIVILEGES FOR ROLE hotelcrm IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hotelcrm_app;
ALTER DEFAULT PRIVILEGES FOR ROLE hotelcrm IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO hotelcrm_app;
