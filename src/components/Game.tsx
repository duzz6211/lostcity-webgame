import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyAction, applyActionAs, getState, getStateAs, hasToken, joinGame,
  restartMatch, subscribeToGame, timeoutAction,
} from '../lib/api';
import {
  cardInfo, COLOR_LABEL, colorsFor, sortHand,
  type Action, type Color, type GameState, type Role,
} from '../lib/types';
import { aiThinkDelayMs, chooseAction } from '../lib/ai';
import { playCardDraw, playCardPlace } from '../lib/sound';
import Card from './Card';
import GameOver from './GameOver';
import { RobotIcon, TimerIcon } from './icons';

const TURN_LIMIT_SECONDS = 60;

interface Props { roomCode: string; onLeave: () => void; }

export default function Game({ roomCode, onLeave }: Props) {
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const reload = useCallback(async () => {
    try {
      const s = await getState(roomCode);
      setState(s);
      setLoadError(null);
    } catch (e: any) {
      setLoadError(e.message ?? '상태 조회 실패');
    }
  }, [roomCode]);

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
          localStorage.removeItem('fk_token_' + roomCode.toUpperCase());
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
    console.log('[HUMAN] sending action', action, 'client thinks turn=', state?.turn, 'phase=', state?.phase, 'version=', state?.version);
    try {
      await applyAction(roomCode, action);
      const s = await getState(roomCode);
      setState(s);
      setSelectedCard(null);
    } catch (e: any) {
      const msg = e.message ?? '액션 실패';
      setError(msg);
      console.error('[HUMAN] action rejected:', msg);
      // Client state is likely stale — pull the truth from the server so UI re-syncs
      if (msg.includes('Not your turn') || msg.includes('Wrong phase') || msg.includes('Card not in hand')) {
        try {
          const s = await getState(roomCode);
          console.log('[HUMAN] server says turn=', s.turn, 'phase=', s.phase, 'version=', s.version);
          setState(s);
        } catch {}
      }
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
    return <GameOver state={state} onLeave={onLeave} onReload={reload} />;
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
      roomCode={roomCode}
      reload={reload}
    />
  );
}

// ============================================================
// Animation/sound diff tracking
// ============================================================

interface AnimState {
  expedAdded: { p1: Partial<Record<Color, number[]>>; p2: Partial<Record<Color, number[]>> };
  discardAdded: Partial<Record<Color, number>>;
  deckDrawAt: number;
  discardDrawColor: Color | null;
}

const emptyAnim: AnimState = {
  expedAdded: { p1: {}, p2: {} },
  discardAdded: {},
  deckDrawAt: 0,
  discardDrawColor: null,
};

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
  roomCode: string;
  reload: () => Promise<void>;
}

