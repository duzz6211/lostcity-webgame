import { supabase } from './supabase';
import type { Action, GameState, Mode } from './types';

const TOKEN_PREFIX = 'lostcity_token_';

function newUuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

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

export function hasToken(roomCode: string): boolean {
  return localStorage.getItem(TOKEN_PREFIX + roomCode.toUpperCase()) !== null;
}

export async function createGame(mode: Mode): Promise<{ room_code: string; role: 'p1' }> {
  const token = newUuid();
  const { data, error } = await supabase.rpc('create_game', { _p1_token: token, _mode: mode });
  if (error) throw new Error(error.message);
  rememberToken(data.room_code, token);
  return data;
}

export async function joinGame(roomCode: string): Promise<{ room_code: string; role: 'p1' | 'p2' }> {
  const code = roomCode.toUpperCase();
  const token = tokenFor(code);
  const { data, error } = await supabase.rpc('join_game', { _room_code: code, _p2_token: token });
  if (error) throw new Error(error.message);
  return data;
}

export async function getState(roomCode: string): Promise<GameState> {
  const code = roomCode.toUpperCase();
  const token = tokenFor(code);
  const { data, error } = await supabase.rpc('get_state', { _room_code: code, _token: token });
  if (error) throw new Error(error.message);
  return data as GameState;
}

export async function applyAction(roomCode: string, action: Action) {
  const code = roomCode.toUpperCase();
  const token = tokenFor(code);
  const { data, error } = await supabase.rpc('apply_action', { _room_code: code, _token: token, _action: action });
  if (error) throw new Error(error.message);
  return data;
}

export async function nextRound(roomCode: string) {
  const code = roomCode.toUpperCase();
  const token = tokenFor(code);
  const { data, error } = await supabase.rpc('next_round', { _room_code: code, _token: token });
  if (error) throw new Error(error.message);
  return data;
}

export async function restartMatch(roomCode: string) {
  const code = roomCode.toUpperCase();
  const token = tokenFor(code);
  const { data, error } = await supabase.rpc('restart_match', { _room_code: code, _token: token });
  if (error) throw new Error(error.message);
  return data;
}

export function subscribeToGame(roomCode: string, onChange: () => void): () => void {
  const code = roomCode.toUpperCase();
  const channel = supabase
    .channel(`game:${code}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'game_events', filter: `room_code=eq.${code}` },
      () => onChange()
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
