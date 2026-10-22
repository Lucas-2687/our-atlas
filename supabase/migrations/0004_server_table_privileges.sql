-- Explicit grants are required when automatic Data API exposure is disabled.
-- The server uses service_role; anonymous visitors access only our website API.
begin;

grant usage on schema public to service_role;
grant select, insert, update, delete on table
  public.spaces,
  public.members,
  public.trips,
  public.shares,
  public.invites,
  public.map_access,
  public.map_sessions,
  public.map_access_limits,
  public.site_map
to service_role;

notify pgrst, 'reload schema';
commit;
