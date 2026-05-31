// ============================================================
// Quoridor — 진입점 / 내부 라우터
//   #/quoridor          → 로비
//   #/quoridor/local    → 로컬 핫시트
//   #/quoridor/r/CODE   → 온라인 방
// ============================================================

import { useEffect, useState } from 'react';
import QuoridorGame from './QuoridorGame';
import QuoridorLobby from './ui/QuoridorLobby';
import { useLocalController, useOnlineController } from './controllers';
import './quoridor.css';

type Sub = { name: 'lobby' } | { name: 'local' } | { name: 'room'; code: string };

function parseSub(): Sub {
  const h = window.location.hash.replace(/^#/, '');
  if (/^\/quoridor\/local\b/i.test(h)) return { name: 'local' };
  const m = h.match(/^\/quoridor\/r\/([A-Z0-9]+)/i);
  if (m) return { name: 'room', code: m[1].toUpperCase() };
  return { name: 'lobby' };
}

// 각 뷰는 자기 컨트롤러 훅을 무조건 1회 호출 (조건부 훅 금지 회피)
function LocalGameView({ onLeave }: { onLeave: () => void }) {
  const controller = useLocalController();
  return <QuoridorGame controller={controller} onLeave={onLeave} />;
}

function OnlineGameView({ code, onLeave }: { code: string; onLeave: () => void }) {
  const controller = useOnlineController(code);
  return <QuoridorGame controller={controller} onLeave={onLeave} />;
}

export default function QuoridorApp({ onLeave }: { onLeave?: () => void }) {
  const [sub, setSub] = useState<Sub>(parseSub());

  useEffect(() => {
    const onHash = () => setSub(parseSub());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const goLobby = () => {
    window.location.hash = '/quoridor';
  };
  const goLocal = () => {
    window.location.hash = '/quoridor/local';
  };
  const goRoom = (code: string) => {
    window.location.hash = `/quoridor/r/${code}`;
  };
  const exitToMain = onLeave ?? (() => {
    window.location.hash = '';
  });

  if (sub.name === 'local') return <LocalGameView onLeave={goLobby} />;
  if (sub.name === 'room') return <OnlineGameView code={sub.code} onLeave={goLobby} />;
  return <QuoridorLobby onLocal={goLocal} onRoom={goRoom} onExit={exitToMain} />;
}
