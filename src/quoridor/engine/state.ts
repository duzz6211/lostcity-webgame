// ============================================================
// Quoridor — game state reducer
// 명세: task/05-29-task-1.md §3, §5, §8, §9.3
// ============================================================

import type { GameState, Move } from './types';
import { isAtGoal, isLegalMove } from './rules';

// §3.1 — 2인 초기 상태
export function createInitialState(): GameState {
  return {
    players: [
      { id: 'P1', position: { col: 4, row: 0 }, wallsRemaining: 10, goalRow: 8 },
      { id: 'P2', position: { col: 4, row: 8 }, wallsRemaining: 10, goalRow: 0 },
    ],
    currentTurn: 0,
    walls: [],
    history: [],
    winner: null,
    status: 'playing',
  };
}

// 순수 함수: 합법 수를 받아 새 GameState 를 반환한다.
// 불법 수면 상태를 변경하지 않고 그대로 반환한다.
export function applyMove(state: GameState, move: Move): GameState {
  if (!isLegalMove(state, move)) return state;

  const players = state.players.map((p) => ({ ...p, position: { ...p.position } }));
  const current = players[state.currentTurn];

  if (move.type === 'MOVE') {
    current.position = { col: move.to.col, row: move.to.row };
  } else {
    current.wallsRemaining -= 1;
  }

  const walls = move.type === 'WALL' ? [...state.walls, move.wall] : state.walls;
  const history = [...state.history, move];

  // §8 — 자기 턴 종료 시 목표 줄 도달이면 즉시 승리
  if (move.type === 'MOVE' && isAtGoal(current)) {
    return {
      players,
      currentTurn: state.currentTurn,
      walls,
      history,
      winner: current.id,
      status: 'finished',
    };
  }

  // §5 — 다음 플레이어로 턴 넘김
  return {
    players,
    currentTurn: (state.currentTurn + 1) % players.length,
    walls,
    history,
    winner: null,
    status: 'playing',
  };
}
