# 잊혀진 왕국 (Forgotten Kingdom) 웹 게임 룰북

> 라이너 크니지아(Reiner Knizia)의 2인용 카드 게임을 모티프로 한 웹 구현 사양서.
> 일반 룰북이 아니라 **개발자가 그대로 구현 가능한 수준**으로 기술합니다.

---

## 1. 게임 개요

- **플레이어 수**: 정확히 2명
- **목표**: 5개 색깔 탐험에 카드를 차례로 내려놓아 최종 점수를 최대화
- **승리 조건**: 게임 종료 시점에 총점이 더 높은 쪽
- **1게임 길이**: 보통 한 라운드 약 15~20턴 × 2. 원본은 3라운드 합산이지만 웹 구현에서는 1라운드/3라운드 모드를 선택지로 제공하는 것을 권장

---

## 2. 구성 요소

### 2.1 카드 (총 60장)

- 5색: `red`, `green`, `blue`, `yellow`, `white`
- 색깔당 12장:
  - **숫자 카드**: 2, 3, 4, 5, 6, 7, 8, 9, 10 (9장)
  - **베팅 카드 (Wager / Handshake)**: 3장 (숫자 없음, 점수 배수 역할)

### 2.2 게임 영역

| 영역 | 개수 | 설명 |
|---|---|---|
| Draw Pile (덱) | 1 | 초기 셔플 후 손에 분배되고 남은 카드 |
| Hand | 플레이어당 1 | 항상 8장을 유지 |
| Discard Pile | 5 (색깔별) | 색깔이 일치하는 카드만 쌓이며, 맨 위 카드만 노출 |
| Expedition Column | 플레이어 × 5 = 10 | 자기 탐험. 한 번 카드를 놓으면 회수 불가 |

---

## 3. 셋업

1. 60장을 셔플한다.
2. 각 플레이어에게 8장을 분배한다.
3. 나머지 44장은 Draw Pile로 둔다.
4. 선플레이어를 결정한다 (랜덤 또는 직전 라운드 패자 선공).

---

## 4. 턴 진행

한 턴은 **반드시 다음 2단계를 순서대로** 수행한다.

### Step 1 — Play 또는 Discard (택 1)

#### A. Play (탐험 진행)
손에서 카드 1장을 자신의 **같은 색** 탐험 칼럼에 놓는다. 단,

- **숫자 카드**: 해당 칼럼에 이미 놓인 마지막 **숫자 카드보다 strictly greater** 해야 한다. (예: 5 다음에 5는 불가, 6 이상만 가능)
- **베팅 카드**: 해당 칼럼에 **숫자 카드가 아직 한 장도 없을 때만** 놓을 수 있다. 같은 색 베팅 카드는 최대 3장까지 누적 가능.

#### B. Discard (버리기)
손에서 카드 1장을 **같은 색** 버림 더미 맨 위에 놓는다. (다른 색 버림 더미에는 절대 불가)

### Step 2 — Draw (드로우)

다음 중 정확히 하나를 수행한다.

- **Draw from Deck**: Draw Pile 맨 위에서 1장
- **Draw from Discard**: 비어있지 않은 임의의 버림 더미 맨 위 1장

> 제약: **같은 턴에 자신이 방금 Discard한 색의 버림 더미에서는 즉시 가져올 수 없다.** (의미 없는 무효 액션 방지)

드로우 후 손은 다시 8장이 된다.

---

## 5. 게임 종료

- **Draw Pile에서 마지막 카드가 뽑힌 그 턴이 끝나면 게임 종료.**
- 양쪽이 한 번 더 하는 일은 없다. 즉 deck.length === 0인 순간 그 턴이 마무리되면 채점.

---

## 6. 점수 계산

각 탐험 칼럼은 **독립적으로 채점**되고, 총점은 5색 점수의 합이다.

```
expedition_score(cards):
  if len(cards) == 0:
    return 0
  numbers_sum = sum(c.value for c in cards if c.is_number)
  wager_count = count(c for c in cards if c.is_wager)
  base = numbers_sum - 20            # 탐험 시작 비용
  score = base * (1 + wager_count)   # 베팅 카드는 배수
  if len(cards) >= 8:
    score += 20                       # 8장 이상이면 보너스 (배수 적용 후)
  return score
```

### 6.1 채점 예시

