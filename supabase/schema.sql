-- Lost Cities — Supabase schema (3-round match + restart)
-- Re-run this whole file in Supabase SQL Editor; it drops and recreates everything.
-- After running, enable Realtime on the public.game_events table.

drop function if exists apply_action(text, text, jsonb) cascade;
drop function if exists get_state(text, text) cascade;
drop function if exists create_game(text) cascade;
drop function if exists create_game(text, text) cascade;
drop function if exists join_game(text, text) cascade;
drop function if exists next_round(text, text) cascade;
drop function if exists restart_match(text, text) cascade;
drop function if exists score_expedition(int[]) cascade;
drop function if exists gen_room_code() cascade;
drop function if exists card_color(int) cascade;
drop function if exists card_is_wager(int) cascade;
drop function if exists card_value(int) cascade;
drop table if exists game_events cascade;
drop table if exists games cascade;

create extension if not exists "pgcrypto";

-- ============================================================
-- Card helpers (id 0..59; color = id/12, slot = id%12, slot<3 = wager)
-- ============================================================

create or replace function card_color(_id int) returns text language sql immutable as $$
  select case _id / 12
    when 0 then 'r' when 1 then 'g' when 2 then 'b' when 3 then 'y' when 4 then 'w'
  end
$$;

create or replace function card_is_wager(_id int) returns boolean language sql immutable as $$
  select (_id % 12) < 3
$$;

create or replace function card_value(_id int) returns int language sql immutable as $$
  select case when (_id % 12) < 3 then null else (_id % 12) - 1 end
$$;

create or replace function score_expedition(_cards int[]) returns int language plpgsql immutable as $$
declare
  _numbers_sum int := 0;
  _wager_count int := 0;
  _card_id int;
  _score int;
  _len int;
begin
  _len := coalesce(array_length(_cards, 1), 0);
  if _len = 0 then return 0; end if;
  foreach _card_id in array _cards loop
    if card_is_wager(_card_id) then
      _wager_count := _wager_count + 1;
    else
      _numbers_sum := _numbers_sum + card_value(_card_id);
    end if;
  end loop;
  _score := (_numbers_sum - 20) * (1 + _wager_count);
  if _len >= 8 then _score := _score + 20; end if;
  return _score;
end
$$;

-- ============================================================
-- Tables
-- ============================================================

create table games (
  id uuid primary key default gen_random_uuid(),
  room_code text unique not null,

  -- Match config
  mode text not null default 'single',           -- 'single' | 'match3'
  max_rounds int not null default 1,
  current_round int not null default 1,

  -- Round state
  deck int[] not null,
  p1_hand int[] not null default '{}',
  p2_hand int[] not null default '{}',
  discards jsonb not null default '{"r":[],"g":[],"b":[],"y":[],"w":[]}'::jsonb,
  expeditions jsonb not null default '{"p1":{"r":[],"g":[],"b":[],"y":[],"w":[]},"p2":{"r":[],"g":[],"b":[],"y":[],"w":[]}}'::jsonb,
  turn text not null default 'p1',
  phase text not null default 'play_or_discard',
  last_discard_color text,
  first_player text not null default 'p1',       -- who started this round
  ended boolean not null default false,           -- current round done?

  -- Match cumulative
  cumulative_p1 int not null default 0,
  cumulative_p2 int not null default 0,
  round_history jsonb not null default '[]'::jsonb,  -- [{round, p1:{r,g,b,y,w,total}, p2:{...}}, ...]
  match_ended boolean not null default false,

  -- Identity / sync
  p1_token text not null,
  p2_token text,
  version int not null default 0,
  created_at timestamptz not null default now()
);

create table game_events (
  id bigserial primary key,
  game_id uuid not null references games(id) on delete cascade,
  version int not null,
  room_code text not null,
  created_at timestamptz not null default now()
);

create index idx_game_events_room on game_events(room_code, id desc);

-- ============================================================
-- RLS — block direct game reads (RPC-only); allow event reads for Realtime
-- ============================================================

alter table games enable row level security;
alter table game_events enable row level security;

create policy games_no_select on games for select using (false);
create policy games_no_modify on games for all using (false) with check (false);

create policy events_read_all on game_events for select using (true);
create policy events_no_write on game_events for all using (false) with check (false);

-- ============================================================
-- Room code
-- ============================================================

create or replace function gen_room_code() returns text language plpgsql as $$
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

-- ============================================================
-- Internal helpers
-- ============================================================

