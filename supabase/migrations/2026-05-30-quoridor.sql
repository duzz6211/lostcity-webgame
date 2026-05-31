-- ============================================================
-- Quoridor — multiplayer (client-authoritative)
-- task/05-29-task-1.md §9.1 (online matching)
--
-- Rule validation lives in the TS engine (src/quoridor/engine).
-- The DB only enforces: (1) turn ownership by token, (2) optimistic
-- version match, (3) both players present before play.
--
-- Quoridor is perfect-information, so the *board state* is world-readable
-- and clients subscribe to quoridor_games row UPDATEs via Realtime.
-- Player tokens (the only secret) live in a SEPARATE, non-readable table
-- so they never reach clients via SELECT or Realtime payloads.
--
-- Re-runnable: drops & recreates everything. Run in Supabase SQL Editor.
-- ============================================================

drop function if exists quoridor_create(text) cascade;
drop function if exists quoridor_join(text, text) cascade;
drop function if exists quoridor_apply(text, text, jsonb, int) cascade;
drop function if exists quoridor_restart(text, text) cascade;
drop function if exists _quoridor_initial_state() cascade;
drop function if exists _quoridor_room_code() cascade;
drop table if exists quoridor_players cascade;
drop table if exists quoridor_games cascade;

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- Tables
-- ------------------------------------------------------------
-- Public board state (no secrets here).
create table quoridor_games (
  id uuid primary key default gen_random_uuid(),
  room_code text unique not null,
  state jsonb not null,             -- full GameState (see engine/types.ts)
  version int not null default 0,
  p1_present boolean not null default true,
  p2_present boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_quoridor_room on quoridor_games(room_code);

-- Secret identity tokens — never exposed to clients.
create table quoridor_players (
  game_id uuid not null references quoridor_games(id) on delete cascade,
  role text not null check (role in ('P1', 'P2')),
  token text not null,
  primary key (game_id, role)
);
create index idx_quoridor_players_token on quoridor_players(game_id, token);

-- ------------------------------------------------------------
-- RLS
--   games   : world-readable board state, writes via RPC only
--   players : no client access at all (RPC security-definer only)
-- ------------------------------------------------------------
alter table quoridor_games enable row level security;
alter table quoridor_players enable row level security;

create policy quoridor_read_all on quoridor_games for select using (true);
create policy quoridor_no_write on quoridor_games for all using (false) with check (false);
create policy quoridor_players_locked on quoridor_players for all using (false) with check (false);

grant select on quoridor_games to anon, authenticated;

-- ------------------------------------------------------------
-- Realtime: publish board-state row changes (no token table).
-- ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'quoridor_games'
  ) then
    alter publication supabase_realtime add table public.quoridor_games;
  end if;
end
$$;

-- Ensure UPDATE payloads carry the full new row.
alter table quoridor_games replica identity full;

-- ------------------------------------------------------------
-- Helpers
-- ------------------------------------------------------------
create or replace function _quoridor_room_code() returns text language plpgsql as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text := '';
  i int;
begin
  for i in 1..6 loop
    code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return code;
end
$$;

-- Initial 2-player state — must mirror engine/state.ts createInitialState().
create or replace function _quoridor_initial_state() returns jsonb language sql immutable as $$
  select '{
    "players": [
      {"id":"P1","position":{"col":4,"row":0},"wallsRemaining":10,"goalRow":8},
      {"id":"P2","position":{"col":4,"row":8},"wallsRemaining":10,"goalRow":0}
    ],
    "currentTurn": 0,
    "walls": [],
    "history": [],
    "winner": null,
    "status": "playing"
  }'::jsonb
$$;

-- ------------------------------------------------------------
-- create: P1 opens a room
-- ------------------------------------------------------------
create or replace function quoridor_create(_p1_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  _room_code text; _attempts int := 0; _game_id uuid;
begin
  loop
    _attempts := _attempts + 1;
    _room_code := _quoridor_room_code();
    exit when not exists (select 1 from quoridor_games where room_code = _room_code);
    if _attempts > 20 then raise exception 'could not allocate room code'; end if;
  end loop;

  insert into quoridor_games(room_code, state, version)
    values (_room_code, _quoridor_initial_state(), 0)
    returning id into _game_id;
  insert into quoridor_players(game_id, role, token) values (_game_id, 'P1', _p1_token);

  return jsonb_build_object('room_code', _room_code, 'role', 'P1');
end
$$;
grant execute on function quoridor_create(text) to anon, authenticated;

-- ------------------------------------------------------------
-- join: returns caller's role; claims P2 seat if open
-- ------------------------------------------------------------
create or replace function quoridor_join(_room_code text, _token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  _g quoridor_games;
  _role text;
begin
  _room_code := upper(_room_code);
  select * into _g from quoridor_games where room_code = _room_code for update;
  if not found then raise exception 'room not found'; end if;

  -- already seated?
  select role into _role from quoridor_players where game_id = _g.id and token = _token;
  if _role is not null then
    return jsonb_build_object('room_code', _room_code, 'role', _role);
  end if;

  -- claim open P2 seat
  if not _g.p2_present then
    insert into quoridor_players(game_id, role, token) values (_g.id, 'P2', _token);
    update quoridor_games set p2_present = true, version = version + 1 where id = _g.id;
    return jsonb_build_object('room_code', _room_code, 'role', 'P2');
  end if;

  raise exception 'room is full';
end
$$;
grant execute on function quoridor_join(text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- apply: store a client-computed next state, gated by turn + version
-- ------------------------------------------------------------
create or replace function quoridor_apply(
  _room_code text, _token text, _state jsonb, _expected_version int
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  _g quoridor_games;
  _role text;
  _cur int;
  _cur_id text;
begin
  _room_code := upper(_room_code);
  select * into _g from quoridor_games where room_code = _room_code for update;
  if not found then raise exception 'room not found'; end if;

  select role into _role from quoridor_players where game_id = _g.id and token = _token;
  if _role is null then raise exception 'not a player in this room'; end if;

  if not _g.p2_present then raise exception 'waiting for opponent'; end if;
  if _g.version <> _expected_version then raise exception 'stale version'; end if;

  -- player to move in the CURRENT (pre-move) state must be the caller
  _cur := (_g.state->>'currentTurn')::int;
  _cur_id := _g.state->'players'->_cur->>'id';
  if _cur_id <> _role then raise exception 'not your turn'; end if;

  update quoridor_games set state = _state, version = version + 1 where id = _g.id;
  return jsonb_build_object('version', _g.version + 1);
end
$$;
grant execute on function quoridor_apply(text, text, jsonb, int) to anon, authenticated;

-- ------------------------------------------------------------
-- restart: either player may reset the game
-- ------------------------------------------------------------
create or replace function quoridor_restart(_room_code text, _token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  _g quoridor_games;
  _role text;
begin
  _room_code := upper(_room_code);
  select * into _g from quoridor_games where room_code = _room_code for update;
  if not found then raise exception 'room not found'; end if;

  select role into _role from quoridor_players where game_id = _g.id and token = _token;
  if _role is null then raise exception 'not a player in this room'; end if;

  update quoridor_games
    set state = _quoridor_initial_state(), version = version + 1
    where id = _g.id;
  return jsonb_build_object('version', _g.version + 1);
end
$$;
grant execute on function quoridor_restart(text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- PostgREST schema cache reload
-- 새 RPC 함수를 만든 직후 API가 "Could not find the function ... in the
-- schema cache" 404 를 내면, 아래가 캐시를 즉시 갱신한다. (idempotent)
-- ------------------------------------------------------------
notify pgrst, 'reload schema';
