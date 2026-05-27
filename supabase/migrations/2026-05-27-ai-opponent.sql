-- Migration: AI opponent support.
-- Adds is_ai_p2 column, create_ai_game RPC, and extends get_state with is_ai_p2 + ai_token.
-- Safe to run on an existing database; preserves rooms and history.

-- ============================================================
-- 1. Column: is_ai_p2
-- ============================================================

alter table games add column if not exists is_ai_p2 boolean not null default false;

-- ============================================================
-- 2. Replace get_state to surface is_ai_p2 + ai_token (the latter only to p1 of an AI room).
-- ============================================================

drop function if exists get_state(text, text) cascade;

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
    'ruleset', _g.ruleset,
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
    'goals', _g.goals,
    'turn_started_at', _g.turn_started_at,
    'version', _g.version,
    'p2_joined', _g.p2_token is not null,
    'is_ai_p2', _g.is_ai_p2,
    'ai_token', case when _g.is_ai_p2 and _role = 'p1' then _g.p2_token else null end
  );
end
$$;

grant execute on function get_state(text, text) to anon, authenticated;

-- ============================================================
-- 3. create_ai_game — create a room and seat the AI as p2 in one transaction.
-- ============================================================

drop function if exists create_ai_game(text, text, text) cascade;

create or replace function create_ai_game(_p1_token text, _mode text default 'single', _ruleset text default '5rule')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  _deck int[]; _p1_hand int[]; _p2_hand int[]; _n int;
  _room_code text; _attempts int := 0; _game_id uuid;
  _max_rounds int;
  _goals jsonb;
  _ai_token text;
begin
  if _mode not in ('single', 'match3') then raise exception 'Invalid mode' using errcode = 'P0001'; end if;
  if _ruleset not in ('5rule', '6rule') then raise exception 'Invalid ruleset' using errcode = 'P0001'; end if;
  _max_rounds := case when _mode = 'match3' then 3 else 1 end;

  _deck := _fresh_deck(_ruleset);
  _n := array_length(_deck, 1);
  _p1_hand := _deck[(_n - 7):_n];
  _deck := _deck[1:(_n - 8)];
  _n := array_length(_deck, 1);
  _p2_hand := _deck[(_n - 7):_n];
  _deck := _deck[1:(_n - 8)];

  _goals := case when _ruleset = '6rule' then _gen_goals() else '[]'::jsonb end;
  _ai_token := gen_random_uuid()::text;

  loop
    _attempts := _attempts + 1;
    _room_code := gen_room_code();
    exit when not exists(select 1 from games where room_code = _room_code);
    if _attempts > 25 then raise exception 'Failed to generate room code'; end if;
  end loop;

  insert into games(room_code, mode, ruleset, max_rounds, deck,
                    p1_hand, p2_hand, p1_token, p2_token, is_ai_p2,
                    discards, expeditions, goals)
    values (_room_code, _mode, _ruleset, _max_rounds, _deck,
            _p1_hand, _p2_hand, _p1_token, _ai_token, true,
            _empty_discards(_ruleset), _empty_expeditions(_ruleset), _goals)
    returning id into _game_id;

  insert into game_events(game_id, version, room_code) values (_game_id, 0, _room_code);

  return jsonb_build_object('room_code', _room_code, 'role', 'p1', 'ai_token', _ai_token);
end
$$;

grant execute on function create_ai_game(text, text, text) to anon, authenticated;
