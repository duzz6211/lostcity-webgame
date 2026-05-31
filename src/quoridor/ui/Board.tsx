// ============================================================
// Quoridor — 보드 렌더 (모드리스)
//   · 이동: 합법 목적지 칸을 클릭
//   · 벽: 트레이에서 끌어다 놓기 → ghostWall 미리보기
// 명세: task/05-29-task-1.md §9.2, §10
// ============================================================

import { forwardRef } from 'react';
import type { GameState, Pos, Wall } from '../engine/types';
import { samePos } from '../engine/board';
import Pawn from './Pawn';
import WallPreview from './WallPreview';
import { BOARD_PX, cellCenterX, cellCenterY, cellX, cellY, CELL, wallRect } from './layout';

interface BoardProps {
  game: GameState;
  legalMoves: Pos[];
  interactive: boolean; // 이동 클릭/하이라이트 활성 여부
  ghostWall: Wall | null; // 드래그 중 미리보기
  ghostLegal: boolean;
  onCellClick: (p: Pos) => void;
}

const Board = forwardRef<SVGSVGElement, BoardProps>(function Board(
  { game, legalMoves, interactive, ghostWall, ghostLegal, onCellClick },
  ref,
) {
  const cells: Pos[] = [];
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) cells.push({ col, row });
  }

  const isLegalTarget = (p: Pos) => interactive && legalMoves.some((m) => samePos(m, p));

  return (
    <svg
      ref={ref}
      className="q-board"
      viewBox={`0 0 ${BOARD_PX} ${BOARD_PX}`}
      width="100%"
      role="img"
      aria-label="Quoridor 보드"
    >
      <rect x={0} y={0} width={BOARD_PX} height={BOARD_PX} rx={10} fill="#2c1f15" stroke="var(--border-2)" strokeWidth={2} />

      {/* 셀 + 합법 이동 하이라이트 */}
      {cells.map((c) => {
        const target = isLegalTarget(c);
        return (
          <g key={`c-${c.col}-${c.row}`}>
            <rect x={cellX(c.col)} y={cellY(c.row)} width={CELL} height={CELL} rx={6} fill="#3a2a18" stroke="#4a3422" strokeWidth={1} />
            {target && (
              <g style={{ cursor: 'pointer' }} onClick={() => onCellClick(c)}>
                <rect x={cellX(c.col)} y={cellY(c.row)} width={CELL} height={CELL} rx={6} fill="var(--action-3)" stroke="var(--action)" strokeWidth={2} />
                <circle cx={cellCenterX(c.col)} cy={cellCenterY(c.row)} r={7} fill="var(--action-2)" />
              </g>
            )}
          </g>
        );
      })}

      {/* 설치된 벽 */}
      {game.walls.map((w) => {
        const r = wallRect(w);
        return (
          <rect key={`w-${w.col}-${w.row}-${w.orientation}`} x={r.x} y={r.y} width={r.width} height={r.height} rx={3} fill="#caa15e" stroke="#6b4a22" strokeWidth={1.5} />
        );
      })}

      {/* 드래그 미리보기 */}
      {ghostWall && <WallPreview wall={ghostWall} legal={ghostLegal} />}

      {/* 말 */}
      {game.players.map((p, i) => (
        <Pawn key={p.id} id={p.id} position={p.position} active={i === game.currentTurn && game.status === 'playing'} />
      ))}
    </svg>
  );
});

export default Board;
