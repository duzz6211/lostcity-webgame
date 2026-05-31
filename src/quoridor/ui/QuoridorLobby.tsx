// ============================================================
// Quoridor — 로비 (로컬 핫시트 / 온라인 방 만들기·참가)
// 메인 로비와 동일한 테마 클래스(.lobby/.lobby-card/.lobby-section)를 재사용.
// ============================================================

import { useState } from 'react';
import { createRoom } from '../net/quoridorApi';

export default function QuoridorLobby({
  onLocal,
  onRoom,
  onExit,
}: {
  onLocal: () => void;
  onRoom: (code: string) => void;
  onExit: () => void;
}) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setBusy(true);
    setError(null);
    try {
      const { roomCode } = await createRoom();
      onRoom(roomCode);
    } catch (e) {
      setError(e instanceof Error ? e.message : '방 생성 실패');
      setBusy(false);
    }
  }

  function handleJoin() {
    const c = code.trim().toUpperCase();
    if (c.length === 0) {
      setError('방 코드를 입력하세요');
      return;
    }
    onRoom(c);
  }

  return (
    <div className="lobby">
      <div className="lobby-card">
        <h1>쿼리도</h1>
        <div className="lobby-divider" aria-hidden>
          <span className="orn-line" />
          <span className="orn-mark">✦</span>
          <span className="orn-line" />
        </div>
        <div className="subtitle">Quoridor · 2인 전략</div>

        <div className="lobby-section first">
          <h3>로컬 (한 화면 2인)</h3>
          <button className="primary block" onClick={onLocal}>
            핫시트로 시작
          </button>
        </div>

        <div className="lobby-section">
          <h3>온라인 새 방 만들기</h3>
          <button className="primary block" onClick={handleCreate} disabled={busy}>
            {busy ? '방 만드는 중...' : '방 만들기'}
          </button>
        </div>

        <div className="lobby-section">
          <h3>방 코드로 입장</h3>
          <input
            placeholder="ABCDEF"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleJoin();
            }}
          />
          <button className="block" onClick={handleJoin}>
            입장
          </button>
        </div>

        <div className="lobby-section">
          <button className="block" onClick={onExit}>
            ← 메인으로
          </button>
        </div>

        {error && <div className="error">{error}</div>}
      </div>
    </div>
  );
}
