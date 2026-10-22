-- Atomic operations used by the Vercel server through the Supabase service key.

create or replace function public.consume_map_access_limit(p_id text, p_expires_at bigint)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  next_attempts integer;
begin
  insert into public.map_access_limits as existing (id, attempts, expires_at)
  values (p_id, 1, p_expires_at)
  on conflict (id) do update
    set attempts = existing.attempts + 1,
        expires_at = excluded.expires_at
  returning attempts into next_attempts;

  delete from public.map_access_limits
  where expires_at < floor(extract(epoch from clock_timestamp()) * 1000)::bigint;

  return next_attempts;
end;
$$;

create or replace function public.create_travel_space(
  p_id uuid,
  p_title text,
  p_names jsonb,
  p_user_id text,
  p_display_name text,
  p_salt text,
  p_password_hash text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.spaces (id, title, names) values (p_id, p_title, p_names);
  insert into public.members (user_id, space_id, slot, display_name)
    values (p_user_id, p_id, 0, p_display_name);
  insert into public.map_access (space_id, user_id, salt, password_hash)
    values (p_id, p_user_id, p_salt, p_password_hash);
end;
$$;

create or replace function public.change_travel_map_password(
  p_space_id uuid,
  p_user_id text,
  p_salt text,
  p_password_hash text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.map_access (space_id, user_id, salt, password_hash)
  values (p_space_id, p_user_id, p_salt, p_password_hash)
  on conflict (space_id) do update
    set user_id = excluded.user_id,
        salt = excluded.salt,
        password_hash = excluded.password_hash;

  delete from public.map_sessions
  where user_id in (select user_id from public.members where space_id = p_space_id);
end;
$$;

revoke all on function public.consume_map_access_limit(text, bigint) from public, anon, authenticated;
revoke all on function public.create_travel_space(uuid, text, jsonb, text, text, text, text) from public, anon, authenticated;
revoke all on function public.change_travel_map_password(uuid, text, text, text) from public, anon, authenticated;

grant execute on function public.consume_map_access_limit(text, bigint) to service_role;
grant execute on function public.create_travel_space(uuid, text, jsonb, text, text, text, text) to service_role;
grant execute on function public.change_travel_map_password(uuid, text, text, text) to service_role;

notify pgrst, 'reload schema';
