import { useEffect, useState } from 'react';
import Lobby from './components/Lobby';
import Game from './components/Game';
import HomeMenu from './components/HomeMenu';
import QuoridorApp from './quoridor/QuoridorApp';

function parseRoute():
  | { name: 'home' }
  | { name: 'lobby' }
  | { name: 'room'; code: string }
  | { name: 'quoridor' } {
  const h = window.location.hash.replace(/^#/, '');
  if (/^\/quoridor\b/i.test(h)) return { name: 'quoridor' };
  // '/forgotten-kingdom'가 정식 경로. 구 '/lostcities' 링크도 호환을 위해 받아준다.
  if (/^\/(forgotten-kingdom|lostcities)\b/i.test(h)) return { name: 'lobby' };
  const m = h.match(/^\/r\/([A-Z0-9]+)/i);
  if (m) return { name: 'room', code: m[1].toUpperCase() };
  return { name: 'home' };
}

export default function App() {
  const [route, setRoute] = useState(parseRoute());

  useEffect(() => {
    const onHash = () => setRoute(parseRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  function goHome() { window.location.hash = ''; }
  function goFkLobby() { window.location.hash = '/forgotten-kingdom'; }
  function goQuoridor() { window.location.hash = '/quoridor'; }
  function goRoom(code: string) { window.location.hash = `/r/${code}`; }

  if (route.name === 'quoridor') return <QuoridorApp onLeave={goHome} />;
  if (route.name === 'lobby') return <Lobby onEnter={goRoom} />;
  if (route.name === 'room') return <Game roomCode={route.code} onLeave={goFkLobby} />;
  return <HomeMenu onForgottenKingdom={goFkLobby} onQuoridor={goQuoridor} />;
}
