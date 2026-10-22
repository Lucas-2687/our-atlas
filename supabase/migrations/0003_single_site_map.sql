-- One public atlas per deployment. Existing records and passwords are retained.
create table if not exists public.site_map (
  id smallint primary key check (id = 1),
  space_id uuid not null unique references public.spaces(id)
);
alter table public.site_map enable row level security;
revoke all on public.site_map from public, anon, authenticated;
grant all on public.site_map to service_role;

-- Only adopt an existing map when there is exactly one. Never choose arbitrarily.
insert into public.site_map (id, space_id)
select 1, id from public.spaces
where (select count(*) from public.spaces) = 1
on conflict (id) do nothing;

create or replace function public.initialize_site_map(
  p_id uuid, p_title text, p_names jsonb, p_user_id text,
  p_display_name text, p_salt text, p_password_hash text
)
returns void language plpgsql security definer set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(782406135);
  if exists (select 1 from public.site_map) or exists (select 1 from public.spaces) then
    raise exception 'Website map already exists; bind the existing map instead';
  end if;
  perform public.create_travel_space(p_id, p_title, p_names, p_user_id, p_display_name, p_salt, p_password_hash);
  insert into public.site_map (id, space_id) values (1, p_id);
end;
$$;
revoke all on function public.initialize_site_map(uuid, text, jsonb, text, text, text, text) from public, anon, authenticated;
grant execute on function public.initialize_site_map(uuid, text, jsonb, text, text, text, text) to service_role;
notify pgrst, 'reload schema';
