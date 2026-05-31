// ============================================================
// Quoridor — 벽 보관함 (끌어다 보드에 놓기)
// 명세: task/05-29-task-1.md §10.2, §10.4
// ============================================================

import type { PointerEvent } from 'react';

export default function WallTray({
  label,
  walls,
  enabled,
  dragging,
  onStart,
}: {
  label: string;
  walls: number;
  enabled: boolean;
  dragging: boolean;
  onStart: (e: PointerEvent) => void;
}) {
  return (
    <div className={`q-tray${enabled ? '' : ' disabled'}`}>
      <div className="q-tray-head">
        <span className="q-tray-label">{label}</span>
        <span className="q-tray-count">{walls}개</span>
      </div>

      <div
        className={`q-wallpiece${enabled ? '' : ' off'}${dragging ? ' dragging' : ''}`}
        onPointerDown={enabled ? onStart : undefined}
        role="button"
        aria-disabled={!enabled}
        title={enabled ? '끌어서 보드에 놓으세요' : undefined}
      >
        <span className="q-wallpiece-bar" />
        <span className="q-wallpiece-text">
          {enabled ? '끌어서 설치' : walls <= 0 ? '벽 소진' : '대기'}
        </span>
      </div>

      <p className="q-tray-hint">
        벽 조각을 보드 위로 끌면 가장 가까운 교차점에 붙고, 커서가 가로/세로 중
        치우친 쪽으로 방향이 정해집니다. 빨간색은 설치 불가입니다.
      </p>
    </div>
  );
}
