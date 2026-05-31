// ============================================================
// Quoridor — board / coordinate utilities
// 명세: task/05-29-task-1.md §2
// ============================================================

import type { Pos, Wall } from './types';

export const BOARD_SIZE = 9; // 9x9 cells, col/row ∈ [0..8]
export const WALL_MAX = 7; // wall col/row ∈ [0..7]

export function onBoard(p: Pos): boolean {
  return p.col >= 0 && p.col < BOARD_SIZE && p.row >= 0 && p.row < BOARD_SIZE;
}

export function samePos(a: Pos, b: Pos): boolean {
  return a.col === b.col && a.row === b.row;
}

export function wallKey(w: Wall): string {
  return `${w.col},${w.row},${w.orientation}`;
}

export function buildWallSet(walls: Wall[]): Set<string> {
  return new Set(walls.map(wallKey));
}

export function hasWall(set: Set<string>, col: number, row: number, o: 'H' | 'V'): boolean {
  return set.has(`${col},${row},${o}`);
}

// 직교로 인접한 두 칸 a, b 사이를 벽이 가로막는지 판정.
//
// 명세 §2.2:
//  - 수평 벽 (c,r,"H")는 (c,r)-(c,r+1) 와 (c+1,r)-(c+1,r+1) 사이를 막음
//    → 두 칸의 "세로 이동"을 차단. (c,r)/(c-1,r) 의 H 벽이 (c,r)↕(c,r+1) 갭을 막는다.
//  - 수직 벽 (c,r,"V")는 (c,r)-(c+1,r) 와 (c,r+1)-(c+1,r+1) 사이를 막음
//    → 두 칸의 "가로 이동"을 차단. (c,r)/(c,r-1) 의 V 벽이 (c,r)↔(c+1,r) 갭을 막는다.
export function wallBetween(a: Pos, b: Pos, wallSet: Set<string>): boolean {
  const dc = b.col - a.col;
  const dr = b.row - a.row;

  // 세로 이동 (같은 col, row 가 1 차이)
  if (dc === 0 && Math.abs(dr) === 1) {
    const col = a.col;
    const minRow = Math.min(a.row, b.row); // 갭은 minRow 와 minRow+1 사이
    return (
      hasWall(wallSet, col, minRow, 'H') ||
      hasWall(wallSet, col - 1, minRow, 'H')
    );
  }

  // 가로 이동 (같은 row, col 이 1 차이)
  if (dr === 0 && Math.abs(dc) === 1) {
    const row = a.row;
    const minCol = Math.min(a.col, b.col); // 갭은 minCol 과 minCol+1 사이
    return (
      hasWall(wallSet, minCol, row, 'V') ||
      hasWall(wallSet, minCol, row - 1, 'V')
    );
  }

  // 인접하지 않은 칸: 이동 자체가 성립하지 않으므로 막힌 것으로 간주하지 않는다.
  return false;
}

// 직교 4방향 (N, S, E, W)
export const DIRECTIONS: Pos[] = [
  { col: 0, row: -1 }, // N
  { col: 0, row: 1 }, // S
  { col: 1, row: 0 }, // E
  { col: -1, row: 0 }, // W
];

export function add(p: Pos, d: Pos): Pos {
  return { col: p.col + d.col, row: p.row + d.row };
}

// 방향 d 에 수직인 두 방향 (대각선 점프용)
export function perpendicular(d: Pos): Pos[] {
  if (d.col === 0) {
    // 세로 방향 → 좌/우
    return [
      { col: 1, row: 0 },
      { col: -1, row: 0 },
    ];
  }
  // 가로 방향 → 위/아래
  return [
    { col: 0, row: 1 },
    { col: 0, row: -1 },
  ];
}