create or replace function _fresh_deck() returns int[] language sql as $$
  select array_agg(i order by random()) from generate_series(0, 59) i
$$;

create or replace function _empty_expeditions() returns jsonb language sql immutable as $$
  select '{"p1":{"r":[],"g":[],"b":[],"y":[],"w":[]},"p2":{"r":[],"g":[],"b":[],"y":[],"w":[]}}'::jsonb
$$;

create or replace function _empty_discards() returns jsonb language sql immutable as $$
  select '{"r":[],"g":[],"b":[],"y":[],"w":[]}'::jsonb
$$;

-- Compute one player's round breakdown as jsonb {r,g,b,y,w,total}
create or replace function _score_breakdown(_expeditions jsonb, _player text)
returns jsonb language plpgsql immutable as $$
declare
  _out jsonb := '{}'::jsonb;
  _color text;
  _exp int[];
  _s int;
  _total int := 0;
begin
  foreach _color in array array['r','g','b','y','w'] loop
    _exp := array(select jsonb_array_elements_text(_expeditions->_player->_color)::int);
    _s := score_expedition(_exp);
    _out := jsonb_set(_out, array[_color], to_jsonb(_s));
    _total := _total + _s;
  end loop;
  _out := jsonb_set(_out, array['total'], to_jsonb(_total));
  return _out;
end
$$;

-- ============================================================
-- create_game(token, mode)
-- ============================================================

create or replace function create_game(_p1_token text, _mode text default 'single')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  _deck int[]; _hand int[]; _n int;
  _room_code text; _attempts int := 0; _game_id uuid;
  _max_rounds int;
begin
  if _mode not in ('single', 'match3') then raise exception 'Invalid mode' using errcode = 'P0001'; end if;
  _max_rounds := case when _mode = 'match3' then 3 else 1 end;

  _deck := _fresh_deck();
  _n := array_length(_deck, 1);
  _hand := _deck[(_n - 7):_n];
  _deck := _deck[1:(_n - 8)];

  loop
    _attempts := _attempts + 1;
    _room_code := gen_room_code();
    exit when not exists(select 1 from games where room_code = _room_code);
    if _attempts > 25 then raise exception 'Failed to generate room code'; end if;
  end loop;

  insert into games(room_code, mode, max_rounds, deck, p1_hand, p1_token)
    values (_room_code, _mode, _max_rounds, _deck, _hand, _p1_token)
    returning id into _game_id;

  insert into game_events(game_id, version, room_code) values (_game_id, 0, _room_code);

  return jsonb_build_object('room_code', _room_code, 'role', 'p1');
end
$$;

grant execute on function create_game(text, text) to anon, authenticated;

-- ============================================================
-- join_game
-- ============================================================