| 칼럼 내용 | 계산 | 점수 |
|---|---|---|
| (없음) | — | 0 |
| [2] | 2 − 20 | −18 |
| [2, 5, 7, 10] | (24 − 20) × 1 | 4 |
| [W, 2, 5] | (7 − 20) × 2 | −26 |
| [W, W, 4, 5, 6, 7, 8, 9] (8장) | (39 − 20) × 3 + 20 | **77** |
| [3, 4, 5, 6, 7, 8, 9, 10] (8장) | (52 − 20) × 1 + 20 | 52 |

> 시사점: 탐험은 **시작 자체가 −20 손해**이므로 시작했으면 최소 21점 이상을 모아야 본전. 베팅 카드는 큰 숫자 카드를 확보했을 때만 가치가 있다.

---

## 7. 개발자 구현 사양

### 7.1 데이터 모델 (TypeScript)

```typescript
type Color = 'red' | 'green' | 'blue' | 'yellow' | 'white';

type Card =
  | { id: string; color: Color; type: 'number'; value: 2|3|4|5|6|7|8|9|10 }
  | { id: string; color: Color; type: 'wager' };

type Expedition = Card[]; // 놓은 순서대로

interface PlayerState {
  id: 'p1' | 'p2';
  hand: Card[];                                 // 항상 0~8장 (턴 중간엔 7장)
  expeditions: Record<Color, Expedition>;
}

interface GameState {
  deck: Card[];                                 // 맨 뒤가 top
  players: Record<'p1' | 'p2', PlayerState>;
  discards: Record<Color, Card[]>;              // 색깔별 스택
  turn: 'p1' | 'p2';
  phase: 'play_or_discard' | 'draw';
  lastDiscardColor?: Color;                     // 같은 턴 회수 금지용
  ended: boolean;
}
```

### 7.2 액션 (Reducer Pattern)

```typescript
type Action =
  | { type: 'PLAY';          cardId: string }
  | { type: 'DISCARD';        cardId: string }
  | { type: 'DRAW_FROM_DECK' }
  | { type: 'DRAW_FROM_DISCARD'; color: Color };
```

### 7.3 검증 규칙

| 액션 | 사전 조건 |
|---|---|
| `PLAY` | `phase === 'play_or_discard'` / 카드가 현재 플레이어 손에 존재 / 베팅이면 같은 색 expedition에 number가 없음 / number이면 그 expedition의 마지막 number보다 strictly greater |
| `DISCARD` | `phase === 'play_or_discard'` / 카드가 손에 존재 |
| `DRAW_FROM_DECK` | `phase === 'draw'` / `deck.length > 0` |
| `DRAW_FROM_DISCARD` | `phase === 'draw'` / `discards[color].length > 0` / `color !== lastDiscardColor` |

> 검증 실패 시 상태 변경 없이 에러 반환. 클라이언트 측에서도 동일 로직으로 비활성 UI 처리 권장.

### 7.4 페이즈 전이

```
[play_or_discard] --PLAY/DISCARD--> [draw] --DRAW_*--> [play_or_discard, turn 전환]
                                          \
                                           \-- 이번 드로우로 deck이 비면 ended = true, 채점
```

### 7.5 점수 계산 함수

```typescript
function scoreExpedition(cards: Card[]): number {
  if (cards.length === 0) return 0;
  const numbersSum = cards
    .filter(c => c.type === 'number')
    .reduce((s, c) => s + (c as any).value, 0);
  const wagerCount = cards.filter(c => c.type === 'wager').length;
  let score = (numbersSum - 20) * (1 + wagerCount);
  if (cards.length >= 8) score += 20;
  return score;
}

function totalScore(player: PlayerState): number {
  return (Object.values(player.expeditions) as Expedition[])
    .reduce((sum, exp) => sum + scoreExpedition(exp), 0);
}
```

### 7.6 정보 은닉 (멀티플레이)

서버 권위적(authoritative) 구조 권장. 클라이언트로 내려보낼 때는 상대 정보를 마스킹한다.

```typescript
interface PublicGameState {
  myHand: Card[];                       // 본인 손은 전체 공개
  opponentHandCount: number;            // 상대 손은 개수만
  deckCount: number;                    // 덱은 개수만
  discards: Record<Color, Card[]>;      // 공개
  expeditions: {                        // 양쪽 모두 공개
    me: Record<Color, Expedition>;
    opponent: Record<Color, Expedition>;
  };
  turn: 'me' | 'opponent';
  phase: 'play_or_discard' | 'draw';
  lastDiscardColor?: Color;
}
```

