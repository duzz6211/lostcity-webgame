import { useState } from 'react';
import { createAiGame, createGame } from '../lib/api';
import type { Mode, Ruleset } from '../lib/types';
import { RobotIcon } from './icons';

type Opponent = 'human' | 'ai';

interface Props { onEnter: (code: string) => void; }

export default function Lobby({ onEnter }: Props) {
  const [code, setCode] = useState('');
  const [ruleset, setRuleset] = useState<Ruleset>('5rule');
  const [mode, setMode] = useState<Mode>('match3');
  const [opponent, setOpponent] = useState<Opponent>('human');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      const { room_code } = opponent === 'ai'
        ? await createAiGame(mode, ruleset)
        : await createGame(mode, ruleset);
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
        <h1>잊혀진 왕국</h1>
        <div className="lobby-divider" aria-hidden>
          <span className="orn-line" />
          <span className="orn-mark">✦</span>
          <span className="orn-line" />
        </div>
        <div className="subtitle">Forgotten Kingdom · 2인 카드 게임</div>

        <div className="lobby-section first">
          <h3>새 방 만들기</h3>

          <div className="lobby-row">
            <div className="lobby-row-label">상대</div>
            <div className="mode-toggle">
              <button
                className={opponent === 'human' ? 'primary' : ''}
                onClick={() => setOpponent('human')}
                title="다른 사람과 대전"
              >
                사람
              </button>
              <button
                className={opponent === 'ai' ? 'primary' : ''}
                onClick={() => setOpponent('ai')}
                title="AI와 즉시 대전"
              >
                <RobotIcon size={14} />
                <span>AI</span>
              </button>
            </div>
          </div>

          <div className="lobby-row">
            <div className="lobby-row-label">룰</div>
            <div className="mode-toggle">
              <button
                className={ruleset === '5rule' ? 'primary' : ''}
                onClick={() => setRuleset('5rule')}
                title="5색 (60장) 클래식"
              >
                5개 룰
              </button>
              <button
                className={ruleset === '6rule' ? 'primary' : ''}
                onClick={() => setRuleset('6rule')}
                title="보라색 추가 (72장) + 목표 카드"
              >
                6개 룰
              </button>
            </div>
          </div>

          <div className="lobby-row">
            <div className="lobby-row-label">모드</div>
            <div className="mode-toggle">
              <button
                className={mode === 'single' ? 'primary' : ''}
                onClick={() => setMode('single')}
              >
                단판
              </button>
              <button
                className={mode === 'match3' ? 'primary' : ''}
                onClick={() => setMode('match3')}
              >
                3라운드 매치
              </button>
            </div>
          </div>

          {(ruleset === '6rule' || opponent === 'ai') && (
            <div className="lobby-info">
              {ruleset === '6rule' && (
                <div>보라색 카드 + 매 라운드 목표 카드 3장. 먼저 달성 시 추가 점수.</div>
              )}
              {opponent === 'ai' && (
                <div className="lobby-info-row">
                  <RobotIcon size={12} />
                  <span>AI와 즉시 대전. 방 코드 공유 없이 바로 시작.</span>
                </div>
              )}
            </div>
          )}

          <button className="primary block" onClick={handleCreate} disabled={creating}>
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
          <button className="block" onClick={handleJoin}>입장</button>
        </div>

        {error && <div className="error">{error}</div>}
      </div>
    </div>
  );
}
