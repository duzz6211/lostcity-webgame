// ============================================================
// Quoridor — Pawn (말) SVG
// ============================================================

import type { PlayerId, Pos } from '../engine/types';
import { cellCenterX, cellCenterY, CELL } from './layout';

const PAWN_FILL: Record<PlayerId, string> = {
  P1: '#c83b2a', // 레드
  P2: '#2272a3', // 블루
};

const PAWN_RING: Record<PlayerId, string> = {
  P1: '#7a1f15',
  P2: '#114766',
};

export default function Pawn({
  id,
  position,
  active,
}: {
  id: PlayerId;
  position: Pos;
  active: boolean;
}) {
  const cx = cellCenterX(position.col);
  const cy = cellCenterY(position.row);
  const r = CELL * 0.32;

  return (
    <g style={{ transition: 'transform .18s ease' }}>
      {active && (
        <circle cx={cx} cy={cy} r={r + 5} fill="none" stroke="var(--action)" strokeWidth={2.5} opacity={0.85}>
          <animate attributeName="opacity" values="0.85;0.35;0.85" dur="1.4s" repeatCount="indefinite" />
        </circle>
      )}
      <circle cx={cx} cy={cy + 2} r={r} fill="rgba(0,0,0,0.35)" />
      <circle cx={cx} cy={cy} r={r} fill={PAWN_FILL[id]} stroke={PAWN_RING[id]} strokeWidth={2.5} />
      <circle cx={cx - r * 0.3} cy={cy - r * 0.35} r={r * 0.28} fill="rgba(255,255,255,0.35)" />
    </g>
  );
}
