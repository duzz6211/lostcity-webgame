-- Migration: add 6-rule (purple cards + goal cards) and 60s turn timer.
-- Safe to run on an existing database; preserves rooms and history.
-- After running, re-run schema.sql functions (or this file replaces them inline below).

-- ============================================================
-- 1. Add new columns (idempotent)
-- ============================================================

alter table games add column if not exists ruleset text not null default '5rule';
alter table games add column if not exists goals jsonb not null default '[]'::jsonb;
alter table games add column if not exists turn_started_at timestamptz not null default now();

-- ============================================================
-- 2. Replace card_color to know about purple (color index 5)
-- ============================================================

create or replace function card_color(_id int) returns text language sql immutable as $$
  select case _id / 12
    when 0 then 'r' when 1 then 'g' when 2 then 'b' when 3 then 'y' when 4 then 'w' when 5 then 'p'
  end
$$;

-- ============================================================
-- 3. Ruleset-aware helpers (drop old signatures, create new)
-- ============================================================

drop function if exists _fresh_deck() cascade;
drop function if exists _empty_expeditions() cascade;
drop function if exists _empty_discards() cascade;
drop function if exists _score_breakdown(jsonb, text) cascade;

create or replace function _fresh_deck(_ruleset text) returns int[] language sql as $$
  select array_agg(i order by random())
  from generate_series(0, case when _ruleset = '6rule' then 71 else 59 end) i
$$;

create or replace function _empty_expeditions(_ruleset text) returns jsonb language sql immutable as $$
  select case when _ruleset = '6rule' then
    '{"p1":{"r":[],"g":[],"b":[],"y":[],"w":[],"p":[]},"p2":{"r":[],"g":[],"b":[],"y":[],"w":[],"p":[]}}'::jsonb
  else
    '{"p1":{"r":[],"g":[],"b":[],"y":[],"w":[]},"p2":{"r":[],"g":[],"b":[],"y":[],"w":[]}}'::jsonb
  end
$$;

create or replace function _empty_discards(_ruleset text) returns jsonb language sql immutable as $$
  select case when _ruleset = '6rule' then
    '{"r":[],"g":[],"b":[],"y":[],"w":[],"p":[]}'::jsonb
  else
    '{"r":[],"g":[],"b":[],"y":[],"w":[]}'::jsonb
  end
$$;

-- ============================================================
-- 4. Goal pool, generator, evaluator
-- ============================================================

create or replace function _goal_pool() returns jsonb language sql immutable as $$
  select '[
    {"id":"first_color_3",        "description":"한 색에 3장 먼저 놓기",        "points":5},
    {"id":"first_total_5",        "description":"총 5장 먼저 놓기",            "points":5},
    {"id":"first_purple_start",   "description":"보라색 탐험 먼저 시작",        "points":5},
    {"id":"first_2_colors",       "description":"2가지 색 탐험 먼저 시작",      "points":6},
    {"id":"first_3_colors",       "description":"3가지 색 탐험 먼저 시작",      "points":9},
    {"id":"first_color_5",        "description":"한 색에 5장 먼저 놓기",       "points":10},
    {"id":"first_color_score_20", "description":"한 색에 +20점 먼저",          "points":10},
    {"id":"first_2_wagers",       "description":"협상카드 2장 먼저 놓기",      "points":8},
    {"id":"first_color_3_wagers", "description":"한 색에 협상카드 3장 먼저",    "points":12},
    {"id":"first_4_colors",       "description":"4가지 색 탐험 먼저 시작",     "points":14},
    {"id":"first_color_score_50", "description":"한 색에 +50점 먼저",          "points":18}
  ]'::jsonb
$$;

create or replace function _gen_goals() returns jsonb language plpgsql as $$
declare
  _pool jsonb := _goal_pool();
  _arr jsonb[];
  _picked jsonb := '[]'::jsonb;
  _i int;
  _idx int;
  _g jsonb;
