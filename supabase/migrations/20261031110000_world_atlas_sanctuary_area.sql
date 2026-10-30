-- Keep the built Atlas and its foreign-key target table aligned.
-- The five planned regions remain data-only and are deliberately not inserted.
insert into public.areas (id, region_id, name)
values ('sanctuary', 'home-reach', 'Sanctuary')
on conflict (id) do nothing;
