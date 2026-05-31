// ============================================================
// Quoridor — SVG board layout constants & coordinate helpers
// Board.tsx / Pawn.tsx / WallPreview.tsx 가 공유한다.
// ============================================================

import type { Wall } from '../engine/types';

export const CELL = 50; // 칸 한 변 (px)
export const GAP = 14; // 칸 사이 홈(벽 두께) (px)
export const MARGIN = 16; // 보드 바깥 여백
export const HIT_PAD = 9; // 벽 슬롯 클릭 영역을 칸 쪽으로 확장하는 양

// 벽 슬롯 좌표 최댓값 (col/row ∈ [0..7])
export const WALL_MAX_INDEX = 7;

// 9칸 + 8갭 + 여백*2
export const BOARD_PX = MARGIN * 2 + 9 * CELL + 8 * GAP;

export function cellX(col: number): number {
  return MARGIN + col * (CELL + GAP);
}

export function cellY(row: number): number {
  return MARGIN + row * (CELL + GAP);
}

export function cellCenterX(col: number): number {
  return cellX(col) + CELL / 2;
}

export function cellCenterY(row: number): number {
  return cellY(row) + CELL / 2;
}

// 벽 막대의 화면상 사각형 (시각 렌더용)
export function wallRect(w: Wall): { x: number; y: number; width: number; height: number } {
  if (w.orientation === 'H') {
    return {
      x: cellX(w.col),
      y: cellY(w.row) + CELL,
      width: 2 * CELL + GAP,
      height: GAP,
    };
  }
  return {
    x: cellX(w.col) + CELL,
    y: cellY(w.row),
    width: GAP,
    height: 2 * CELL + GAP,
  };
}

// 벽 (c,r) 의 기준 교차점 (네 칸이 만나는 모서리)
export function intersectionX(col: number): number {
  return cellX(col) + CELL + GAP / 2;
}
export function intersectionY(row: number): number {
  return cellY(row) + CELL + GAP / 2;
}

function clampIdx(v: number): number {
  return Math.max(0, Math.min(WALL_MAX_INDEX, v));
}

// 보드 좌표(ux,uy)를 가장 가까운 벽 슬롯으로 스냅한다.
// - 가장 가까운 교차점 (col,row) 을 고르고,
// - 커서가 교차점에서 가로로 더 치우쳤으면 수평(H), 세로면 수직(V) 벽.
// 보드 밖(여백 초과)이면 null.
export function snapWall(
  ux: number,
  uy: number,
): { col: number; row: number; orientation: 'H' | 'V' } | null {
  const tol = CELL; // 보드 가장자리 약간 바깥까지 허용
  if (ux < -tol || uy < -tol || ux > BOARD_PX + tol || uy > BOARD_PX + tol) return null;

  const unit = CELL + GAP;
  const col = clampIdx(Math.round((ux - intersectionX(0)) / unit));
  const row = clampIdx(Math.round((uy - intersectionY(0)) / unit));
  const dx = ux - intersectionX(col);
  const dy = uy - intersectionY(row);
  const orientation = Math.abs(dx) >= Math.abs(dy) ? 'H' : 'V';
  return { col, row, orientation };
}

// 벽 슬롯의 클릭/호버 히트 영역.
// 막대 전체(2칸 길이)를 잡으면 인접 슬롯과 겹치므로, 교차점 중심으로
// 한 슬롯당 (CELL+GAP) 길이의 "1유닛"만 잡아 슬롯끼리 정확히 타일링되게 한다.
export function wallHitRect(
  col: number,
  row: number,
  orientation: 'H' | 'V',
): { x: number; y: number; width: number; height: number } {
  const px = intersectionX(col);
  const py = intersectionY(row);
  const unit = CELL + GAP;
  const thickness = GAP + 2 * HIT_PAD;
  if (orientation === 'H') {
    return { x: px - unit / 2, y: py - thickness / 2, width: unit, height: thickness };
  }
  return { x: px - thickness / 2, y: py - unit / 2, width: thickness, height: unit };
}
