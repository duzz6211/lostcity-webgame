// ============================================================
// 메인 화면 — 어떤 게임을 할지 고른다 (잊혀진 왕국 / Quoridor)
// ============================================================

interface Props {
  onForgottenKingdom: () => void;
  onQuoridor: () => void;
}

export default function HomeMenu({ onForgottenKingdom, onQuoridor }: Props) {
  return (
    <div className="lobby">
      <div className="lobby-card">
        <h1>게임 선택</h1>
        <div className="lobby-divider" aria-hidden>
          <span className="orn-line" />
          <span className="orn-mark">✦</span>
          <span className="orn-line" />
        </div>
        <div className="subtitle">Choose a game</div>

        <div className="lobby-section first">
          <h3>잊혀진 왕국</h3>
          <p className="home-desc">2인 카드 게임 · 탐험 점수 겨루기 (AI 대전 지원)</p>
          <button className="primary block" onClick={onForgottenKingdom}>
            잊혀진 왕국 시작
          </button>
        </div>

        <div className="lobby-section">
          <h3>쿼리도</h3>
          <p className="home-desc">2인 추상 전략 · 벽으로 길을 막아 먼저 반대편 도달</p>
          <button className="primary block" onClick={onQuoridor}>
            Quoridor 시작
          </button>
        </div>
      </div>
    </div>
  );
}
