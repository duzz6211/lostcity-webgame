import { useEffect, useState } from 'react';
import Lobby from './components/Lobby';
import Game from './components/Game';

function parseRoute(): { name: 'lobby' } | { name: 'room'; code: string } {
  const h = window.location.hash.replace(/^#/, '');
  const m = h.match(/^\/r\/([A-Z0-9]+)/i);
  if (m) return { name: 'room', code: m[1].toUpperCase() };
  return { name: 'lobby' };
}

export default function App() {
  const [route, setRoute] = useState(parseRoute());

  useEffect(() => {
    const onHash = () => setRoute(parseRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  function goLobby() { window.location.hash = ''; }
  function goRoom(code: string) { window.location.hash = `/r/${code}`; }

  if (route.name === 'lobby') return <Lobby onEnter={goRoom} />;
  return <Game roomCode={route.code} onLeave={goLobby} />;
}
