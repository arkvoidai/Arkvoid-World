-- Persistent, user-scoped NPC conversations for the Mistral-backed resident runtime.
create policy "insert own npc memories"
on public.npc_memories
for insert to authenticated
with check ((select auth.uid()) = user_id);

create or replace function public.llm_take(p_user uuid, p_cap integer)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  n int;
begin
  if p_user is null or p_user <> (select auth.uid()) or p_cap < 0 then
    return false;
  end if;

  insert into public.llm_usage(user_id, day, calls)
  values (p_user, current_date, 1)
  on conflict (user_id, day)
  do update set calls = public.llm_usage.calls + 1
  returning calls into n;

  if n > p_cap then
    update public.llm_usage
      set calls = calls - 1
      where user_id = p_user and day = current_date;
    return false;
  end if;

  return true;
end;
$function$;

insert into public.npcs (id, name, role, persona, schedule)
values
  (
    'meilin',
    'Meilin',
    'Sword Disciple of the Cloud-Ring Monastery',
    'A composed young sword disciple with a dry wit and a fiercely independent streak. She is observant, graceful, quietly competitive, and more compassionate than she lets on. She speaks in clear, vivid sentences and never treats the player as a stranger for long.',
    '[{"from":0,"to":6,"area":"cloud-ring-monastery","spot":"inner-courtyard","act":"practising forms beneath the bell"},{"from":6,"to":14,"area":"three-crowned-overlook","spot":"ridge-altar","act":"watching the cloud sea"},{"from":14,"to":24,"area":"silver-falls","spot":"waterfall-steps","act":"meditating beside the falls"}]'::jsonb
  ),
  (
    'yue',
    'Yue',
    'Keeper of the Moon Archive',
    'A poised, intelligent archivist from the river capital. She has an elegant sense of humour, remembers small details, and is fascinated by old maps, forgotten dynasties, and the lives of ordinary people. Warm but never overfamiliar.',
    '[{"from":0,"to":7,"area":"riverfront-quarter","spot":"moon-archive","act":"reading old travel journals"},{"from":7,"to":17,"area":"imperial-plaza","spot":"archive-gallery","act":"cataloguing relics"},{"from":17,"to":24,"area":"nine-arch-bridge","spot":"lantern-rail","act":"watching the river lights"}]'::jsonb
  ),
  (
    'sylva',
    'Sylva',
    'Warden of the World Tree',
    'A gentle but formidable forest warden who speaks softly and notices everything. She loves old trees, small creatures, rain, and the stories carried by roots. She is playful when comfortable, protective of the forest, and dislikes careless destruction.',
    '[{"from":0,"to":6,"area":"root-sanctuary","spot":"root-shrine","act":"listening to the roots"},{"from":6,"to":18,"area":"world-tree-sanctum","spot":"heartwood","act":"tending the World Tree"},{"from":18,"to":24,"area":"moonfall-cascade","spot":"moss-stone","act":"gathering medicinal leaves"}]'::jsonb
  )
on conflict (id) do update
set name = excluded.name,
    role = excluded.role,
    persona = excluded.persona,
    schedule = excluded.schedule;
