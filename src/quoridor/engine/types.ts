// ============================================================
// Quoridor — engine types (2-player)
// 명세: task/05-29-task-1.md §4
// ============================================================

export type Orientation = 'H' | 'V';

export interface Pos {
  col: number; // 0..8
  row: number; // 0..8
}

export interface Wall {
  col: number; // 0..7
  row: number; // 0..7
  orientation: Orientation;
}

export type PlayerId = 'P1' | 'P2';

export interface Player {
  id: PlayerId;
  position: Pos;
  wallsRemaining: number;
  // 2인 전용이므로 목표는 "도달해야 하는 row" 한 줄로 표현한다.
  // (명세 §4의 goal 함수 대신, 직렬화 가능한 데이터로 보관)
  goalRow: number; // P1 → 8, P2 → 0
}

export type Move =
  | { type: 'MOVE'; to: Pos }
  | { type: 'WALL'; wall: Wall };

export type GameStatus = 'playing' | 'finished';

export interface GameState {
  players: Player[]; // [P1, P2]
  currentTurn: number; // players 배열의 인덱스 (0 | 1)
  walls: Wall[]; // 보드 위에 놓인 모든 벽
  history: Move[]; // 기보 (replay/undo용)
  winner: PlayerId | null;
  status: GameStatus;
}
