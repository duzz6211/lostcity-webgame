// ============================================================
// Quoridor — rules (pure functions)
// 명세: task/05-29-task-1.md §6, §7, §8
// ============================================================

import type { GameState, Move, Player, PlayerId, Pos, Wall } from './types';
import {
  add,
  buildWallSet,
  DIRECTIONS,
  hasWall,
  onBoard,
  perpendicular,
  samePos,
  wallBetween,
  WALL_MAX,
} from './board';

export function getPlayer(state: GameState, id: PlayerId): Player {
  const p = state.players.find((pl) => pl.id === id);
  if (!p) throw new Error(`unknown player: ${id}`);
  return p;
}

function occupant(state: GameState, p: Pos): Player | undefined {
  return state.players.find((pl) => samePos(pl.position, p));
}

// ------------------------------------------------------------
// §6 — 말 이동 (점프/대각선 점프 포함)
// ------------------------------------------------------------
export function getLegalMoves(state: GameState, playerId: PlayerId): Pos[] {
  const player = getPlayer(state, playerId);
  const wallSet = buildWallSet(state.walls);
  const moves: Pos[] = [];
  const push = (p: Pos) => {
    if (!moves.some((m) => samePos(m, p))) moves.push(p);
  };

  for (const dir of DIRECTIONS) {
    const adj = add(player.position, dir);
    if (!onBoard(adj)) continue;
    if (wallBetween(player.position, adj, wallSet)) continue;

    if (occupant(state, adj)) {
      // 상대 말이 인접 → 점프 시도 (§6.2)
      const beyond = add(adj, dir);
      const beyondBlocked =
        !onBoard(beyond) ||
        wallBetween(adj, beyond, wallSet) ||
        !!occupant(state, beyond);

      if (!beyondBlocked) {
        // 직선 점프
        push(beyond);
      } else {
        // 대각선 점프: 상대 말 기준 좌/우 대각선 칸
        for (const perp of perpendicular(dir)) {
          const diag = add(adj, perp);
          if (
            onBoard(diag) &&
            !wallBetween(adj, diag, wallSet) &&
            !occupant(state, diag)
          ) {
            push(diag);
          }
        }
      }
    } else {
      push(adj);
    }
  }

  return moves;
}

export function isLegalMove(state: GameState, move: Move): boolean {
  if (state.status !== 'playing') return false;
  const current = state.players[state.currentTurn];

  if (move.type === 'MOVE') {
    return getLegalMoves(state, current.id).some((p) => samePos(p, move.to));
  }
  return isLegalWall(state, move.wall);
}

// ------------------------------------------------------------
// §7 — 벽 설치 유효성
// ------------------------------------------------------------
export function isLegalWall(state: GameState, wall: Wall): boolean {
  const current = state.players[state.currentTurn];

  // 1. 잔여 벽
  if (current.wallsRemaining <= 0) return false;

  // 2. 위치 범위 (0..7)
  if (wall.col < 0 || wall.col > WALL_MAX || wall.row < 0 || wall.row > WALL_MAX) {
    return false;
  }

  const set = buildWallSet(state.walls);

  // 3. 동일 좌표/방향 중복 금지
  if (hasWall(set, wall.col, wall.row, wall.orientation)) return false;

  // 4. 교차 금지 (같은 교차점에 H/V 동시 불가)
  const other = wall.orientation === 'H' ? 'V' : 'H';
  if (hasWall(set, wall.col, wall.row, other)) return false;

  // 5. 부분 겹침 금지 (벽 길이축 방향으로 ±1)
  if (wall.orientation === 'H') {
    if (
      hasWall(set, wall.col - 1, wall.row, 'H') ||
      hasWall(set, wall.col + 1, wall.row, 'H')
    ) {
      return false;
    }
  } else {
    if (
      hasWall(set, wall.col, wall.row - 1, 'V') ||
      hasWall(set, wall.col, wall.row + 1, 'V')
    ) {
      return false;
    }
  }

  // 6. 경로 보존: 벽을 가상으로 추가한 뒤 모든 플레이어가 목표 줄 도달 가능해야 함
  const probe: GameState = { ...state, walls: [...state.walls, wall] };
  for (const pl of probe.players) {
    if (!pathExists(probe, pl.id)) return false;
  }

  return true;
}

// ------------------------------------------------------------
// §7.6 / §9.3 — 경로 존재 여부 (BFS)
// ------------------------------------------------------------
export function pathExists(state: GameState, playerId: PlayerId): boolean {
  const player = getPlayer(state, playerId);
  const wallSet = buildWallSet(state.walls);

  const start = player.position;
  if (start.row === player.goalRow) return true;

  const visited = new Set<string>();
  const key = (p: Pos) => `${p.col},${p.row}`;
  const queue: Pos[] = [start];
  visited.add(key(start));

  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const dir of DIRECTIONS) {
      const next = add(cur, dir);
      if (!onBoard(next)) continue;
      if (wallBetween(cur, next, wallSet)) continue;
      // 경로 탐색에서는 다른 말을 통과 가능한 것으로 간주한다
      // (말은 매 턴 이동하므로 도달 가능성 판정에 장애물로 보지 않음).
      const k = key(next);
      if (visited.has(k)) continue;
      if (next.row === player.goalRow) return true;
      visited.add(k);
      queue.push(next);
    }
  }

  return false;
}

// ------------------------------------------------------------
// §8 — 승리 판정
// ------------------------------------------------------------
export function isAtGoal(player: Player): boolean {
  return player.position.row === player.goalRow;
}
