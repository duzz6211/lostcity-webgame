import { useState } from 'react';
import { nextRound, restartMatch } from '../lib/api';
import type { GameState, PlayerBreakdown, Role, RoundResult } from '../lib/types';
import { colorsFor, COLOR_LABEL } from '../lib/types';

interface Props { state: GameState; onLeave: () => void; onReload?: () => Promise<void>; }

function valueColor(v: number) {
  if (v > 0) return 'var(--ok)';
  if (v < 0) return 'var(--danger)';
  return 'var(--muted)';
}

function bannerFor(myTotal: number, oppTotal: number, label: string) {
  if (myTotal > oppTotal) return `🏆 ${label} 승리! (+${myTotal - oppTotal})`;
  if (myTotal < oppTotal) return `😢 ${label} 패배 (${myTotal - oppTotal})`;
  return `🤝 ${label} 무승부 (${myTotal})`;
}

export default function GameOver({ state, onLeave, onReload }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const meKey: Role = state.role;
  const oppKey: Role = state.role === 'p1' ? 'p2' : 'p1';

  const history = state.round_history;
  const lastRound: RoundResult | undefined = history[history.length - 1];

  const cumMy = state.cumulative[meKey];
  const cumOpp = state.cumulative[oppKey];

  const isMatchOver = state.match_ended || state.mode === 'single';
  const isRoundIntermission = state.ended && !isMatchOver;

  const colors = colorsFor(state.ruleset);
  const showGoals = state.ruleset === '6special';

  async function handleNext() {
    setBusy(true); setError(null);
    try {
      await nextRound(state.room_code);
      await onReload?.();
    } catch (e: any) {
      setError(e.message ?? '다음 라운드 실패');
      setBusy(false);
    }
  }
  async function handleRestart() {
    setBusy(true); setError(null);
    try {
      await restartMatch(state.room_code);
      await onReload?.();
    } catch (e: any) {
      setError(e.message ?? '재시작 실패');
      setBusy(false);
    }
  }

  return (
    <div className="gameover">
      <div className="gameover-card">
        {isRoundIntermission ? (
          <>
            <h1>라운드 {lastRound?.round ?? state.current_round} 결과</h1>
            <div className="winner-banner">
              {lastRound && bannerFor(lastRound[meKey].total, lastRound[oppKey].total, '라운드')}
            </div>
            {lastRound && <BreakdownTable my={lastRound[meKey]} opp={lastRound[oppKey]} colors={colors} showGoals={showGoals} />}

            <div style={{ marginTop: 20, padding: 16, background: 'var(--bg)', borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                매치 누적 ({state.current_round} / {state.max_rounds})
              </div>
              <CumulativeRow myTotal={cumMy} oppTotal={cumOpp} />
            </div>

            {error && <div className="error" style={{ textAlign: 'center', marginTop: 12 }}>{error}</div>}

            <div className="gameover-actions">
              <button onClick={onLeave} disabled={busy}>로비로</button>
              <button className="primary" onClick={handleNext} disabled={busy}>
                {busy ? '준비 중...' : `라운드 ${state.current_round + 1} 시작 →`}
              </button>
            </div>
          </>
        ) : (
          <>
            <h1>{state.mode === 'match3' ? '매치 종료' : '게임 종료'}</h1>
            <div className="winner-banner">
              {bannerFor(cumMy, cumOpp, state.mode === 'match3' ? '매치' : '게임')}
            </div>

            {history.length > 1 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                  라운드별 결과
                </div>
                <table className="score-table">
                  <thead>
                    <tr>
                      <th className="col-name">라운드</th>
                      <th>나</th>
                      <th>상대</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((r) => (
                      <tr key={r.round}>
                        <td className="col-name">R{r.round}</td>
                        <td style={{ color: valueColor(r[meKey].total) }}>{r[meKey].total}</td>
                        <td style={{ color: valueColor(r[oppKey].total) }}>{r[oppKey].total}</td>
                      </tr>
                    ))}
                    <tr className="total">
                      <td className="col-name">합계</td>
                      <td>{cumMy}</td>
                      <td>{cumOpp}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {lastRound && (
              <>
                <div style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                  마지막 라운드 색깔별
                </div>
                <BreakdownTable my={lastRound[meKey]} opp={lastRound[oppKey]} colors={colors} showGoals={showGoals} />
              </>
            )}

            {error && <div className="error" style={{ textAlign: 'center', marginTop: 12 }}>{error}</div>}

            <div className="gameover-actions">
              <button onClick={onLeave} disabled={busy}>로비로</button>
              <button className="primary" onClick={handleRestart} disabled={busy}>
                {busy ? '준비 중...' : '재시작'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function BreakdownTable({
  my, opp, colors, showGoals,
}: { my: PlayerBreakdown; opp: PlayerBreakdown; colors: import('../lib/types').Color[]; showGoals: boolean }) {
  return (
    <table className="score-table">
      <thead>
        <tr>
          <th className="col-name">항목</th>
          <th>나</th>
          <th>상대</th>
        </tr>
      </thead>
      <tbody>
        {colors.map((c) => (
          <tr key={c}>
            <td className="col-name">{COLOR_LABEL[c]}</td>
            <td style={{ color: valueColor(my[c] ?? 0) }}>{my[c] ?? 0}</td>
            <td style={{ color: valueColor(opp[c] ?? 0) }}>{opp[c] ?? 0}</td>
          </tr>
        ))}
        {showGoals && (
          <tr>
            <td className="col-name">목표 카드</td>
            <td style={{ color: valueColor(my.goals ?? 0) }}>+{my.goals ?? 0}</td>
            <td style={{ color: valueColor(opp.goals ?? 0) }}>+{opp.goals ?? 0}</td>
          </tr>
        )}
        <tr className="total">
          <td className="col-name">합계</td>
          <td>{my.total}</td>
          <td>{opp.total}</td>
        </tr>
      </tbody>
    </table>
  );
}

function CumulativeRow({ myTotal, oppTotal }: { myTotal: number; oppTotal: number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', fontSize: 20, fontWeight: 700 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500 }}>나</div>
        <div style={{ color: valueColor(myTotal) }}>{myTotal}</div>
      </div>
      <div style={{ color: 'var(--muted)' }}>vs</div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500 }}>상대</div>
        <div style={{ color: valueColor(oppTotal) }}>{oppTotal}</div>
      </div>
    </div>
  );
}