begin
  _arr := array(select jsonb_array_elements(_pool));
  for _i in 1..3 loop
    _idx := 1 + floor(random() * array_length(_arr, 1))::int;
    _g := _arr[_idx];
    _arr := _arr[1:_idx-1] || _arr[_idx+1:array_length(_arr, 1)];
    _picked := _picked || jsonb_build_array(_g || '{"claimed_by":null}'::jsonb);
  end loop;
  return _picked;
end
$$;

create or replace function _goal_achieved(_goal_id text, _player_exp jsonb)
returns boolean language plpgsql immutable as $$
declare
  _color text;
  _exp int[];
  _started int := 0;
  _total_cards int := 0;
  _wagers_total int := 0;
  _wagers_color int;
  _len int;
  _score int;
begin
  for _color in select * from jsonb_object_keys(_player_exp) loop
    _exp := array(select jsonb_array_elements_text(_player_exp->_color)::int);
    _len := coalesce(array_length(_exp, 1), 0);
    if _len > 0 then
      _started := _started + 1;
      _total_cards := _total_cards + _len;
    end if;
    _wagers_color := 0;
    if _len > 0 then
      _wagers_color := (select count(*) from unnest(_exp) e where card_is_wager(e));
      _wagers_total := _wagers_total + _wagers_color;
    end if;

    case _goal_id
      when 'first_color_3'        then if _len >= 3 then return true; end if;
      when 'first_color_5'        then if _len >= 5 then return true; end if;
      when 'first_color_3_wagers' then if _wagers_color >= 3 then return true; end if;
      when 'first_color_score_20' then
        _score := score_expedition(_exp);
        if _score >= 20 then return true; end if;
      when 'first_color_score_50' then
        _score := score_expedition(_exp);
        if _score >= 50 then return true; end if;
      when 'first_purple_start'   then if _color = 'p' and _len >= 1 then return true; end if;
      else null;
    end case;
  end loop;

  case _goal_id
    when 'first_total_5'    then return _total_cards >= 5;
    when 'first_2_wagers'   then return _wagers_total >= 2;
    when 'first_2_colors'   then return _started >= 2;
    when 'first_3_colors'   then return _started >= 3;
    when 'first_4_colors'   then return _started >= 4;
    else return false;
  end case;
end
$$;

create or replace function _eval_goals(_goals jsonb, _player_exp jsonb, _player text)
returns jsonb language plpgsql immutable as $$
declare
  _out jsonb := '[]'::jsonb;
  _g jsonb;
  _id text;
begin
  for _g in select * from jsonb_array_elements(_goals) loop
    if _g->>'claimed_by' is null then
      _id := _g->>'id';
      if _goal_achieved(_id, _player_exp) then
        _g := jsonb_set(_g, '{claimed_by}', to_jsonb(_player));
      end if;
    end if;
    _out := _out || jsonb_build_array(_g);
  end loop;
  return _out;
end
$$;

create or replace function _score_breakdown(_expeditions jsonb, _player text, _ruleset text, _goals jsonb)
returns jsonb language plpgsql immutable as $$
declare
  _out jsonb := '{}'::jsonb;
  _color text;
  _exp int[];
  _s int;
  _total int := 0;
  _goal_points int := 0;
  _g jsonb;
  _colors text[];
begin
  if _ruleset = '6rule' then
    _colors := array['r','g','b','y','w','p'];
  else
    _colors := array['r','g','b','y','w'];
  end if;

  foreach _color in array _colors loop
    _exp := array(select jsonb_array_elements_text(_expeditions->_player->_color)::int);
    _s := score_expedition(_exp);
    _out := jsonb_set(_out, array[_color], to_jsonb(_s));
    _total := _total + _s;
  end loop;

  if _goals is not null then
    for _g in select * from jsonb_array_elements(_goals) loop
      if (_g->>'claimed_by') = _player then
        _goal_points := _goal_points + ((_g->>'points')::int);
      end if;
    end loop;
  end if;

  _out := jsonb_set(_out, array['goals'], to_jsonb(_goal_points));
  _total := _total + _goal_points;
  _out := jsonb_set(_out, array['total'], to_jsonb(_total));
  return _out;
