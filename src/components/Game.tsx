import { useEffect, useMemo, useState } from 'react';
import {
  applyAction, getState, hasToken, joinGame, restartMatch, subscribeToGame,
} from '../lib/api';
import {
  cardInfo, COLOR_LABEL, COLORS, sortHand,
  type Action, type Color, type GameState,
} from '../lib/types';
import Card from './Card';
import GameOver from './GameOver';

interface Props { roomCode: string; onLeave: () => void; }

export default function Game({ roomCode, onLeave }: Props) {
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const s = await getState(roomCode);
        if (!cancelled) {
          setState(s);
          setLoadError(null);
        }
      } catch (e: any) {
        if (!cancelled) setLoadError(e.message ?? '상태 조회 실패');
      }
    }

    async function init() {
      try {
        if (!hasToken(roomCode)) {
          await joinGame(roomCode);
        }
        await refresh();
      } catch (e: any) {
        const msg = e.message ?? '입장 실패';
        if (msg.includes('Invalid token')) {
          // stale token — try joining fresh
          localStorage.removeItem('lostcity_token_' + roomCode.toUpperCase());
          try {
            await joinGame(roomCode);
            await refresh();
          } catch (e2: any) {
            if (!cancelled) setLoadError(e2.message ?? '입장 실패');
          }
        } else {
          if (!cancelled) setLoadError(msg);
        }
      }
    }

    init();
    const unsub = subscribeToGame(roomCode, refresh);
    return () => { cancelled = true; unsub(); };
  }, [roomCode]);

  async function doAction(action: Action) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await applyAction(roomCode, action);
      const s = await getState(roomCode);
      setState(s);
      setSelectedCard(null);
    } catch (e: any) {
      setError(e.message ?? '액션 실패');
    } finally {
      setBusy(false);
    }
  }

  async function handleRestart() {
    if (busy) return;
    if (!window.confirm('매치를 처음부터 다시 시작합니다. 진행 중인 라운드와 누적 점수가 사라집니다. 계속할까요?')) return;
    setBusy(true);
    setError(null);
    try {
      await restartMatch(roomCode);
      const s = await getState(roomCode);
      setState(s);
      setSelectedCard(null);
    } catch (e: any) {
      setError(e.message ?? '재시작 실패');
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <div className="lobby">
        <div className="lobby-card">
          <h1>입장 실패</h1>
          <div className="error" style={{ marginBottom: 16 }}>{loadError}</div>
          <button className="primary" style={{ width: '100%' }} onClick={onLeave}>로비로</button>
        </div>
      </div>
    );
  }

  if (!state) {
    return <div className="lobby"><div className="lobby-card">로딩 중...</div></div>;
  }

  if (!state.p2_joined) {
    const url = `${window.location.origin}${window.location.pathname}#/r/${state.room_code}`;
    return (
      <div className="lobby">
        <div className="lobby-card">
          <h1>상대 기다리는 중</h1>
          <div className="subtitle">아래 방 코드 또는 링크를 상대에게 보내세요.</div>

          <div style={{ marginTop: 24 }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: 12, color: 'var(--muted)' }}>방 코드</h3>
            <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 32, letterSpacing: '0.3em', textAlign: 'center', color: 'var(--accent)', padding: '16px', background: 'var(--bg)', borderRadius: 8 }}>
              {state.room_code}
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: 12, color: 'var(--muted)' }}>링크</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={url} readOnly style={{ flex: 1, fontSize: 12, letterSpacing: 0, textAlign: 'left', textTransform: 'none' }} />
              <button onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
                {copied ? '복사됨' : '복사'}
              </button>
            </div>
          </div>

          <div style={{ marginTop: 24, display: 'flex', gap: 8 }}>
            <button onClick={onLeave} style={{ flex: 1 }}>로비로</button>
          </div>
        </div>
      </div>
    );
  }

  if (state.ended) {
    return <GameOver state={state} onLeave={onLeave} />;
  }

  return (
    <Board
      state={state}
      selectedCard={selectedCard}
      setSelectedCard={setSelectedCard}
      doAction={doAction}
      busy={busy}
      error={error}
      onLeave={onLeave}
      onRestart={handleRestart}
    />
  );
}

