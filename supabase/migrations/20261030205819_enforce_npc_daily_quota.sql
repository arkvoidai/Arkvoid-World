-- Enforce a server-side maximum for the daily NPC conversation quota.
create or replace function public.llm_take(p_user uuid, p_cap integer)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  n int;
  enforced_cap int;
begin
  if p_user is null or p_user <> (select auth.uid()) or p_cap < 0 then
    return false;
  end if;
  enforced_cap := least(p_cap, 24);
  insert into public.llm_usage(user_id, day, calls)
  values (p_user, current_date, 1)
  on conflict (user_id, day)
  do update set calls = public.llm_usage.calls + 1
  returning calls into n;
  if n > enforced_cap then
    update public.llm_usage set calls = calls - 1
    where user_id = p_user and day = current_date;
    return false;
  end if;
  return true;
end;
$function$;