end
$$;

-- ============================================================
-- 5. Replace create_game / get_state / apply_action / next_round / restart_match
--    with ruleset-aware versions, plus a new timeout_action.
--    Drop old signatures first.
-- ============================================================

drop function if exists create_game(text, text) cascade;
drop function if exists create_game(text) cascade;
drop function if exists apply_action(text, text, jsonb) cascade;
drop function if exists get_state(text, text) cascade;
drop function if exists next_round(text, text) cascade;
drop function if exists restart_match(text, text) cascade;

create or replace function create_game(_p1_token text, _mode text default 'single', _ruleset text default '5rule')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  _deck int[]; _hand int[]; _n int;
  _room_code text; _attempts int := 0; _game_id uuid;
  _max_rounds int;
  _goals jsonb;
begin
  if _mode not in ('single', 'match3') then raise exception 'Invalid mode' using errcode = 'P0001'; end if;
  if _ruleset not in ('5rule', '6rule') then raise exception 'Invalid ruleset' using errcode = 'P0001'; end if;
  _max_rounds := case when _mode = 'match3' then 3 else 1 end;

  _deck := _fresh_deck(_ruleset);
  _n := array_length(_deck, 1);
  _hand := _deck[(_n - 7):_n];
  _deck := _deck[1:(_n - 8)];

  _goals := case when _ruleset = '6rule' then _gen_goals() else '[]'::jsonb end;

  loop
    _attempts := _attempts + 1;
    _room_code := gen_room_code();
    exit when not exists(select 1 from games where room_code = _room_code);
    if _attempts > 25 then raise exception 'Failed to generate room code'; end if;
  end loop;

  insert into games(room_code, mode, ruleset, max_rounds, deck, p1_hand, p1_token,
                    discards, expeditions, goals)
    values (_room_code, _mode, _ruleset, _max_rounds, _deck, _hand, _p1_token,
            _empty_discards(_ruleset), _empty_expeditions(_ruleset), _goals)
    returning id into _game_id;

  insert into game_events(game_id, version, room_code) values (_game_id, 0, _room_code);

  return jsonb_build_object('room_code', _room_code, 'role', 'p1');
end
$$;

grant execute on function create_game(text, text, text) to anon, authenticated;

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
    turn_started_at = now(),
    version = _new_version
  where id = _g.id;

  insert into game_events(game_id, version, room_code) values (_g.id, _new_version, _room_code);

  return jsonb_build_object('room_code', _room_code, 'role', 'p2');
end
$$;

grant execute on function join_game(text, text) to anon, authenticated;

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
    'p2_joined', _g.p2_token is not null
  );
end
$$;

