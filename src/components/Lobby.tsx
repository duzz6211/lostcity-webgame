import { useState } from 'react';
import { createGame } from '../lib/api';
import type { Mode } from '../lib/types';

interface Props { onEnter: (code: string) => void; }

export default function Lobby({ onEnter }: Props) {
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<Mode>('match3');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      const { room_code } = await createGame(mode);
      onEnter(room_code);
    } catch (e: any) {
      setError(e.message ?? '방 생성 실패');
    } finally {
      setCreating(false);
    }
  }

  function handleJoin() {
    const c = code.trim().toUpperCase();
    if (c.length === 0) { setError('방 코드를 입력하세요'); return; }
    onEnter(c);
  }

  return (
    <div className="lobby">
      <div className="lobby-card">
        <h1>Lost Cities</h1>
        <div className="subtitle">2인 카드 게임 · 라이너 크니지아</div>

        <div className="lobby-section" style={{ borderTop: 'none', paddingTop: 0, marginTop: 0 }}>
          <h3>새 방 만들기</h3>
          <div className="mode-toggle">
            <button
              className={mode === 'single' ? 'primary' : ''}
              onClick={() => setMode('single')}
              style={{ flex: 1 }}
            >
              단판
            </button>
            <button
              className={mode === 'match3' ? 'primary' : ''}
              onClick={() => setMode('match3')}
              style={{ flex: 1 }}
            >
              3라운드 매치
            </button>
          </div>
          <button className="primary" style={{ width: '100%', marginTop: 10 }} onClick={handleCreate} disabled={creating}>
            {creating ? '생성 중...' : '방 만들기'}
          </button>
        </div>

        <div className="lobby-section">
          <h3>방 코드로 입장</h3>
          <input
            placeholder="ABCDEF"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === 'Enter') handleJoin(); }}
          />
          <button style={{ width: '100%' }} onClick={handleJoin}>입장</button>
        </div>

        {error && <div className="error">{error}</div>}
      </div>
    </div>
  );
}