create or replace function join_game(_room_code text, _p2_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  _g games%rowtype; _hand int[]; _deck int[]; _n int; _new_version int;
begin
  _room_code := upper(_room_code);
  select * into _g from games where room_code = _room_code for update;
  if not found then raise exception 'Room not found' using errcode = 'P0001'; end if;

  if _g.p1_token = _p2_token then
    return jsonb_build_object('room_code', _room_code, 'role', 'p1');
  end if;
  if _g.p2_token is not null then
    if _g.p2_token = _p2_token then
      return jsonb_build_object('room_code', _room_code, 'role', 'p2');
    end if;
    raise exception 'Room is full' using errcode = 'P0001';
  end if;

  _deck := _g.deck;
  _n := array_length(_deck, 1);
  _hand := _deck[(_n - 7):_n];
  _deck := _deck[1:(_n - 8)];

  _new_version := _g.version + 1;

  update games set
    deck = _deck,
    p2_hand = _hand,
    p2_token = _p2_token,
    version = _new_version
  where id = _g.id;

  insert into game_events(game_id, version, room_code) values (_g.id, _new_version, _room_code);

  return jsonb_build_object('room_code', _room_code, 'role', 'p2');
end
$$;

grant execute on function join_game(text, text) to anon, authenticated;

-- ============================================================
-- get_state
-- ============================================================

create or replace function get_state(_room_code text, _token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  _g games%rowtype; _role text; _my_hand int[]; _opp_count int;
begin
  _room_code := upper(_room_code);
  select * into _g from games where room_code = _room_code;
  if not found then raise exception 'Room not found' using errcode = 'P0001'; end if;

  if _g.p1_token = _token then
    _role := 'p1'; _my_hand := _g.p1_hand; _opp_count := coalesce(array_length(_g.p2_hand, 1), 0);
  elsif _g.p2_token = _token then
    _role := 'p2'; _my_hand := _g.p2_hand; _opp_count := coalesce(array_length(_g.p1_hand, 1), 0);
  else
    raise exception 'Invalid token' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'room_code', _g.room_code,
    'mode', _g.mode,
    'max_rounds', _g.max_rounds,
    'current_round', _g.current_round,
    'role', _role,
    'my_hand', to_jsonb(_my_hand),
    'opponent_hand_count', _opp_count,
    'deck_count', coalesce(array_length(_g.deck, 1), 0),
    'discards', _g.discards,
    'expeditions', _g.expeditions,
    'turn', _g.turn,
    'phase', _g.phase,
    'last_discard_color', _g.last_discard_color,
    'first_player', _g.first_player,
    'ended', _g.ended,
    'match_ended', _g.match_ended,
    'cumulative', jsonb_build_object('p1', _g.cumulative_p1, 'p2', _g.cumulative_p2),
    'round_history', _g.round_history,
    'version', _g.version,
    'p2_joined', _g.p2_token is not null
  );
end
$$;

grant execute on function get_state(text, text) to anon, authenticated;

-- ============================================================
-- apply_action — also computes scores + cumulative when round ends
-- ============================================================

create or replace function apply_action(_room_code text, _token text, _action jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  _g games%rowtype;
  _role text; _other_role text;
  _my_hand int[];
  _action_type text;
  _card_id int; _color text;
  _card_color text; _card_value int; _is_wager boolean;
  _expedition int[]; _max_in_exp int; _has_number boolean; _wager_len int;
  _discards jsonb; _expeditions jsonb; _deck int[];
  _drew_card int; _idx int;
  _new_phase text; _new_turn text; _new_version int;
  _last_discard_color text;
  _round_ended boolean := false; _match_ended boolean;
  _p1_break jsonb; _p2_break jsonb;
  _p1_total int; _p2_total int;
  _new_cum_p1 int; _new_cum_p2 int;
  _new_history jsonb;
begin
  _room_code := upper(_room_code);
  select * into _g from games where room_code = _room_code for update;
  if not found then raise exception 'Room not found' using errcode = 'P0001'; end if;
  if _g.match_ended then raise exception 'Match already ended' using errcode = 'P0001'; end if;
  if _g.ended then raise exception 'Round already ended — start next round' using errcode = 'P0001'; end if;
  if _g.p2_token is null then raise exception 'Waiting for opponent' using errcode = 'P0001'; end if;

  if _g.p1_token = _token then _role := 'p1'; _other_role := 'p2';
  elsif _g.p2_token = _token then _role := 'p2'; _other_role := 'p1';
  else raise exception 'Invalid token' using errcode = 'P0001';
  end if;

  if _g.turn <> _role then raise exception 'Not your turn' using errcode = 'P0001'; end if;

  _action_type := _action->>'type';
  if _role = 'p1' then _my_hand := _g.p1_hand; else _my_hand := _g.p2_hand; end if;
  _discards := _g.discards;
  _expeditions := _g.expeditions;
  _deck := _g.deck;
  _last_discard_color := _g.last_discard_color;
  _new_phase := _g.phase;

  if _action_type = 'PLAY' or _action_type = 'DISCARD' then
    if _g.phase <> 'play_or_discard' then raise exception 'Wrong phase' using errcode = 'P0001'; end if;
    _card_id := (_action->>'cardId')::int;
    if not (_card_id = ANY(_my_hand)) then raise exception 'Card not in hand' using errcode = 'P0001'; end if;

    _card_color := card_color(_card_id);
    _is_wager := card_is_wager(_card_id);
    _card_value := card_value(_card_id);

    if _action_type = 'PLAY' then
      _expedition := array(select jsonb_array_elements_text(_expeditions->_role->_card_color)::int);

      if _is_wager then
        _has_number := exists(select 1 from unnest(_expedition) e where not card_is_wager(e));
        if _has_number then raise exception 'Cannot play wager after a number card' using errcode = 'P0001'; end if;
        _wager_len := coalesce(array_length(_expedition, 1), 0);
        if _wager_len >= 3 then raise exception 'Wager limit (3) reached' using errcode = 'P0001'; end if;
      else
        select max(card_value(e)) into _max_in_exp from unnest(_expedition) e where not card_is_wager(e);
        if _max_in_exp is not null and _card_value <= _max_in_exp then
          raise exception 'Number card must be strictly greater than last' using errcode = 'P0001';
        end if;
      end if;

      _expeditions := jsonb_set(_expeditions, array[_role, _card_color],
        (_expeditions->_role->_card_color) || to_jsonb(_card_id));
      _last_discard_color := null;
    else
      _discards := jsonb_set(_discards, array[_card_color],
        (_discards->_card_color) || to_jsonb(_card_id));
      _last_discard_color := _card_color;
    end if;

    _my_hand := array_remove(_my_hand, _card_id);
    _new_phase := 'draw';

  elsif _action_type = 'DRAW_FROM_DECK' then
    if _g.phase <> 'draw' then raise exception 'Wrong phase' using errcode = 'P0001'; end if;
    if coalesce(array_length(_deck, 1), 0) = 0 then raise exception 'Deck is empty' using errcode = 'P0001'; end if;
    _drew_card := _deck[array_length(_deck, 1)];
    _deck := _deck[1 : array_length(_deck, 1) - 1];
    _my_hand := _my_hand || _drew_card;
    _new_phase := 'play_or_discard';
    _last_discard_color := null;

  elsif _action_type = 'DRAW_FROM_DISCARD' then
    if _g.phase <> 'draw' then raise exception 'Wrong phase' using errcode = 'P0001'; end if;
    _color := _action->>'color';
    if _color is null then raise exception 'Missing color' using errcode = 'P0001'; end if;
    if _color = _last_discard_color then raise exception 'Cannot draw from the pile you just discarded to' using errcode = 'P0001'; end if;
    if coalesce(jsonb_array_length(_discards->_color), 0) = 0 then raise exception 'Discard pile is empty' using errcode = 'P0001'; end if;
    _idx := jsonb_array_length(_discards->_color) - 1;
    _drew_card := (_discards->_color->>_idx)::int;
    _discards := jsonb_set(_discards, array[_color], (_discards->_color) - _idx);
    _my_hand := _my_hand || _drew_card;
    _new_phase := 'play_or_discard';
    _last_discard_color := null;

  else
    raise exception 'Unknown action type: %', _action_type using errcode = 'P0001';
  end if;

  _new_turn := _g.turn;
  _new_cum_p1 := _g.cumulative_p1;
  _new_cum_p2 := _g.cumulative_p2;
  _new_history := _g.round_history;
  _match_ended := _g.match_ended;

  if _new_phase = 'play_or_discard' then
    _new_turn := _other_role;
    if coalesce(array_length(_deck, 1), 0) = 0 then
      _round_ended := true;
      _p1_break := _score_breakdown(_expeditions, 'p1');
      _p2_break := _score_breakdown(_expeditions, 'p2');
      _p1_total := (_p1_break->>'total')::int;
      _p2_total := (_p2_break->>'total')::int;
      _new_cum_p1 := _new_cum_p1 + _p1_total;
      _new_cum_p2 := _new_cum_p2 + _p2_total;
      _new_history := _new_history || jsonb_build_array(jsonb_build_object(
        'round', _g.current_round,
        'p1', _p1_break,
        'p2', _p2_break
      ));
      if _g.current_round >= _g.max_rounds then _match_ended := true; end if;
    end if;
  end if;

  _new_version := _g.version + 1;

  if _role = 'p1' then
    update games set deck = _deck, p1_hand = _my_hand, discards = _discards, expeditions = _expeditions,
      turn = _new_turn, phase = _new_phase, last_discard_color = _last_discard_color,
      ended = _round_ended, match_ended = _match_ended,
      cumulative_p1 = _new_cum_p1, cumulative_p2 = _new_cum_p2,
      round_history = _new_history, version = _new_version
    where id = _g.id;
  else
    update games set deck = _deck, p2_hand = _my_hand, discards = _discards, expeditions = _expeditions,
      turn = _new_turn, phase = _new_phase, last_discard_color = _last_discard_color,
      ended = _round_ended, match_ended = _match_ended,
      cumulative_p1 = _new_cum_p1, cumulative_p2 = _new_cum_p2,
      round_history = _new_history, version = _new_version
    where id = _g.id;
  end if;

  insert into game_events(game_id, version, room_code) values (_g.id, _new_version, _room_code);

  return jsonb_build_object('ok', true, 'version', _new_version, 'ended', _round_ended, 'match_ended', _match_ended);
end
$$;

grant execute on function apply_action(text, text, jsonb) to anon, authenticated;

-- ============================================================
-- next_round — advance to the next round of a match
--   First player = loser of previous round; alternate on tie.
-- ============================================================

create or replace function next_round(_room_code text, _token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  _g games%rowtype;
  _last jsonb; _p1_total int; _p2_total int;
  _first text;
  _deck int[]; _p1_hand int[]; _p2_hand int[]; _n int;
  _new_version int;
begin
  _room_code := upper(_room_code);
  select * into _g from games where room_code = _room_code for update;
  if not found then raise exception 'Room not found' using errcode = 'P0001'; end if;
  if _g.match_ended then raise exception 'Match already ended — use restart_match' using errcode = 'P0001'; end if;
  if not _g.ended then raise exception 'Current round is not finished' using errcode = 'P0001'; end if;
  if _g.p1_token <> _token and _g.p2_token <> _token then
    raise exception 'Invalid token' using errcode = 'P0001';
  end if;

  -- Determine next round's first player from the round we just finished.
  _last := _g.round_history->(jsonb_array_length(_g.round_history) - 1);
  _p1_total := (_last->'p1'->>'total')::int;
  _p2_total := (_last->'p2'->>'total')::int;
  if _p1_total < _p2_total then _first := 'p1';
  elsif _p2_total < _p1_total then _first := 'p2';
  else _first := case when _g.first_player = 'p1' then 'p2' else 'p1' end;
  end if;

  _deck := _fresh_deck();
  _n := array_length(_deck, 1);
  _p1_hand := _deck[(_n - 7):_n];
  _deck := _deck[1:(_n - 8)];
  _n := array_length(_deck, 1);
  _p2_hand := _deck[(_n - 7):_n];
  _deck := _deck[1:(_n - 8)];

  _new_version := _g.version + 1;

  update games set
    current_round = _g.current_round + 1,
    deck = _deck,
    p1_hand = _p1_hand,
    p2_hand = _p2_hand,
    discards = _empty_discards(),
    expeditions = _empty_expeditions(),
    turn = _first,
    first_player = _first,
    phase = 'play_or_discard',
    last_discard_color = null,
    ended = false,
    version = _new_version
  where id = _g.id;

  insert into game_events(game_id, version, room_code) values (_g.id, _new_version, _room_code);

  return jsonb_build_object('ok', true, 'round', _g.current_round + 1, 'first_player', _first);
end
$$;

grant execute on function next_round(text, text) to anon, authenticated;

-- ============================================================
-- restart_match — reset the whole match in the same room
-- ============================================================

create or replace function restart_match(_room_code text, _token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  _g games%rowtype;
  _deck int[]; _p1_hand int[]; _p2_hand int[]; _n int;
  _first text; _new_version int;
begin
  _room_code := upper(_room_code);
  select * into _g from games where room_code = _room_code for update;
  if not found then raise exception 'Room not found' using errcode = 'P0001'; end if;
  if _g.p1_token <> _token and _g.p2_token <> _token then
    raise exception 'Invalid token' using errcode = 'P0001';
  end if;
  if _g.p2_token is null then raise exception 'Opponent has not joined yet' using errcode = 'P0001'; end if;

  -- First player: if a match just finished, give it to the loser; otherwise alternate.
  if _g.match_ended then
    if _g.cumulative_p1 < _g.cumulative_p2 then _first := 'p1';
    elsif _g.cumulative_p2 < _g.cumulative_p1 then _first := 'p2';
    else _first := case when _g.first_player = 'p1' then 'p2' else 'p1' end;
    end if;
  else
    _first := case when _g.first_player = 'p1' then 'p2' else 'p1' end;
  end if;

  _deck := _fresh_deck();
  _n := array_length(_deck, 1);
  _p1_hand := _deck[(_n - 7):_n];
  _deck := _deck[1:(_n - 8)];
  _n := array_length(_deck, 1);
  _p2_hand := _deck[(_n - 7):_n];
  _deck := _deck[1:(_n - 8)];

  _new_version := _g.version + 1;

  update games set
    current_round = 1,
    deck = _deck,
    p1_hand = _p1_hand,
    p2_hand = _p2_hand,
    discards = _empty_discards(),
    expeditions = _empty_expeditions(),
    turn = _first,
    first_player = _first,
    phase = 'play_or_discard',
    last_discard_color = null,
    ended = false,
    match_ended = false,
    cumulative_p1 = 0,
    cumulative_p2 = 0,
    round_history = '[]'::jsonb,
    version = _new_version
  where id = _g.id;

  insert into game_events(game_id, version, room_code) values (_g.id, _new_version, _room_code);

  return jsonb_build_object('ok', true, 'first_player', _first);
end
$$;

grant execute on function restart_match(text, text) to anon, authenticated;
