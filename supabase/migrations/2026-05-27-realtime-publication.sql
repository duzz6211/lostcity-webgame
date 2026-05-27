-- Migration: ensure game_events is in the supabase_realtime publication.
--
-- Problem: PvP rooms required both sides to refresh to see the opponent's move,
-- because the postgres_changes subscription on public.game_events never received
-- events. The schema's RLS and the RPC INSERTs are correct; the missing piece is
-- that the table must be a member of the `supabase_realtime` publication for
-- the Realtime service to broadcast INSERTs. This step was previously a manual
-- dashboard click ("enable Realtime on the table") and got lost when the
-- table was recreated.
--
-- This migration is idempotent — safe to re-run.

do $$
begin
  -- Create the publication if it's missing (rare — Supabase projects ship with it,
  -- but if it was dropped or never existed, we recreate it empty).
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  -- Add game_events to the publication if not already a member.
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'game_events'
  ) then
    alter publication supabase_realtime add table public.game_events;
  end if;
end
$$;
