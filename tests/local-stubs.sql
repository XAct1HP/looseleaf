-- Local-only stubs so the migrations can be applied to a plain Postgres 16.
-- Recreates just enough of Supabase's auth/storage surface to test RLS.

create extension if not exists "pgcrypto";

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    create role supabase_auth_admin nologin;
  end if;
end $$;

create schema if not exists auth;
create schema if not exists storage;

create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text
);

-- The acting user is whatever `test.uid` is set to.
create or replace function auth.uid() returns uuid
language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;

-- Supabase puts the signed-in address in the JWT. Mirror that from auth.users
-- so policies that read auth.jwt() ->> 'email' behave the same locally.
create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(
    (select jsonb_build_object('email', u.email, 'sub', u.id::text)
       from auth.users u where u.id = auth.uid()),
    '{}'::jsonb)
$$;

create or replace function auth.role() returns text
language sql stable as $$ select coalesce(current_setting('test.role', true), 'authenticated') $$;

create table if not exists storage.buckets (
  id     text primary key,
  name   text,
  public boolean default false
);

create table if not exists storage.objects (
  id       uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name     text,
  owner    uuid
);

alter table storage.objects enable row level security;

create or replace function storage.foldername(name text) returns text[]
language sql immutable as $$ select string_to_array(name, '/') $$;

grant usage on schema auth, storage to authenticated, anon, supabase_auth_admin, service_role;
grant select on auth.users to authenticated, anon, supabase_auth_admin, service_role;
grant all on storage.objects, storage.buckets to authenticated, service_role;

-- Supabase creates this publication for Realtime; migrations add tables to it.
do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