grant execute on function get_state(text, text) to anon, authenticated;

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
  _goals jsonb;
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
  _goals := _g.goals;
  _last_discard_color := _g.last_discard_color;
  _new_phase := _g.phase;

  if _action_type = 'PLAY' or _action_type = 'DISCARD' then
    if _g.phase <> 'play_or_discard' then raise exception 'Wrong phase' using errcode = 'P0001'; end if;
    _card_id := (_action->>'cardId')::int;
    if not (_card_id = ANY(_my_hand)) then raise exception 'Card not in hand' using errcode = 'P0001'; end if;

    _card_color := card_color(_card_id);
    _is_wager := card_is_wager(_card_id);
    _card_value := card_value(_card_id);

    if _g.ruleset = '5rule' and _card_color = 'p' then
      raise exception 'Purple cards only allowed in 6-rule' using errcode = 'P0001';
    end if;

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

      if _g.ruleset = '6rule' then
        _goals := _eval_goals(_goals, _expeditions->_role, _role);
      end if;
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
      _p1_break := _score_breakdown(_expeditions, 'p1', _g.ruleset, _goals);
      _p2_break := _score_breakdown(_expeditions, 'p2', _g.ruleset, _goals);
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
      goals = _goals,
      turn = _new_turn, phase = _new_phase, last_discard_color = _last_discard_color,
      ended = _round_ended, match_ended = _match_ended,
      turn_started_at = now(),
      cumulative_p1 = _new_cum_p1, cumulative_p2 = _new_cum_p2,
      round_history = _new_history, version = _new_version
    where id = _g.id;
  else
    update games set deck = _deck, p2_hand = _my_hand, discards = _discards, expeditions = _expeditions,
      goals = _goals,
      turn = _new_turn, phase = _new_phase, last_discard_color = _last_discard_color,
      ended = _round_ended, match_ended = _match_ended,
      turn_started_at = now(),
      cumulative_p1 = _new_cum_p1, cumulative_p2 = _new_cum_p2,
      round_history = _new_history, version = _new_version
    where id = _g.id;
  end if;

  insert into game_events(game_id, version, room_code) values (_g.id, _new_version, _room_code);

  return jsonb_build_object('ok', true, 'version', _new_version, 'ended', _round_ended, 'match_ended', _match_ended);
end
$$;

grant execute on function apply_action(text, text, jsonb) to anon, authenticated;

