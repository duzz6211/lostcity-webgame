// ============================================================
// Quoridor — game controllers (로컬 핫시트 / 온라인 멀티플레이)
// QuoridorGame 은 어느 컨트롤러든 동일한 Controller 인터페이스로 다룬다.
// ============================================================

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { GameState, Move, PlayerId } from './engine/types';
import { applyMove, createInitialState } from './engine/state';
import { applyState, fetchRoom, joinRoom, restartRoom, subscribeRoom } from './net/quoridorApi';

export interface Controller {
  game: GameState;
  role: PlayerId | null; // null = 로컬 핫시트 (양쪽 모두 조작)
  canAct: boolean; // 지금 이 클라이언트가 행동할 수 있는가
  canUndo: boolean;
  connecting: boolean; // 온라인: 초기 상태 로딩 중
  waitingForOpponent: boolean; // 온라인: 상대 미입장
  roomCode: string | null;
  error: string | null;
  submitMove: (move: Move) => void;
  undo: () => void;
  restart: () => void;
}

// ------------------------------------------------------------
// 로컬 핫시트
// ------------------------------------------------------------
interface LocalState {
  game: GameState;
  past: GameState[];
}

type LocalAction =
  | { type: 'APPLY'; move: Move }
  | { type: 'UNDO' }
  | { type: 'RESET' };

function localReducer(state: LocalState, action: LocalAction): LocalState {
  switch (action.type) {
    case 'APPLY': {
      const next = applyMove(state.game, action.move);
      if (next === state.game) return state; // 불법 수 → 변화 없음
      return { game: next, past: [...state.past, state.game] };
    }
    case 'UNDO': {
      if (state.past.length === 0) return state;
      const past = state.past.slice();
      const prev = past.pop()!;
      return { game: prev, past };
    }
    case 'RESET':
      return { game: createInitialState(), past: [] };
    default:
      return state;
  }
}

export function useLocalController(): Controller {
  const [{ game, past }, dispatch] = useReducer(localReducer, undefined, () => ({
    game: createInitialState(),
    past: [],
  }));

  return {
    game,
    role: null,
    canAct: game.status === 'playing',
    canUndo: past.length > 0,
    connecting: false,
    waitingForOpponent: false,
    roomCode: null,
    error: null,
    submitMove: (move) => dispatch({ type: 'APPLY', move }),
    undo: () => dispatch({ type: 'UNDO' }),
    restart: () => dispatch({ type: 'RESET' }),
  };
}

// ------------------------------------------------------------
// 온라인 (Supabase, 클라이언트 권위)
// ------------------------------------------------------------
export function useOnlineController(roomCode: string): Controller {
  const [game, setGame] = useState<GameState>(() => createInitialState());
  const [version, setVersion] = useState(-1);
  const [role, setRole] = useState<PlayerId | null>(null);
  const [opponentPresent, setOpponentPresent] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 최신 값을 콜백에서 참조하기 위한 ref
  const versionRef = useRef(version);
  versionRef.current = version;
  const gameRef = useRef(game);
  gameRef.current = game;

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const joined = await joinRoom(roomCode);
        if (!alive) return;
        setRole(joined.role);

        const room = await fetchRoom(roomCode);
        if (!alive) return;
        setGame(room.state);
        setVersion(room.version);
        setOpponentPresent(room.p1_present && room.p2_present);
        setConnecting(false);
      } catch (e) {
        if (alive) {
          setError(e instanceof Error ? e.message : String(e));
          setConnecting(false);
        }
      }
    })();

    const unsub = subscribeRoom(roomCode, (row) => {
      if (!alive) return;
      // 더 최신(또는 동일) 버전만 반영 (자기 쓰기 echo 포함)
      if (row.version >= versionRef.current) {
        setGame(row.state);
        setVersion(row.version);
        setOpponentPresent(row.p1_present && row.p2_present);
      }
    });

    return () => {
      alive = false;
      unsub();
    };
  }, [roomCode]);

  const submitMove = useCallback(
    (move: Move) => {
      const cur = gameRef.current;
      const next = applyMove(cur, move);
      if (next === cur) return; // 불법 수
      setError(null);
      setGame(next); // 낙관적 반영
      const expected = versionRef.current;
      applyState(roomCode, next, expected)
        .then(({ version: v }) => setVersion(v))
        .catch(async (e) => {
          setError(e instanceof Error ? e.message : String(e));
          // 거부(stale/순서) → 서버 권위 상태로 복구
          try {
            const room = await fetchRoom(roomCode);
            setGame(room.state);
            setVersion(room.version);
            setOpponentPresent(room.p1_present && room.p2_present);
          } catch {
            /* 무시: 다음 realtime 이벤트로 복구 */
          }
        });
    },
    [roomCode],
  );

  const restart = useCallback(() => {
    setError(null);
    restartRoom(roomCode).catch((e) =>
      setError(e instanceof Error ? e.message : String(e)),
    );
  }, [roomCode]);

  const current = game.players[game.currentTurn];
  const canAct =
    game.status === 'playing' && opponentPresent && role !== null && current.id === role;

  return {
    game,
    role,
    canAct,
    canUndo: false, // 온라인은 되돌리기 비활성
    connecting,
    waitingForOpponent: !opponentPresent,
    roomCode,
    error,
    submitMove,
    undo: () => {},
    restart,
  };
}