// ============================================================
// Board
// ============================================================

interface BoardProps {
  state: GameState;
  selectedCard: number | null;
  setSelectedCard: (id: number | null) => void;
  doAction: (a: Action) => void;
  busy: boolean;
  error: string | null;
  onLeave: () => void;
  onRestart: () => void;
}

function Board({ state, selectedCard, setSelectedCard, doAction, busy, error, onLeave, onRestart }: BoardProps) {
  const isMyTurn = state.turn === state.role;
  const meKey = state.role;
  const oppKey = state.role === 'p1' ? 'p2' : 'p1';
  const myExpeditions = state.expeditions[meKey];
  const oppExpeditions = state.expeditions[oppKey];

  const canPlayOrDiscard = isMyTurn && state.phase === 'play_or_discard';
  const canDraw = isMyTurn && state.phase === 'draw';

  const sortedHand = useMemo(() => sortHand(state.my_hand), [state.my_hand]);
  const selectedInfo = selectedCard !== null ? cardInfo(selectedCard) : null;

  function canPlayOnExpedition(color: Color): { ok: boolean; reason?: string } {
    if (!selectedInfo) return { ok: false };
    if (selectedInfo.color !== color) return { ok: false };
    const exp = myExpeditions[color];
    if (selectedInfo.type === 'wager') {
      const hasNumber = exp.some((id) => cardInfo(id).type === 'number');
      if (hasNumber) return { ok: false, reason: '이미 숫자 카드 있음' };
      if (exp.filter((id) => cardInfo(id).type === 'wager').length >= 3) {
        return { ok: false, reason: '베팅 3장 한계' };
      }
      return { ok: true };
    }
    const maxNum = Math.max(0, ...exp.filter((id) => cardInfo(id).type === 'number').map((id) => cardInfo(id).value!));
    if (maxNum > 0 && selectedInfo.value! <= maxNum) return { ok: false, reason: `${maxNum} 초과만 가능` };
    return { ok: true };
  }

  function canDiscardOn(color: Color): boolean {
    return selectedInfo?.color === color;
  }

  function canDrawFromDiscard(color: Color): boolean {
    if (!canDraw) return false;
    if (color === state.last_discard_color) return false;
    return state.discards[color].length > 0;
  }

  const statusText = (() => {
    if (!isMyTurn) return '상대 차례';
    if (state.phase === 'play_or_discard') return selectedCard === null ? '내 손에서 카드를 골라보자' : '탐험에 놓거나 같은 색으로 버려';
    return '카드를 한 장 드로우 (덱 또는 버림 더미)';
  })();

  return (
    <div className="board">
      {/* Top bar */}
      <div className="top-bar">
        <div className="title">Lost Cities</div>
        {state.mode === 'match3' && (
          <div className="round-pill" title={`라운드 ${state.current_round} / ${state.max_rounds}`}>
            R{state.current_round}/{state.max_rounds}
          </div>
        )}
        <div className="room-code">{state.room_code}</div>
        {state.mode === 'match3' && state.round_history.length > 0 && (
          <div className="cum-pill">
            <span style={{ color: 'var(--muted)', fontSize: 11, marginRight: 6 }}>누적</span>
            <strong>{state.cumulative[meKey]}</strong>
            <span style={{ color: 'var(--muted)', margin: '0 6px' }}>vs</span>
            <strong>{state.cumulative[oppKey]}</strong>
          </div>
        )}
        <div className={`turn-indicator ${isMyTurn ? 'turn-mine' : 'turn-theirs'}`}>
          {isMyTurn ? '내 차례' : '상대 차례'}
        </div>
        <button onClick={onRestart} disabled={busy} title="매치 재시작">↻ 재시작</button>
        <button onClick={onLeave}>나가기</button>
      </div>

      {/* Opponent area */}
      <div className="opp-area">
        <div>
          <div style={{ fontWeight: 600 }}>상대 ({oppKey.toUpperCase()})</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>손패 {state.opponent_hand_count}장</div>
        </div>
        <div className="opp-hand">
          {Array.from({ length: state.opponent_hand_count }).map((_, i) => (
            <div key={i} className="opp-card" />
          ))}
        </div>
      </div>

      {/* Opponent expeditions */}
      <div className="expeditions">
        {COLORS.map((c) => (
          <div key={c} className="exp-col">
            <div className="exp-col-label">상대 · {COLOR_LABEL[c]}</div>
            <div className="exp-stack">
              {oppExpeditions[c].map((id) => (
                <Card key={id} cardId={id} small />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Middle: deck + discards */}
      <div className="middle-row">
        <div
          className={`deck-area ${canDraw && state.deck_count > 0 ? 'target' : ''}`}
          onClick={() => { if (canDraw && state.deck_count > 0 && !busy) doAction({ type: 'DRAW_FROM_DECK' }); }}
        >
          <div className="deck-back" />
          <div className="deck-count">{state.deck_count}</div>
          <div className="deck-label">덱</div>
        </div>

        <div className="discards-row">
          {COLORS.map((c) => {
            const pile = state.discards[c];
            const top = pile[pile.length - 1];
            const isDiscardTarget = canPlayOrDiscard && selectedCard !== null && canDiscardOn(c);
            const isDrawTarget = canDrawFromDiscard(c);
            const cls = ['discard-pile'];
            if (isDiscardTarget) cls.push('target');
            if (isDrawTarget) cls.push('draw-target');
            return (
              <div
                key={c}
                className={cls.join(' ')}
                onClick={() => {
                  if (busy) return;
                  if (isDiscardTarget) doAction({ type: 'DISCARD', cardId: selectedCard! });
                  else if (isDrawTarget) doAction({ type: 'DRAW_FROM_DISCARD', color: c });
                }}
              >
                <div className="discard-pile-label">버림 · {COLOR_LABEL[c]}</div>
                {top !== undefined ? <Card cardId={top} small /> : <span className="empty-pile">비어있음</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* My expeditions */}
      <div className="expeditions">
        {COLORS.map((c) => {
          const exp = myExpeditions[c];
          const playCheck = canPlayOrDiscard && selectedCard !== null ? canPlayOnExpedition(c) : { ok: false };
          const isTarget = playCheck.ok;
          const isBadTarget = canPlayOrDiscard && selectedInfo?.color === c && !playCheck.ok && exp !== undefined;
          const cls = ['exp-col'];
          if (isTarget) cls.push('target');
          else if (isBadTarget) cls.push('target-bad');
          return (
            <div
              key={c}
              className={cls.join(' ')}
              onClick={() => {
                if (busy) return;
                if (isTarget) doAction({ type: 'PLAY', cardId: selectedCard! });
              }}
              title={isBadTarget ? playCheck.reason : undefined}
            >
              <div className="exp-col-label">내 · {COLOR_LABEL[c]} {exp.length > 0 && `(${exp.length})`}</div>
              <div className="exp-stack">
                {exp.map((id) => <Card key={id} cardId={id} small />)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Hand */}
      <div className="hand-area">
        <div className="hint">{statusText}</div>
        {error && <div className="error" style={{ textAlign: 'center' }}>{error}</div>}
        <div className="hand-row">
          {sortedHand.map((id) => (
            <Card
              key={id}
              cardId={id}
              clickable={canPlayOrDiscard && !busy}
              selected={selectedCard === id}
              disabled={!canPlayOrDiscard}
              onClick={() => setSelectedCard(selectedCard === id ? null : id)}
            />
          ))}
        </div>
        <div className="hand-actions">
          {selectedCard !== null && (
            <button onClick={() => setSelectedCard(null)}>선택 해제</button>
          )}
          {canPlayOrDiscard && selectedCard === null && (
            <span className="hint">손에서 카드를 클릭하세요</span>
          )}
        </div>
      </div>
    </div>
  );
}
