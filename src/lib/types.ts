export type Color = 'r' | 'g' | 'b' | 'y' | 'w' | 'p';
export type Ruleset = '5rule' | '6rule';

export const COLORS_5: Color[] = ['r', 'g', 'b', 'y', 'w'];
export const COLORS_6: Color[] = ['r', 'g', 'b', 'y', 'w', 'p'];

export function colorsFor(ruleset: Ruleset): Color[] {
  return ruleset === '6rule' ? COLORS_6 : COLORS_5;
}

export const COLOR_LABEL: Record<Color, string> = {
  r: '레드', g: '그린', b: '블루', y: '옐로우', w: '화이트', p: '퍼플',
};

export interface CardInfo {
  id: number;
  color: Color;
  type: 'number' | 'wager';
  value?: number;
}

export function cardInfo(id: number): CardInfo {
  const colorIdx = Math.floor(id / 12);
  const slot = id % 12;
  const color = (['r', 'g', 'b', 'y', 'w', 'p'] as Color[])[colorIdx];
  if (slot < 3) return { id, color, type: 'wager' };
  return { id, color, type: 'number', value: slot - 1 };
}

export type Role = 'p1' | 'p2';
export type Mode = 'single' | 'match3';

export interface PlayerBreakdown {
  r: number; g: number; b: number; y: number; w: number;
  p?: number;
  goals?: number;
  total: number;
}

export interface RoundResult {
  round: number;
  p1: PlayerBreakdown;
  p2: PlayerBreakdown;
}

export type GoalCategory = 'first' | 'end';

export interface GoalState {
  id: string;
  description: string;
  points: number;
  category?: GoalCategory; // optional for backwards compat with old goal rows (defaulted to 'first')
  claimed_by: Role | null;
}

export interface GameState {
  room_code: string;
  mode: Mode;
  ruleset: Ruleset;
  max_rounds: number;
  current_round: number;
  role: Role;
  my_hand: number[];
  opponent_hand_count: number;
  deck_count: number;
  discards: Record<Color, number[]>;
  expeditions: { p1: Record<Color, number[]>; p2: Record<Color, number[]> };
  turn: Role;
  phase: 'play_or_discard' | 'draw';
  last_discard_color: Color | null;
  first_player: Role;
  ended: boolean;
  match_ended: boolean;
  cumulative: { p1: number; p2: number };
  round_history: RoundResult[];
  goals: GoalState[];
  turn_started_at: string | null;
  version: number;
  p2_joined: boolean;
  is_ai_p2: boolean;
  ai_token: string | null;
}

export type Action =
  | { type: 'PLAY'; cardId: number }
  | { type: 'DISCARD'; cardId: number }
  | { type: 'DRAW_FROM_DECK' }
  | { type: 'DRAW_FROM_DISCARD'; color: Color };

export function scoreExpedition(cards: number[]): number {
  if (cards.length === 0) return 0;
  let nums = 0, wagers = 0;
  for (const id of cards) {
    const c = cardInfo(id);
    if (c.type === 'wager') wagers++;
    else nums += c.value!;
  }
  let s = (nums - 20) * (1 + wagers);
  if (cards.length >= 8) s += 20;
  return s;
}

export function sortHand(hand: number[]): number[] {
  return [...hand].sort((a, b) => {
    const ca = cardInfo(a), cb = cardInfo(b);
    const colorOrder = COLORS_6.indexOf(ca.color) - COLORS_6.indexOf(cb.color);
    if (colorOrder !== 0) return colorOrder;
    if (ca.type === 'wager' && cb.type === 'number') return -1;
    if (ca.type === 'number' && cb.type === 'wager') return 1;
    if (ca.type === 'number' && cb.type === 'number') return ca.value! - cb.value!;
    return a - b;
  });
}

// ============================================================
// Goal definitions (6-rule)
// ============================================================

export interface GoalDef {
  id: string;
  description: string;
  points: number;
  category: GoalCategory;
}

