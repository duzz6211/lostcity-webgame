-- Migration: redefine `first_color_score_20` from "expedition net score ≥ 20"
-- to "raw number-card sum in one color ≥ 20".
--
-- Why: the Lost Cities net-score formula `(sum - 20) * (1 + wagers)` confused
-- players — they read "+20점" as "card-number total ≥ 20" when it actually
-- meant "expedition net score ≥ 20" (which needs card sum ≥ 40 without wagers).
-- Switching to raw sum matches what players intuit from the description.
--
-- Description updated to "한 색 숫자합 20 먼저" so the meaning is unambiguous.
-- Points value unchanged (10) — the new bar is roughly as hard as `first_color_5`.
--
-- Replaces _goal_pool (description string) and _goal_achieved (the matching branch).
-- Idempotent: re-runs replace functions in place.

-- ============================================================
-- 1. Refresh goal pool with new description
-- ============================================================

create or replace function _goal_pool() returns jsonb language sql immutable as $$
  select '[
    {"id":"first_color_3",                "description":"한 색에 3장 먼저 놓기",                       "points":5,  "category":"first"},
    {"id":"first_purple_start",           "description":"보라색 탐험 먼저 시작",                        "points":5,  "category":"first"},
    {"id":"first_2_colors",               "description":"2가지 색 탐험 먼저 시작",                      "points":6,  "category":"first"},
    {"id":"first_2_wagers",               "description":"협상카드 2장 먼저 놓기",                       "points":8,  "category":"first"},
    {"id":"first_total_5",                "description":"카드 5장 먼저 놓기",                          "points":10, "category":"first"},
    {"id":"first_3_colors",               "description":"3가지 색 탐험 먼저 시작",                      "points":10, "category":"first"},
    {"id":"first_color_5",                "description":"한 색에 5장 먼저 놓기",                       "points":10, "category":"first"},
    {"id":"first_color_score_20",         "description":"한 색 숫자합 20 먼저",                        "points":10, "category":"first"},
    {"id":"first_consecutive_3",          "description":"한 탐험에 연속 숫자 3장 먼저",                 "points":10, "category":"first"},
    {"id":"first_blue_plus_other_sum_10", "description":"파랑+다른 색 숫자 합 10 먼저",                "points":10, "category":"first"},
    {"id":"first_color_3_wagers",         "description":"한 색에 협상카드 3장 먼저",                    "points":12, "category":"first"},
    {"id":"first_4_colors",               "description":"4가지 색 탐험 먼저 시작",                      "points":14, "category":"first"},
    {"id":"first_yellow_3",               "description":"노란색 탐험에 3장 먼저",                       "points":15, "category":"first"},
    {"id":"first_color_score_50",         "description":"한 색에 +50점 먼저",                          "points":18, "category":"first"},
    {"id":"first_all_colors",             "description":"모든 색 탐험 먼저 시작",                       "points":20, "category":"first"},
    {"id":"end_more_started_colors",      "description":"라운드 종료 시 시작한 탐험이 더 많기",          "points":10, "category":"end"},
    {"id":"end_max_no_wager_score",       "description":"라운드 종료 시 협상카드 없는 한 색 최고 점수",   "points":10, "category":"end"},
    {"id":"end_lower_hand_sum",           "description":"라운드 종료 시 손패 숫자 총합 더 낮기",         "points":10, "category":"end"},
    {"id":"end_more_hand_wagers",         "description":"라운드 종료 시 손에 협상카드 더 많기",          "points":10, "category":"end"},
    {"id":"end_more_hand_green",          "description":"라운드 종료 시 손에 초록 카드 더 많기",         "points":10, "category":"end"}
  ]'::jsonb
$$;

-- ============================================================
-- 2. Replace _goal_achieved so `first_color_score_20` uses raw number sum.
--    All other branches are unchanged.
-- ============================================================

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
  _all_colors int := 0;
  _values int[];
  _blue_sum int := 0;
  _max_other_sum int := 0;
  _color_num_sum int;
begin
  for _color in select * from jsonb_object_keys(_player_exp) loop
    _exp := array(select jsonb_array_elements_text(_player_exp->_color)::int);
    _len := coalesce(array_length(_exp, 1), 0);
    _all_colors := _all_colors + 1;
    if _len > 0 then
      _started := _started + 1;
      _total_cards := _total_cards + _len;
    end if;
    _wagers_color := 0;
    _color_num_sum := 0;
    if _len > 0 then
      _wagers_color := (select count(*) from unnest(_exp) e where card_is_wager(e));
      _wagers_total := _wagers_total + _wagers_color;
      _color_num_sum := coalesce(
        (select sum(card_value(e)) from unnest(_exp) e where not card_is_wager(e)),
        0
      );
    end if;
    if _color = 'b' then
      _blue_sum := _color_num_sum;
    elsif _color_num_sum > _max_other_sum then
      _max_other_sum := _color_num_sum;
    end if;

    case _goal_id
      when 'first_color_3'        then if _len >= 3 then return true; end if;
      when 'first_color_5'        then if _len >= 5 then return true; end if;
      when 'first_color_3_wagers' then if _wagers_color >= 3 then return true; end if;
      when 'first_color_score_20' then
        if _color_num_sum >= 20 then return true; end if;
      when 'first_color_score_50' then
        _score := score_expedition(_exp);
        if _score >= 50 then return true; end if;
      when 'first_purple_start'   then if _color = 'p' and _len >= 1 then return true; end if;
      when 'first_yellow_3'       then if _color = 'y' and _len >= 3 then return true; end if;
      when 'first_consecutive_3'  then
        _values := array(select card_value(e) from unnest(_exp) e where not card_is_wager(e));
        if coalesce(array_length(_values, 1), 0) >= 3 then
          if exists(
            select 1 from unnest(_values) v
            where (v + 1) = any(_values) and (v + 2) = any(_values)
          ) then return true;
          end if;
        end if;
      else null;
    end case;
  end loop;

  case _goal_id
    when 'first_total_5'                then return _total_cards >= 5;
    when 'first_2_wagers'               then return _wagers_total >= 2;
    when 'first_2_colors'               then return _started >= 2;
    when 'first_3_colors'               then return _started >= 3;
    when 'first_4_colors'               then return _started >= 4;
    when 'first_all_colors'             then return _started >= _all_colors;
    when 'first_blue_plus_other_sum_10' then
      return _blue_sum > 0 and _max_other_sum > 0 and (_blue_sum + _max_other_sum) >= 10;
    else return false;
  end case;
end
$$;

-- ============================================================
-- 3. Patch any in-flight games that still carry the old description.
--    (Goal `id` is unchanged, so achievement logic keeps working either way;
--    this is purely a label fix for active rooms.)
-- ============================================================

update games
set goals = (
  select jsonb_agg(
    case when g->>'id' = 'first_color_score_20'
      then jsonb_set(g, '{description}', to_jsonb('한 색 숫자합 20 먼저'::text))
      else g
    end
  )
  from jsonb_array_elements(goals) g
)
where goals @> '[{"id":"first_color_score_20"}]'::jsonb;
