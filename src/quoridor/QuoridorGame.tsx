// ============================================================
// Quoridor — 게임 화면 (로컬/온라인 공통)
//  · 이동: 합법 칸 클릭
//  · 벽: WallTray 조각을 보드로 드래그 (포인터 스냅)
// ============================================================

import { useCallback, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Move, Pos, Wall } from './engine/types';
import { getLegalMoves, isLegalWall } from './engine/rules';
import type { Controller } from './controllers';
import Board from './ui/Board';
import Controls from './ui/Controls';
import WallTray from './ui/WallTray';
import { BOARD_PX, snapWall, wallRect } from './ui/layout';
import './quoridor.css';

const PLAYER_NAME = { P1: '플레이어 1', P2: '플레이어 2' } as const;

export default function QuoridorGame({
  controller,
  onLeave,
}: {
  controller: Controller;
  onLeave: () => void;
}) {
  const { game, role, canAct, canUndo, waitingForOpponent, roomCode, error } = controller;
  const current = game.players[game.currentTurn];

  // 트레이가 표현하는 "내" 플레이어: 온라인은 내 역할, 로컬은 현재 차례
  const trayId = role ?? current.id;
  const trayPlayer = game.players.find((p) => p.id === trayId)!;
  const canDragWall = canAct && trayPlayer.wallsRemaining > 0;

  const legalMoves: Pos[] = canAct ? getLegalMoves(game, current.id) : [];

  const boardRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState(false);
  const [ghostWall, setGhostWall] = useState<Wall | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [copied, setCopied] = useState(false);

  // 최신 값을 window 리스너 콜백에서 참조하기 위한 ref
  const gameRef = useRef(game);
  gameRef.current = game;
  const submitRef = useRef(controller.submitMove);
  submitRef.current = controller.submitMove;
  const canDragRef = useRef(canDragWall);
  canDragRef.current = canDragWall;

  const ghostLegal = ghostWall ? isLegalWall(game, ghostWall) : false;

  function clientToBoard(clientX: number, clientY: number): Wall | null {
    const svg = boardRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const ux = ((clientX - rect.left) / rect.width) * BOARD_PX;
    const uy = ((clientY - rect.top) / rect.height) * BOARD_PX;
    return snapWall(ux, uy);
  }

  const startWallDrag = useCallback((e: ReactPointerEvent) => {
    if (!canDragRef.current) return;
    e.preventDefault();
    setDragging(true);
    setCursor({ x: e.clientX, y: e.clientY });

    const onMove = (ev: PointerEvent) => {
      setCursor({ x: ev.clientX, y: ev.clientY });
      setGhostWall(clientToBoard(ev.clientX, ev.clientY));
    };
    const onUp = (ev: PointerEvent) => {
      const w = clientToBoard(ev.clientX, ev.clientY);
      if (w && isLegalWall(gameRef.current, w)) {
        submitRef.current({ type: 'WALL', wall: w } as Move);
      }
      setDragging(false);
      setGhostWall(null);
      setCursor(null);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleCellClick(p: Pos) {
    if (!canAct) return;
    controller.submitMove({ type: 'MOVE', to: p });
  }

  function copyInvite() {
    if (!roomCode) return;
    const url = `${location.origin}${location.pathname}#/quoridor/r/${roomCode}`;
    const done = () => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(done).catch(() => {});
    } else {
      done();
    }
  }

  // 커서를 따라다니는 floating 벽 조각 (드래그 피드백)
  const floatRect = wallRect({ col: 0, row: 0, orientation: ghostWall?.orientation ?? 'H' });

  return (
    <div className="q-root">
      <header className="q-header">
        <h1 className="q-title">Quoridor · 쿼리도</h1>
        <div className="q-headright">
          {roomCode && (
            <span className="q-roomchip" title="이 방 코드를 상대에게 공유하세요">
              <span className="q-roomchip-label">방 코드</span>
              <span className="q-roomchip-code">{roomCode}</span>
              <button className="q-copybtn" onClick={copyInvite}>
                {copied ? '복사됨!' : '링크 복사'}
              </button>
            </span>
          )}
          <button className="q-leave" onClick={onLeave}>
            ← 나가기
          </button>
        </div>
      </header>

      {controller.connecting ? (
        <div className="q-loading">연결 중…</div>
      ) : (
        <div className="q-layout">
          <div className="q-boardcol">
            <div className="q-boardwrap">
              <Board
                ref={boardRef}
                game={game}
                legalMoves={legalMoves}
                interactive={canAct}
                ghostWall={ghostWall}
                ghostLegal={ghostLegal}
                onCellClick={handleCellClick}
              />

              {game.status === 'finished' && game.winner && (
                <div className="q-overlay">
                  <div className="q-overlay-card">
                    <div className="q-win-emoji">🏆</div>
                    <div className="q-win-title">
                      {PLAYER_NAME[game.winner]}
                      {role === game.winner ? ' (나)' : ''} 승리!
                    </div>
                    <button className="q-primary" onClick={controller.restart}>
                      다시 시작
                    </button>
                  </div>
                </div>
              )}
            </div>

            <WallTray
              label={role ? '내 벽 보관함' : `${PLAYER_NAME[trayId]} 벽 보관함`}
              walls={trayPlayer.wallsRemaining}
              enabled={canDragWall}
              dragging={dragging}
              onStart={startWallDrag}
            />
          </div>

          <Controls
            game={game}
            role={role}
            canAct={canAct}
            canUndo={canUndo}
            waitingForOpponent={waitingForOpponent}
            onUndo={controller.undo}
            onRestart={controller.restart}
          />
        </div>
      )}

      {error && <div className="q-error">{error}</div>}

      {dragging && cursor && (
        <div
          className="q-floatwall"
          style={{
            left: cursor.x,
            top: cursor.y,
            width: floatRect.width / 2,
            height: floatRect.height / 2,
          }}
        />
      )}
    </div>
  );
}
