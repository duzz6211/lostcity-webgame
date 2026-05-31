// ============================================================
// Quoridor — 사이드 패널 (턴/역할/잔여 벽/상태/되돌리기/재시작)
// 명세: task/05-29-task-1.md §10.1, §10.2, §10.5, §10.6
// ============================================================

import type { GameState, PlayerId } from '../engine/types';

const PLAYER_COLOR: Record<PlayerId, string> = {
  P1: '#c83b2a',
  P2: '#2272a3',
};
const PLAYER_NAME: Record<PlayerId, string> = {
  P1: '플레이어 1',
  P2: '플레이어 2',
};

export default function Controls({
  game,
  role,
  canAct,
  canUndo,
  waitingForOpponent,
  onUndo,
  onRestart,
}: {
  game: GameState;
  role: PlayerId | null; // null = 로컬 핫시트
  canAct: boolean;
  canUndo: boolean;
  waitingForOpponent: boolean;
  onUndo: () => void;
  onRestart: () => void;
}) {
  const current = game.players[game.currentTurn];
  const playing = game.status === 'playing';
  const online = role !== null;

  // 상태 메시지
  let statusText: string;
  let statusTone: 'go' | 'wait' | 'end' = 'wait';
  if (!playing) {
    statusText = game.winner ? `${PLAYER_NAME[game.winner]} 승리!` : '게임 종료';
    statusTone = 'end';
  } else if (waitingForOpponent) {
    statusText = '상대 입장을 기다리는 중…';
  } else if (online) {
    statusText = canAct ? '내 차례입니다 — 행동하세요' : '상대 차례입니다…';
    statusTone = canAct ? 'go' : 'wait';
  } else {
    statusText = `${PLAYER_NAME[current.id]} 차례`;
    statusTone = 'go';
  }

  return (
    <div className="q-panel">
      {online && role && (
        <div className="q-rolebadge">
          <span className="q-dot" style={{ background: PLAYER_COLOR[role] }} />
          당신은 <strong style={{ color: PLAYER_COLOR[role] }}>{PLAYER_NAME[role]}</strong>
        </div>
      )}

      <div className={`q-status ${statusTone}`}>{statusText}</div>

      <div className="q-walls">
        {game.players.map((p) => (
          <div key={p.id} className={`q-wallrow${p.id === current.id && playing ? ' active' : ''}`}>
            <span className="q-dot" style={{ background: PLAYER_COLOR[p.id] }} />
            <span className="q-wallname">
              {PLAYER_NAME[p.id]}
              {role === p.id ? ' (나)' : ''}
            </span>
            <span className="q-wallcount">벽 {p.wallsRemaining}</span>
          </div>
        ))}
      </div>

      <div className="q-section">
        <div className="q-seclabel">행동 방법</div>
        <ul className="q-howto">
          <li>이동: 보드의 <b>초록 칸</b>을 클릭</li>
          <li>벽: 아래 <b>벽 조각</b>을 보드로 드래그</li>
        </ul>
      </div>

      <div className="q-section">
        <div className="q-btnrow">
          {!online && (
            <button disabled={!canUndo} onClick={onUndo}>
              되돌리기
            </button>
          )}
          <button onClick={onRestart}>재시작</button>
        </div>
      </div>
    </div>
  );
}
