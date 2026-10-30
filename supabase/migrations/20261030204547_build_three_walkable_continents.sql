-- World atlas: activate three distinct playable continents and their discoverable destinations.
insert into public.regions (id, name, kind)
values
  ('veiled-peaks', 'Veiled Peaks', 'mountain-range'),
  ('capital-valley', 'Capital Valley', 'river-valley'),
  ('primordial-forest', 'Primordial Forest', 'primordial-forest')
on conflict (id) do update set name = excluded.name, kind = excluded.kind;

insert into public.areas (id, region_id, name)
values
  ('cloud-ring-monastery', 'veiled-peaks', 'Cloud-Ring Monastery'),
  ('silver-falls', 'veiled-peaks', 'Silver Falls'),
  ('three-crowned-overlook', 'veiled-peaks', 'Three-Crowned Overlook'),
  ('imperial-plaza', 'capital-valley', 'Imperial Plaza'),
  ('riverfront-quarter', 'capital-valley', 'Riverfront Quarter'),
  ('nine-arch-bridge', 'capital-valley', 'Nine-Arch Bridge'),
  ('world-tree-sanctum', 'primordial-forest', 'World Tree Sanctum'),
  ('moonfall-cascade', 'primordial-forest', 'Moonfall Cascade'),
  ('root-sanctuary', 'primordial-forest', 'Root Sanctuary')
on conflict (id) do update set region_id = excluded.region_id, name = excluded.name;
