-- Existing photos and bucket settings are never overwritten by this migration.
do $$
begin
  if exists (select 1 from storage.buckets where id = 'travel-photos' and public) then
    raise exception 'travel-photos is public; review access and make it private before continuing';
  end if;
end;
$$;

insert into storage.buckets (id, name, public)
values ('travel-photos', 'travel-photos', false)
on conflict (id) do nothing;