export const GOAL_POOL: GoalDef[] = [
  // 선착순 (먼저 달성한 플레이어가 점수 가져감)
  { id: 'first_color_3',                 description: '한 색에 3장 먼저 놓기',                 points: 5,  category: 'first' },
  { id: 'first_purple_start',            description: '보라색 탐험 먼저 시작',                  points: 5,  category: 'first' },
  { id: 'first_2_colors',                description: '2가지 색 탐험 먼저 시작',                points: 6,  category: 'first' },
  { id: 'first_2_wagers',                description: '협상카드 2장 먼저 놓기',                points: 8,  category: 'first' },
  { id: 'first_total_5',                 description: '카드 5장 먼저 놓기',                    points: 10, category: 'first' },
  { id: 'first_3_colors',                description: '3가지 색 탐험 먼저 시작',                points: 10, category: 'first' },
  { id: 'first_color_5',                 description: '한 색에 5장 먼저 놓기',                 points: 10, category: 'first' },
  { id: 'first_color_score_20',          description: '한 색 숫자합 20 먼저',                  points: 10, category: 'first' },
  { id: 'first_consecutive_3',           description: '한 탐험에 연속 숫자 3장 먼저',          points: 10, category: 'first' },
  { id: 'first_blue_plus_other_sum_10',  description: '파랑+다른 색 숫자 합 10 먼저',          points: 10, category: 'first' },
  { id: 'first_color_3_wagers',          description: '한 색에 협상카드 3장 먼저',              points: 12, category: 'first' },
  { id: 'first_4_colors',                description: '4가지 색 탐험 먼저 시작',                points: 14, category: 'first' },
  { id: 'first_yellow_3',                description: '노란색 탐험에 3장 먼저',                 points: 15, category: 'first' },
  { id: 'first_color_score_50',          description: '한 색에 +50점 먼저',                    points: 18, category: 'first' },
  { id: 'first_all_colors',              description: '모든 색 탐험 먼저 시작',                 points: 20, category: 'first' },
  // 게임 종료 시 정산 (라운드 끝나는 시점에 두 플레이어 비교)
  { id: 'end_more_started_colors',       description: '라운드 종료 시 시작한 탐험이 더 많기',  points: 10, category: 'end' },
  { id: 'end_max_no_wager_score',        description: '라운드 종료 시 협상카드 없는 한 색 최고 점수',  points: 10, category: 'end' },
  { id: 'end_lower_hand_sum',            description: '라운드 종료 시 손패 숫자 총합 더 낮기',  points: 10, category: 'end' },
  { id: 'end_more_hand_wagers',          description: '라운드 종료 시 손에 협상카드 더 많기',  points: 10, category: 'end' },
  { id: 'end_more_hand_green',           description: '라운드 종료 시 손에 초록 카드 더 많기',  points: 10, category: 'end' },
];

// Sum of number-card values in a single expedition (wagers contribute 0).
function expNumberSum(exp: number[]): number {
  let s = 0;
  for (const id of exp) {
    const info = cardInfo(id);
    if (info.type === 'number') s += info.value!;
  }
  return s;
}

// True if exp contains 3 number cards with values forming a run [n, n+1, n+2].
function hasConsecutive3(exp: number[]): boolean {
  const values = exp
    .map((id) => cardInfo(id))
    .filter((c) => c.type === 'number')
    .map((c) => c.value!);
  if (values.length < 3) return false;
  const set = new Set(values);
  for (const v of values) {
    if (set.has(v + 1) && set.has(v + 2)) return true;
  }
  return false;
}

// Evaluate which first-come goals the given player meets right now.
// Game-end goals (category 'end') are NOT handled here — the server settles those at round end.
export function checkGoalAchieved(
  goalId: string,
  expeditions: Record<Color, number[]>,
): boolean {
  const colors = Object.keys(expeditions) as Color[];
  const totalCards = colors.reduce((s, c) => s + expeditions[c].length, 0);
  const startedColors = colors.filter((c) => expeditions[c].length > 0).length;
  const allColorsCount = colors.length; // 5 or 6 depending on ruleset
  const allWagers = colors.reduce(
    (s, c) => s + expeditions[c].filter((id) => cardInfo(id).type === 'wager').length,
    0,
  );

  switch (goalId) {
    case 'first_color_3':
      return colors.some((c) => expeditions[c].length >= 3);
    case 'first_total_5':
      return totalCards >= 5;
    case 'first_purple_start':
      return (expeditions.p?.length ?? 0) >= 1;
    case 'first_2_colors':
      return startedColors >= 2;
    case 'first_3_colors':
      return startedColors >= 3;
    case 'first_4_colors':
      return startedColors >= 4;
    case 'first_all_colors':
      return startedColors >= allColorsCount;
    case 'first_color_5':
      return colors.some((c) => expeditions[c].length >= 5);
    case 'first_color_score_20':
      return colors.some((c) => expNumberSum(expeditions[c]) >= 20);
    case 'first_color_score_50':
      return colors.some((c) => scoreExpedition(expeditions[c]) >= 50);
    case 'first_2_wagers':
      return allWagers >= 2;
    case 'first_color_3_wagers':
      return colors.some(
        (c) => expeditions[c].filter((id) => cardInfo(id).type === 'wager').length >= 3,
      );
    case 'first_consecutive_3':
      return colors.some((c) => hasConsecutive3(expeditions[c]));
    case 'first_yellow_3':
      return (expeditions.y?.length ?? 0) >= 3;
    case 'first_blue_plus_other_sum_10': {
      const blueSum = expNumberSum(expeditions.b || []);
      if (blueSum <= 0) return false;
      const otherMax = Math.max(
        0,
        ...colors.filter((c) => c !== 'b').map((c) => expNumberSum(expeditions[c])),
      );
      if (otherMax <= 0) return false;
      return blueSum + otherMax >= 10;
    }
    default:
      return false;
  }
}

// Legacy alias used by older code paths.
export const COLORS = COLORS_5;
