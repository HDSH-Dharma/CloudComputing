-- Assistant rate limits that a user cannot get around.
-- Usage is logged in its own table, not counted from ai_chat_messages, because users may delete
-- their chats (which cascades to the messages). Users can read their own rows but never write
-- or delete them; only use_assistant_quota() inserts. A per-user advisory lock makes the
-- check-and-insert atomic, so parallel requests cannot all slip past the last free slot.

create table public.ai_usage (
  id         bigint generated always as identity primary key,
  owner_id   uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index ai_usage_owner_time on public.ai_usage (owner_id, created_at desc);

alter table public.ai_usage enable row level security;
create policy "ai usage: read own" on public.ai_usage
  for select to authenticated using (owner_id = (select auth.uid()));
revoke insert, update, delete on public.ai_usage from authenticated, anon;

-- Returns null and records one use when allowed, otherwise 'minute' or 'day' (nothing recorded).
-- Callers can pass any limits, but a call only ever adds to their own usage.
create or replace function public.use_assistant_quota(p_per_minute int, p_per_day int)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('ai_usage:' || v_uid::text, 0));
  if (select count(*) from public.ai_usage where owner_id = v_uid and created_at > now() - interval '1 minute') >= p_per_minute then
    return 'minute';
  end if;
  if (select count(*) from public.ai_usage where owner_id = v_uid and created_at > now() - interval '24 hours') >= p_per_day then
    return 'day';
  end if;
  insert into public.ai_usage (owner_id) values (v_uid);
  delete from public.ai_usage where owner_id = v_uid and created_at < now() - interval '2 days'; -- keep the table small
  return null;
end;
$$;

revoke execute on function public.use_assistant_quota(int, int) from public, anon;
grant execute on function public.use_assistant_quota(int, int) to authenticated;
