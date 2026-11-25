-- tools/staging/bootstrap.sql — the Supabase-shaped roles, schemas and privileges of the LOCAL staging database (run once, by the
-- bootstrap superuser `supabase_admin`, before the production baseline is loaded as `postgres`). Mirrors a hosted project:
--   * `postgres` is NOT a superuser (createrole, createdb, replication, bypassrls) and owns schemas public / game / extensions;
--   * anon / authenticated / service_role are NOLOGIN API roles; PostgREST logs in as `authenticator` (noinherit) and switches to anon;
--   * pgcrypto lives in schema `extensions` (production: extnamespace = extensions);
--   * Supabase's default privileges: new tables / functions / sequences in public are granted to anon, authenticated, service_role.
-- :pg_pw and :auth_pw are psql variables (random, local-only; tools/staging/setup.sh).
create role postgres login createrole createdb replication bypassrls password :'pg_pw';
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create role authenticator login noinherit password :'auth_pw';
grant anon, authenticated, service_role to authenticator;
grant anon, authenticated, service_role to postgres;
alter database postgres owner to postgres;
alter schema public owner to postgres;
create schema extensions authorization postgres;
create extension pgcrypto with schema extensions;
create schema game authorization postgres;
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema extensions to anon, authenticated, service_role, postgres;
alter role anon set statement_timeout = '3s';                 -- Supabase defaults
alter role authenticated set statement_timeout = '8s';
alter role authenticator set statement_timeout = '8s';
set role postgres;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
reset role;