### 7.7 셔플과 재현성

- 셔플은 반드시 **서버에서** 수행 (Fisher–Yates).
- 리플레이/디버깅을 위해 시드값과 액션 로그를 저장.
- 결정론적 reducer + 액션 로그만 있으면 어떤 시점도 재구성 가능.

---

## 8. UI/UX 권장 사항

| 요소 | 권장 처리 |
|---|---|
| 손패 정렬 | 색깔별 그룹 + 색 내부에서 베팅 → 숫자 오름차순 |
| 탐험 칼럼 | 카드 일부 겹쳐 쌓되 마지막 카드와 합계 강조 |
| 버림 더미 | 5색 위치 고정. 맨 위 카드만 보이게, 호버 시 전체 미리보기 |
| 액션 선택 | 카드 드래그 → 드롭 영역 하이라이트(자기 탐험, 같은 색 버림). 클릭으로도 가능하게 |
| 잘못된 액션 | UI 단계에서 드롭 비활성 + 미세 진동 피드백 |
| 덱 카드 수 | 항상 노출 (남은 턴 수 = 긴장감의 핵심) |
| 예상 점수 | 토글로 현재 상태 기준 양쪽 점수 미리보기 |
| 게임 종료 | 색깔별 점수 분해 애니메이션 + 합계 |

---

## 9. AI 상대 (옵션)

난이도별 구현 방향:

- **Easy**: 랜덤 합법 액션
- **Medium (Heuristic)**:
  - 손에서 같은 색 숫자 카드가 3장 이상 모일 때만 탐험 시작
  - 베팅 카드는 같은 색 7 이상 카드를 2장 이상 들고 있을 때만 플레이
  - Discard는 자기에게 필요 없고 상대 탐험 색깔도 아닌 것 우선
- **Hard**:
  - Expectimax (덱의 카드 확률 분포 추정) 또는 MCTS
  - 정보집합(information set) 기반 — 상대 손은 모르지만 가능한 분포로 샘플링
  - 1수~3수 앞을 시뮬레이션

---

## 10. 테스트 케이스 (필수)

```
[채점]
- score([]) === 0
- score([2]) === -18
- score([number(2..10) 합 24]) === 4
- score([W, 2, 5]) === -26
- score([W, W, 4..9] 총 8장) === 77
- score([3..10] 총 8장) === 52

[PLAY 검증]
- 빈 expedition에 number(2) 놓기 → OK
- [5] 위에 5 놓기 → 거절
- [5] 위에 6 놓기 → OK
- [5] 위에 wager 놓기 → 거절 (이미 number 있음)
- 빈 expedition에 wager 3장 → OK
- wager 3장 위에 wager 1장 → 거절 (3장 한계)

[DRAW 검증]
- deck 비어있을 때 DRAW_FROM_DECK → 거절
- 방금 red를 discard한 후 DRAW_FROM_DISCARD(red) → 거절
- 방금 red를 discard한 후 DRAW_FROM_DISCARD(blue) → OK

[종료]
- 마지막 드로우 후 ended === true
- 양쪽 점수 정상 계산
```

---

## 11. 구현 우선순위 (MVP → 확장)

1. **MVP**: 로컬 핫시트(같은 화면 2인) + 1라운드 + 기본 점수 계산
2. AI 상대 (Easy/Medium)
3. 온라인 멀티 (서버 권위 + WebSocket)
4. 3라운드 매치, 랭킹, 리플레이
5. AI Hard, 데일리 챌린지(시드 고정 동일 덱)

---

## 부록 — 자주 헷갈리는 점

- **8장 보너스는 베팅 카드 포함 장수 기준**이다. (즉 베팅 2장 + 숫자 6장 = 8장 → 보너스 발동)
- **8장 보너스는 배수 적용 후에 더해진다.** 베팅 카드로 보너스까지 배수가 곱해지지 않는다.
- **빈 탐험은 0점**이다. −20점이 아니다. 시작하지 않은 탐험은 손해가 아니다.
- **베팅 카드를 놓은 뒤 숫자 카드를 아예 안 놓아도 합법**이다. 다만 그 칼럼은 (0 − 20) × (1 + W) = 큰 마이너스가 된다.
- **드로우 시 임의의 버림 더미에서 가져올 수 있다.** 자기 색뿐만 아니라 상대 색도 가능.