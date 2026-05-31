// ============================================================
// Quoridor — 벽 호버 미리보기 (반투명, 불법 시 빨강)
// 명세: task/05-29-task-1.md §10.4
// ============================================================

import type { Wall } from '../engine/types';
import { wallRect } from './layout';

export default function WallPreview({ wall, legal }: { wall: Wall; legal: boolean }) {
  const r = wallRect(wall);
  return (
    <rect
      x={r.x}
      y={r.y}
      width={r.width}
      height={r.height}
      rx={3}
      fill={legal ? 'rgba(198,154,90,0.55)' : 'rgba(215,92,70,0.55)'}
      stroke={legal ? 'var(--accent)' : 'var(--danger)'}
      strokeWidth={1.5}
      pointerEvents="none"
    />
  );
}