create or replace function timeout_action(_room_code text, _token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  _g games%rowtype;
  _role text; _other_role text;
  _my_hand int[];
  _expeditions jsonb; _discards jsonb; _deck int[]; _goals jsonb;
  _colors text[];
  _exp int[];
  _card_id int; _played boolean := false;
  _card_color text; _is_wager boolean; _card_value int;
  _max_in_exp int; _wager_len int; _has_number boolean;
  _last_discard_color text;
  _drew_card int;
  _round_ended boolean := false; _match_ended boolean;
  _p1_break jsonb; _p2_break jsonb;
  _p1_total int; _p2_total int;
  _new_cum_p1 int; _new_cum_p2 int;
  _new_history jsonb;
  _new_version int;
  _now timestamptz := now();
begin
  _room_code := upper(_room_code);
  select * into _g from games where room_code = _room_code for update;
  if not found then raise exception 'Room not found' using errcode = 'P0001'; end if;
  if _g.match_ended then raise exception 'Match already ended' using errcode = 'P0001'; end if;
  if _g.ended then raise exception 'Round already ended' using errcode = 'P0001'; end if;
  if _g.p2_token is null then raise exception 'Waiting for opponent' using errcode = 'P0001'; end if;
  if _g.p1_token <> _token and _g.p2_token <> _token then
    raise exception 'Invalid token' using errcode = 'P0001';
  end if;

  if extract(epoch from (_now - _g.turn_started_at)) < 60 then
    raise exception 'Turn timer has not elapsed' using errcode = 'P0001';
  end if;

  _role := _g.turn;
  _other_role := case when _role = 'p1' then 'p2' else 'p1' end;
  if _role = 'p1' then _my_hand := _g.p1_hand; else _my_hand := _g.p2_hand; end if;

  _expeditions := _g.expeditions;
  _discards := _g.discards;
  _deck := _g.deck;
  _goals := _g.goals;
  _last_discard_color := _g.last_discard_color;

  if _g.ruleset = '6rule' then _colors := array['r','g','b','y','w','p']; else _colors := array['r','g','b','y','w']; end if;

  if _g.phase = 'play_or_discard' then
    foreach _card_id in array _my_hand loop
      _card_color := card_color(_card_id);
      _is_wager := card_is_wager(_card_id);
      _card_value := card_value(_card_id);
      _exp := array(select jsonb_array_elements_text(_expeditions->_role->_card_color)::int);

      if _is_wager then
        _has_number := exists(select 1 from unnest(_exp) e where not card_is_wager(e));
        _wager_len := coalesce(array_length(_exp, 1), 0);
        if not _has_number and _wager_len < 3 then
          _played := true;
        end if;
      else
        select max(card_value(e)) into _max_in_exp from unnest(_exp) e where not card_is_wager(e);
        if _max_in_exp is null or _card_value > _max_in_exp then
          _played := true;
        end if;
      end if;

      if _played then
        _expeditions := jsonb_set(_expeditions, array[_role, _card_color],
          (_expeditions->_role->_card_color) || to_jsonb(_card_id));
        _last_discard_color := null;
        if _g.ruleset = '6rule' then
          _goals := _eval_goals(_goals, _expeditions->_role, _role);
        end if;
        _my_hand := array_remove(_my_hand, _card_id);
        exit;
      end if;
    end loop;

    if not _played then
      _card_id := _my_hand[1 + floor(random() * array_length(_my_hand, 1))::int];
      _card_color := card_color(_card_id);
      _discards := jsonb_set(_discards, array[_card_color],
        (_discards->_card_color) || to_jsonb(_card_id));
      _last_discard_color := _card_color;
      _my_hand := array_remove(_my_hand, _card_id);
    end if;
  end if;

  if coalesce(array_length(_deck, 1), 0) > 0 then
    _drew_card := _deck[array_length(_deck, 1)];
    _deck := _deck[1 : array_length(_deck, 1) - 1];
    _my_hand := _my_hand || _drew_card;
    _last_discard_color := null;
  end if;

  _new_cum_p1 := _g.cumulative_p1;
  _new_cum_p2 := _g.cumulative_p2;
  _new_history := _g.round_history;
  _match_ended := _g.match_ended;

  if coalesce(array_length(_deck, 1), 0) = 0 then
    _round_ended := true;
    _p1_break := _score_breakdown(_expeditions, 'p1', _g.ruleset, _goals);
    _p2_break := _score_breakdown(_expeditions, 'p2', _g.ruleset, _goals);
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

  _new_version := _g.version + 1;

  if _role = 'p1' then
    update games set deck = _deck, p1_hand = _my_hand, discards = _discards, expeditions = _expeditions,
      goals = _goals,
      turn = _other_role, phase = 'play_or_discard', last_discard_color = _last_discard_color,
      ended = _round_ended, match_ended = _match_ended,
      turn_started_at = now(),
      cumulative_p1 = _new_cum_p1, cumulative_p2 = _new_cum_p2,
      round_history = _new_history, version = _new_version
    where id = _g.id;
  else
    update games set deck = _deck, p2_hand = _my_hand, discards = _discards, expeditions = _expeditions,
      goals = _goals,
      turn = _other_role, phase = 'play_or_discard', last_discard_color = _last_discard_color,
      ended = _round_ended, match_ended = _match_ended,
      turn_started_at = now(),
      cumulative_p1 = _new_cum_p1, cumulative_p2 = _new_cum_p2,
      round_history = _new_history, version = _new_version
    where id = _g.id;
  end if;

  insert into game_events(game_id, version, room_code) values (_g.id, _new_version, _room_code);

  return jsonb_build_object('ok', true, 'version', _new_version, 'ended', _round_ended, 'match_ended', _match_ended, 'auto_played', _played);
end
$$;

grant execute on function timeout_action(text, text) to anon, authenticated;

create or replace function next_round(_room_code text, _token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  _g games%rowtype;
  _last jsonb; _p1_total int; _p2_total int;
  _first text;
  _deck int[]; _p1_hand int[]; _p2_hand int[]; _n int;
  _new_version int;
  _new_goals jsonb;
begin
  _room_code := upper(_room_code);
  select * into _g from games where room_code = _room_code for update;
  if not found then raise exception 'Room not found' using errcode = 'P0001'; end if;
  if _g.match_ended then raise exception 'Match already ended — use restart_match' using errcode = 'P0001'; end if;
  if not _g.ended then raise exception 'Current round is not finished' using errcode = 'P0001'; end if;
  if _g.p1_token <> _token and _g.p2_token <> _token then
    raise exception 'Invalid token' using errcode = 'P0001';
  end if;

  _last := _g.round_history->(jsonb_array_length(_g.round_history) - 1);
  _p1_total := (_last->'p1'->>'total')::int;
  _p2_total := (_last->'p2'->>'total')::int;
  if _p1_total < _p2_total then _first := 'p1';
  elsif _p2_total < _p1_total then _first := 'p2';
  else _first := case when _g.first_player = 'p1' then 'p2' else 'p1' end;
  end if;

  _deck := _fresh_deck(_g.ruleset);
  _n := array_length(_deck, 1);
  _p1_hand := _deck[(_n - 7):_n];
  _deck := _deck[1:(_n - 8)];
  _n := array_length(_deck, 1);
  _p2_hand := _deck[(_n - 7):_n];
  _deck := _deck[1:(_n - 8)];

  _new_goals := case when _g.ruleset = '6rule' then _gen_goals() else '[]'::jsonb end;
  _new_version := _g.version + 1;

  update games set
    current_round = _g.current_round + 1,
    deck = _deck,
    p1_hand = _p1_hand,
    p2_hand = _p2_hand,
    discards = _empty_discards(_g.ruleset),
    expeditions = _empty_expeditions(_g.ruleset),
    goals = _new_goals,
    turn = _first,
    first_player = _first,
    phase = 'play_or_discard',
    last_discard_color = null,
    ended = false,
    turn_started_at = now(),
    version = _new_version
  where id = _g.id;

  insert into game_events(game_id, version, room_code) values (_g.id, _new_version, _room_code);

  return jsonb_build_object('ok', true, 'round', _g.current_round + 1, 'first_player', _first);
end
$$;

grant execute on function next_round(text, text) to anon, authenticated;

create or replace function restart_match(_room_code text, _token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  _g games%rowtype;
  _deck int[]; _p1_hand int[]; _p2_hand int[]; _n int;
  _first text; _new_version int;
  _new_goals jsonb;
begin
  _room_code := upper(_room_code);
  select * into _g from games where room_code = _room_code for update;
  if not found then raise exception 'Room not found' using errcode = 'P0001'; end if;
  if _g.p1_token <> _token and _g.p2_token <> _token then
    raise exception 'Invalid token' using errcode = 'P0001';
  end if;
  if _g.p2_token is null then raise exception 'Opponent has not joined yet' using errcode = 'P0001'; end if;

  if _g.match_ended then
    if _g.cumulative_p1 < _g.cumulative_p2 then _first := 'p1';
    elsif _g.cumulative_p2 < _g.cumulative_p1 then _first := 'p2';
    else _first := case when _g.first_player = 'p1' then 'p2' else 'p1' end;
    end if;
  else
    _first := case when _g.first_player = 'p1' then 'p2' else 'p1' end;
  end if;

  _deck := _fresh_deck(_g.ruleset);
  _n := array_length(_deck, 1);
  _p1_hand := _deck[(_n - 7):_n];
  _deck := _deck[1:(_n - 8)];
  _n := array_length(_deck, 1);
  _p2_hand := _deck[(_n - 7):_n];
  _deck := _deck[1:(_n - 8)];

  _new_goals := case when _g.ruleset = '6rule' then _gen_goals() else '[]'::jsonb end;
  _new_version := _g.version + 1;

  update games set
    current_round = 1,
    deck = _deck,
    p1_hand = _p1_hand,
    p2_hand = _p2_hand,
    discards = _empty_discards(_g.ruleset),
    expeditions = _empty_expeditions(_g.ruleset),
    goals = _new_goals,
    turn = _first,
    first_player = _first,
    phase = 'play_or_discard',
    last_discard_color = null,
    ended = false,
    match_ended = false,
    turn_started_at = now(),
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
