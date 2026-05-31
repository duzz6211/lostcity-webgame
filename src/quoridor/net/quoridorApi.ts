// ============================================================
// Quoridor — Supabase multiplayer client (client-authoritative)
// 변경은 RPC, 상태 read/구독은 quoridor_games 테이블 직접.
// ============================================================

import { supabase } from '../../lib/supabase';
import type { GameState, PlayerId } from '../engine/types';

const TOKEN_PREFIX = 'q_token_';

function newUuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// 방 코드별 고유 토큰을 localStorage 에 보관 (없으면 생성).
export function tokenFor(roomCode: string): string {
  const key = TOKEN_PREFIX + roomCode.toUpperCase();
  let t = localStorage.getItem(key);
  if (!t) {
    t = newUuid();
    localStorage.setItem(key, t);
  }
  return t;
}

function rememberToken(roomCode: string, token: string) {
  localStorage.setItem(TOKEN_PREFIX + roomCode.toUpperCase(), token);
}

export interface RoomRow {
  room_code: string;
  state: GameState;
  version: number;
  p1_present: boolean;
  p2_present: boolean;
}

export async function createRoom(): Promise<{ roomCode: string; role: PlayerId }> {
  const token = newUuid();
  const { data, error } = await supabase.rpc('quoridor_create', { _p1_token: token });
  if (error) throw new Error(error.message);
  rememberToken(data.room_code, token);
  return { roomCode: data.room_code, role: data.role };
}

export async function joinRoom(roomCode: string): Promise<{ roomCode: string; role: PlayerId }> {
  const code = roomCode.toUpperCase();
  const token = tokenFor(code);
  const { data, error } = await supabase.rpc('quoridor_join', { _room_code: code, _token: token });
  if (error) throw new Error(error.message);
  return { roomCode: data.room_code, role: data.role };
}

export async function fetchRoom(roomCode: string): Promise<RoomRow> {
  const code = roomCode.toUpperCase();
  const { data, error } = await supabase
    .from('quoridor_games')
    .select('room_code, state, version, p1_present, p2_present')
    .eq('room_code', code)
    .single();
  if (error) throw new Error(error.message);
  return rowToRoom(data);
}

export async function applyState(
  roomCode: string,
  state: GameState,
  expectedVersion: number,
): Promise<{ version: number }> {
  const code = roomCode.toUpperCase();
  const token = tokenFor(code);
  const { data, error } = await supabase.rpc('quoridor_apply', {
    _room_code: code,
    _token: token,
    _state: state,
    _expected_version: expectedVersion,
  });
  if (error) throw new Error(error.message);
  return { version: data.version };
}

export async function restartRoom(roomCode: string): Promise<{ version: number }> {
  const code = roomCode.toUpperCase();
  const token = tokenFor(code);
  const { data, error } = await supabase.rpc('quoridor_restart', { _room_code: code, _token: token });
  if (error) throw new Error(error.message);
  return { version: data.version };
}

// quoridor_games 행 UPDATE/INSERT 를 구독. 페이로드의 새 행을 그대로 전달.
export function subscribeRoom(roomCode: string, onRow: (row: RoomRow) => void): () => void {
  const code = roomCode.toUpperCase();
  const channel = supabase
    .channel(`quoridor:${code}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'quoridor_games', filter: `room_code=eq.${code}` },
      (payload) => {
        const row = payload.new as Record<string, unknown> | undefined;
        if (row && row.state) onRow(rowToRoom(row));
      },
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

function rowToRoom(row: Record<string, unknown>): RoomRow {
  return {
    room_code: row.room_code as string,
    state: row.state as GameState,
    version: row.version as number,
    p1_present: row.p1_present !== false,
    p2_present: !!row.p2_present,
  };
}
