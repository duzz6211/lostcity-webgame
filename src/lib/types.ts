export type Color = 'r' | 'g' | 'b' | 'y' | 'w';
export const COLORS: Color[] = ['r', 'g', 'b', 'y', 'w'];

export const COLOR_LABEL: Record<Color, string> = {
  r: '레드', g: '그린', b: '블루', y: '옐로우', w: '화이트',
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
  const color = (['r', 'g', 'b', 'y', 'w'] as Color[])[colorIdx];
  if (slot < 3) return { id, color, type: 'wager' };
  return { id, color, type: 'number', value: slot - 1 };
}

export type Role = 'p1' | 'p2';
export type Mode = 'single' | 'match3';

export interface PlayerBreakdown {
  r: number; g: number; b: number; y: number; w: number;
  total: number;
}

export interface RoundResult {
  round: number;
  p1: PlayerBreakdown;
  p2: PlayerBreakdown;
}

export interface GameState {
  room_code: string;
  mode: Mode;
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
  version: number;
  p2_joined: boolean;
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
    const colorOrder = COLORS.indexOf(ca.color) - COLORS.indexOf(cb.color);
    if (colorOrder !== 0) return colorOrder;
    if (ca.type === 'wager' && cb.type === 'number') return -1;
    if (ca.type === 'number' && cb.type === 'wager') return 1;
    if (ca.type === 'number' && cb.type === 'number') return ca.value! - cb.value!;
    return a - b;
  });
}