function Board({ state, selectedCard, setSelectedCard, doAction, busy, error, onLeave, onRestart, roomCode, reload }: BoardProps) {
  const isMyTurn = state.turn === state.role;
  const meKey = state.role;
  const oppKey: Role = state.role === 'p1' ? 'p2' : 'p1';
  const myExpeditions = state.expeditions[meKey];
  const oppExpeditions = state.expeditions[oppKey];

  const colors = useMemo(() => colorsFor(state.ruleset), [state.ruleset]);

  const canPlayOrDiscard = isMyTurn && state.phase === 'play_or_discard';
  const canDraw = isMyTurn && state.phase === 'draw';

  const aiTurn = state.is_ai_p2 && !isMyTurn && !state.ended && !state.match_ended;

  const sortedHand = useMemo(() => sortHand(state.my_hand), [state.my_hand]);
  const selectedInfo = selectedCard !== null ? cardInfo(selectedCard) : null;

  // ---- Animation + sound diff ----
  const prevStateRef = useRef<GameState | null>(null);
  const [anim, setAnim] = useState<AnimState>(emptyAnim);

  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = state;
    if (!prev) return;

    const next: AnimState = {
      expedAdded: { p1: {}, p2: {} },
      discardAdded: {},
      deckDrawAt: 0,
      discardDrawColor: null,
    };
    let playedPlace = false;
    let playedDraw = false;

    for (const role of ['p1', 'p2'] as Role[]) {
      for (const c of colors) {
        const prevExp = prev.expeditions[role]?.[c] || [];
        const newExp = state.expeditions[role]?.[c] || [];
        if (newExp.length > prevExp.length) {
          next.expedAdded[role][c] = newExp.slice(prevExp.length);
          playedPlace = true;
        }
      }
    }
    for (const c of colors) {
      const prevDis = prev.discards[c] || [];
      const newDis = state.discards[c] || [];
      if (newDis.length > prevDis.length) {
        next.discardAdded[c] = newDis[newDis.length - 1];
        playedPlace = true;
      } else if (newDis.length < prevDis.length) {
        next.discardDrawColor = c;
        playedDraw = true;
      }
    }
    if (state.deck_count < prev.deck_count) {
      next.deckDrawAt = Date.now();
      playedDraw = true;
    }

    if (playedPlace) playCardPlace();
    else if (playedDraw) playCardDraw();

    setAnim(next);
    const t = setTimeout(() => setAnim(emptyAnim), 700);
    return () => clearTimeout(t);
  }, [state, colors]);

  // ---- Turn timer (ticks for all turns; 0s reached → fire timeout + reload immediately) ----
  const [remaining, setRemaining] = useState<number>(TURN_LIMIT_SECONDS);
  const timeoutFiringRef = useRef(false);

  useEffect(() => {
    timeoutFiringRef.current = false;
    if (!state.turn_started_at) {
      setRemaining(TURN_LIMIT_SECONDS);
      return;
    }
    const startMs = new Date(state.turn_started_at).getTime();

    const fireTimeout = async () => {
      if (timeoutFiringRef.current) return;
      if (state.ended || state.match_ended) return;
      timeoutFiringRef.current = true;
      try {
        await timeoutAction(roomCode);
        await reload();
      } catch (err) {
        console.warn('[timeout] failed, will retry on next tick:', err);
        timeoutFiringRef.current = false;
      }
    };

    const tick = () => {
      const elapsed = (Date.now() - startMs) / 1000;
      const r = Math.max(0, TURN_LIMIT_SECONDS - elapsed);
      setRemaining(r);
      if (r <= 0) {
        // Fire immediately at 0s, regardless of who's turn it is.
        // Guard prevents re-entry while the RPC is in flight.
        void fireTimeout();
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [state.turn_started_at, state.version, state.ended, state.match_ended, roomCode, reload]);

  // ---- Goal panel dropdown state ----
  const [goalsOpen, setGoalsOpen] = useState(false);
  const goalsDropdownRef = useRef<HTMLDivElement | null>(null);
  const goalsButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!goalsOpen) return;
    const onDocPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (goalsDropdownRef.current?.contains(target)) return;
      if (goalsButtonRef.current?.contains(target)) return;
      setGoalsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setGoalsOpen(false);
    };
    document.addEventListener('mousedown', onDocPointerDown);
    document.addEventListener('touchstart', onDocPointerDown, { passive: true });
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocPointerDown);
      document.removeEventListener('touchstart', onDocPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [goalsOpen]);

  // ---- First-come achievement toast (선착순 한정, 1초) ----
  const [toast, setToast] = useState<{ role: Role; description: string } | null>(null);
  const prevGoalsRef = useRef<typeof state.goals | null>(null);

  useEffect(() => {
    const prev = prevGoalsRef.current;
    prevGoalsRef.current = state.goals;
    if (!prev || !state.goals) return;
    // Find newly claimed first-come goals (claimed_by went from null → role)
    for (let i = 0; i < state.goals.length; i++) {
      const cur = state.goals[i];
      const old = prev[i];
      if (!old) continue;
      if (cur.id !== old.id) continue;
      if (cur.category && cur.category !== 'first') continue;
      if (old.claimed_by === null && cur.claimed_by !== null) {
        setToast({ role: cur.claimed_by, description: cur.description });
        break;
      }
    }
  }, [state.goals]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1000);
    return () => clearTimeout(t);
  }, [toast]);

  // ---- AI auto-play (client-side heuristic) ----
  const [aiThinking, setAiThinking] = useState(false);
  const aiActedVersionRef = useRef<number | null>(null);

  useEffect(() => {
    if (!aiTurn || !state.ai_token) {
      setAiThinking(false);
      return;
    }
    if (aiActedVersionRef.current === state.version) return;
    const aiToken = state.ai_token;
    const aiRole = oppKey;
    setAiThinking(true);
    let cancelled = false;
    const tid = setTimeout(async () => {
      if (cancelled) return;
      try {
        const aiState = await getStateAs(roomCode, aiToken);
        if (cancelled) return;
        if (aiState.turn !== aiRole || aiState.ended || aiState.match_ended) return;
        aiActedVersionRef.current = state.version;
        const action = chooseAction(aiState, aiState.my_hand, aiRole);
        console.log('[AI] sending', action, 'aiState.turn=', aiState.turn, 'phase=', aiState.phase, 'version=', aiState.version);
        await applyActionAs(roomCode, aiToken, action);
        console.log('[AI] action accepted, reloading… cancelled=', cancelled);
        if (!cancelled) await reload();
      } catch (err) {
        console.error('[AI] action failed:', err);
        aiActedVersionRef.current = null;
      } finally {
        if (!cancelled) setAiThinking(false);
      }
    }, aiThinkDelayMs());
    return () => { cancelled = true; clearTimeout(tid); };
  }, [aiTurn, state.version, state.ai_token, roomCode, oppKey, reload]);

  // ---- Helpers ----
  function canPlayOnExpedition(color: Color): { ok: boolean; reason?: string } {
    if (!selectedInfo) return { ok: false };
    if (selectedInfo.color !== color) return { ok: false };
    const exp = myExpeditions[color] || [];
    if (selectedInfo.type === 'wager') {
      const hasNumber = exp.some((id) => cardInfo(id).type === 'number');
      if (hasNumber) return { ok: false, reason: '이미 숫자 카드 있음' };
      if (exp.filter((id) => cardInfo(id).type === 'wager').length >= 3) {
        return { ok: false, reason: '베팅 3장 한계' };
      }
      return { ok: true };
    }
    const numbers = exp.filter((id) => cardInfo(id).type === 'number').map((id) => cardInfo(id).value!);
    const maxNum = numbers.length ? Math.max(...numbers) : 0;
    if (maxNum > 0 && selectedInfo.value! <= maxNum) return { ok: false, reason: `${maxNum} 초과만 가능` };
    return { ok: true };
  }

  function canDiscardOn(color: Color): boolean {
    return selectedInfo?.color === color;
  }

  function canDrawFromDiscard(color: Color): boolean {
    if (!canDraw) return false;
    if (color === state.last_discard_color) return false;
    return (state.discards[color]?.length ?? 0) > 0;
  }

  const statusNode = (() => {
    if (!isMyTurn) {
      if (state.is_ai_p2) {
        return (
          <>
            <RobotIcon size={14} />
            <span>{aiThinking ? 'AI 생각 중...' : 'AI 차례'}</span>
          </>
        );
      }
      return <span>상대 차례</span>;
    }
    if (state.phase === 'play_or_discard') {
      return <span>{selectedCard === null ? '내 손에서 카드를 골라보자' : '탐험에 놓거나 같은 색으로 버려'}</span>;
    }
    return <span>카드를 한 장 드로우 (덱 또는 유적지 더미)</span>;
  })();

  const colCount = colors.length;
  const gridClass = colCount === 6 ? 'cols-6' : '';
  const remSec = Math.ceil(remaining);
  const timerClass = remSec <= 10 ? 'danger' : remSec <= 20 ? 'warn' : '';

  return (
    <div className="board">
      {/* Top bar */}
      <div className="top-bar">
        <div className="title">잊혀진 왕국</div>
        {state.is_ai_p2 && (
          <div className="round-pill ai-pill" title="AI 상대 대전">
            <RobotIcon size={14} />
            <span>AI</span>
          </div>
        )}
        {state.ruleset === '6rule' && (
          <div className="round-pill" title="6개 룰: 보라색 + 목표 카드" style={{ color: 'var(--c-p)' }}>6룰</div>
        )}
        {state.ruleset === '6rule' && state.goals && state.goals.length > 0 && (
          <button
            ref={goalsButtonRef}
            className={`goals-toggle ${goalsOpen ? 'is-open' : ''}`}
            onClick={() => setGoalsOpen((v) => !v)}
            title="이번 라운드 목표 보기"
            aria-expanded={goalsOpen}
          >
            <span>목표 카드</span>
            <span className="goals-toggle-mark" aria-hidden>{goalsOpen ? '×' : '+'}</span>
          </button>
        )}
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
        <div className={`timer-pill ${timerClass}`} title={aiTurn ? 'AI 진행 중 (60초 초과 시 자동 진행)' : '이번 턴 남은 시간'}>
          <TimerIcon size={13} />
          <span>{remSec}s</span>
        </div>
        <div className={`turn-indicator ${isMyTurn ? 'turn-mine' : 'turn-theirs'}`}>
          {isMyTurn ? '내 차례' : state.is_ai_p2 ? (
            <span className="ai-turn-label"><RobotIcon size={12} /><span>AI 차례</span></span>
          ) : '상대 차례'}
        </div>
        <button onClick={onRestart} disabled={busy} title="매치 재시작">↻ 재시작</button>
        <button onClick={onLeave}>나가기</button>
      </div>

      {/* Goal cards dropdown (slides down from top bar) */}
      {state.ruleset === '6rule' && state.goals && state.goals.length > 0 && goalsOpen && (
        <div ref={goalsDropdownRef} className="goals-dropdown goals-row goals-row-5" role="menu">
          {state.goals.map((g, i) => {
            const claimedByMe = g.claimed_by === meKey;
            const claimedByOpp = g.claimed_by === oppKey;
            const category = g.category;
            const cls = ['goal-card'];
            if (claimedByMe) cls.push('claimed-mine');
            else if (claimedByOpp) cls.push('claimed-opp');
            return (
              <div key={`${g.id}-${i}`} className={cls.join(' ')}>
                {claimedByMe && <div className="goal-claim-tag mine">내가 달성</div>}
                {claimedByOpp && <div className="goal-claim-tag opp">상대 달성</div>}
                <div className="goal-desc">{g.description}</div>
                <div className="goal-points">
                  +{g.points}점
                  {category && (
                    <span className={`goal-cat goal-cat-${category}`} style={{ marginLeft: 6 }}>
                      {category === 'first' ? '선착순' : '게임 종료'}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* First-come achievement toast */}
      {toast && (
        <div className="goal-toast">
          <strong>{toast.role === meKey ? '나' : (state.is_ai_p2 ? 'AI' : '상대')}</strong>
          {' 플레이어가 '}
          <strong>{toast.description}</strong>
          {' 목표 달성!'}
        </div>
      )}

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
      <div className={`expeditions ${gridClass}`}>
        {colors.map((c) => {
          const oppCol = oppExpeditions[c] || [];
          const addedOpp = anim.expedAdded[oppKey][c] || [];
          return (
            <div key={c} className={`exp-col theme-${c}`}>
              <div className="exp-col-label">상대 · {COLOR_LABEL[c]}</div>
              <div className="exp-stack">
                {oppCol.map((id) => (
                  <Card
                    key={id}
                    cardId={id}
                    small
                    animClass={addedOpp.includes(id) ? 'anim-from-top' : undefined}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Middle: deck + discards */}
      <div className={`middle-row ${gridClass}`}>
        <div
          className={`deck-area ${canDraw && state.deck_count > 0 ? 'target' : ''} ${anim.deckDrawAt ? 'draw-flash' : ''}`}
          onClick={() => { if (canDraw && state.deck_count > 0 && !busy) doAction({ type: 'DRAW_FROM_DECK' }); }}
        >
          <div className="deck-back" />
          <div className="deck-count">{state.deck_count}</div>
          <div className="deck-label">덱</div>
        </div>

        <div className={`discards-row ${gridClass}`}>
          {colors.map((c) => {
            const pile = state.discards[c] || [];
            const top = pile[pile.length - 1];
            const isDiscardTarget = canPlayOrDiscard && selectedCard !== null && canDiscardOn(c);
            const isDrawTarget = canDrawFromDiscard(c);
            const drewFromThis = anim.discardDrawColor === c;
            const justDiscardedId = anim.discardAdded[c];
            const cls = ['discard-pile', `theme-${c}`];
            if (isDiscardTarget) cls.push('target');
            if (isDrawTarget) cls.push('draw-target');
            if (drewFromThis) cls.push('draw-flash');
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
                <div className="discard-pile-label">유적지 · {COLOR_LABEL[c]}</div>
                {top !== undefined ? (
                  <Card
                    cardId={top}
                    small
                    animClass={justDiscardedId === top ? 'anim-discard' : undefined}
                  />
                ) : (
                  <span className="empty-pile">비어있음</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* My expeditions */}
      <div className={`expeditions ${gridClass}`}>
        {colors.map((c) => {
          const exp = myExpeditions[c] || [];
          const playCheck = canPlayOrDiscard && selectedCard !== null ? canPlayOnExpedition(c) : { ok: false };
          const isTarget = playCheck.ok;
          const isBadTarget = canPlayOrDiscard && selectedInfo?.color === c && !playCheck.ok;
          const addedMine = anim.expedAdded[meKey][c] || [];
          const cls = ['exp-col', `theme-${c}`];
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
                {exp.map((id) => (
                  <Card
                    key={id}
                    cardId={id}
                    small
                    animClass={addedMine.includes(id) ? 'anim-from-bottom' : undefined}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Hand */}
      <div className="hand-area">
        <div className="hint">{statusNode}</div>
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
