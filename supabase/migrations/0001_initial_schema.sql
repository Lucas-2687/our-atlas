-- Supabase/PostgreSQL schema for the shared travel atlas.
-- Run in Supabase SQL Editor after reviewing the target project.

create table if not exists public.spaces (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  names jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.members (
  user_id text primary key,
  space_id uuid not null references public.spaces(id),
  slot integer not null check (slot in (0, 1)),
  display_name text not null,
  constraint member_slot unique (space_id, slot)
);

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id),
  title text not null,
  precision text not null check (precision in ('day', 'month', 'year', 'unknown')),
  start text not null default '',
  "end" text not null default '',
  story text not null default '',
  places jsonb not null default '[]'::jsonb,
  photos jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists trips_space_start_idx on public.trips (space_id, start desc);

create table if not exists public.shares (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  space_id uuid not null references public.spaces(id),
  scope jsonb not null,
  audience text not null check (audience in ('link', 'invited')),
  emails jsonb not null default '[]'::jsonb,
  expires_at timestamptz,
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists shares_space_created_idx on public.shares (space_id, created_at desc);

create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  space_id uuid not null references public.spaces(id),
  expires_at timestamptz not null,
  used_by text,
  created_at timestamptz not null default now()
);

create table if not exists public.map_access (
  space_id uuid primary key references public.spaces(id),
  user_id text not null,
  salt text not null,
  password_hash text not null
);

create table if not exists public.map_sessions (
  token_hash text primary key,
  user_id text not null,
  expires_at timestamptz not null
);
create index if not exists map_sessions_expiry_idx on public.map_sessions (expires_at);

create table if not exists public.map_access_limits (
  id text primary key,
  attempts integer not null,
  expires_at bigint not null
);
create index if not exists map_access_limits_expiry_idx on public.map_access_limits (expires_at);

-- Private map data is accessed only by the Vercel server through a PostgreSQL
-- connection. Do not grant these tables to Data API roles.
alter table public.spaces enable row level security;
alter table public.members enable row level security;
alter table public.trips enable row level security;
alter table public.shares enable row level security;
alter table public.invites enable row level security;
alter table public.map_access enable row level security;
alter table public.map_sessions enable row level security;
alter table public.map_access_limits enable row level security;

revoke all on table public.spaces, public.members, public.trips, public.shares,
  public.invites, public.map_access, public.map_sessions, public.map_access_limits
  from anon, authenticated;
