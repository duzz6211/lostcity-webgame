import {
  cardInfo,
  checkGoalAchieved,
  colorsFor,
  scoreExpedition,
  type Action,
  type Color,
  type GameState,
  type Role,
} from './types';

export type AiDifficulty = 'normal';

// Cards 0..71. id/12 = color index; id%12 < 3 = wager; else number value = (id%12) - 1.

export function isLegalPlay(cardId: number, expedition: number[]): boolean {
  const info = cardInfo(cardId);
  if (info.type === 'wager') {
    const hasNumber = expedition.some((id) => cardInfo(id).type === 'number');
    if (hasNumber) return false;
    const wagerCount = expedition.filter((id) => cardInfo(id).type === 'wager').length;
    if (wagerCount >= 3) return false;
    return true;
  }
  const numbers = expedition.filter((id) => cardInfo(id).type === 'number').map((id) => cardInfo(id).value!);
  const maxNum = numbers.length ? Math.max(...numbers) : 0;
  return info.value! > maxNum;
}

// Choose the next action for the AI given the AI-perspective state and hand.
export function chooseAction(state: GameState, hand: number[], aiRole: Role): Action {
  if (state.phase === 'play_or_discard') {
    return choosePlayOrDiscard(state, hand, aiRole);
  }
  return chooseDraw(state, hand, aiRole);
}

// ============================================================
// Play / discard
// ============================================================

function choosePlayOrDiscard(state: GameState, hand: number[], aiRole: Role): Action {
  let best: { action: Action; score: number } | null = null;

  for (const cardId of hand) {
    const info = cardInfo(cardId);
    const myExp = state.expeditions[aiRole][info.color] || [];

    if (isLegalPlay(cardId, myExp)) {
      const sc = evaluatePlay(cardId, state, hand, aiRole);
      if (best === null || sc > best.score) best = { action: { type: 'PLAY', cardId }, score: sc };
    }
    const sc = evaluateDiscard(cardId, state, hand, aiRole);
    if (best === null || sc > best.score) best = { action: { type: 'DISCARD', cardId }, score: sc };
  }

  return best!.action;
}

function evaluatePlay(cardId: number, state: GameState, hand: number[], aiRole: Role): number {
  const info = cardInfo(cardId);
  const color = info.color;
  const myExp = state.expeditions[aiRole][color] || [];
  const restSameColor = hand.filter((c) => c !== cardId && cardInfo(c).color === color);
  const numbersInRest = restSameColor.filter((c) => cardInfo(c).type === 'number');
  const wagersInRest = restSameColor.filter((c) => cardInfo(c).type === 'wager');

  const newExp = [...myExp, cardId];
  const oldScore = scoreExpedition(myExp);
  const newScore = scoreExpedition(newExp);
  let score = newScore - oldScore;

  // The -20 starting cost in newScore is heavily front-loaded. A round runs ~30+ turns
  // and a started color tends to keep accumulating same-color cards (both from hand and from deck draws).
  // Amortize that pessimism when opening a fresh expedition.
  const isFreshStart = myExp.length === 0;
  if (isFreshStart) {
    // Base optimism for the +20 we'll likely recoup over the round.
    score += 10;
    // Extra credit for backup in hand (cards we already know we can chain).
    score += numbersInRest.length * 2;
    score += wagersInRest.length * 3;
  }

  if (info.type === 'number') {
    // Future-value bonus: each higher same-color number in hand adds expected upside.
    const followUps = numbersInRest.filter((c) => cardInfo(c).value! > info.value!);
    const followUpSum = followUps.reduce((s, c) => s + cardInfo(c).value!, 0);
    score += followUps.length * 3 + followUpSum * 0.4;
    // Flexibility bonus for any remaining same-color cards.
    score += Math.min(numbersInRest.length - followUps.length, 2) * 0.5;
    // Starting an empty expedition with a low number with no follow-ups + no wagers in hand is a trap.
    if (isFreshStart && followUps.length === 0 && wagersInRest.length === 0) {
      score -= 10;
    }
  } else {
    // Wager card: payoff scales with future numbers. The wager itself eats -20 again per stack.
    const sumOfFuture = numbersInRest.reduce((s, c) => s + cardInfo(c).value!, 0);
    const wagersInExpAfter = newExp.filter((c) => cardInfo(c).type === 'wager').length;
    if (numbersInRest.length === 0 && wagersInRest.length === 0) {
      // No numbers coming — wager just multiplies the -20 starting cost. Very bad.
      score -= 18;
    } else {
      // Expected gain ~= (estimatedSum - 20) * (1 + wagersInExpAfter)
      const estSum = sumOfFuture * 0.7 + 12; // optimistic: deck draws will also feed this color
      const expected = (estSum - 20) * (1 + wagersInExpAfter);
      score += expected * 0.5;
    }
    if (wagersInExpAfter >= 3) score -= 4;
  }

  // Goal incentive (6-special rule only).
  if (state.ruleset === '6special' && state.goals && state.goals.length > 0) {
    const tempExp = { ...state.expeditions[aiRole], [color]: newExp };
    for (const goal of state.goals) {
      if (goal.claimed_by !== null) continue;
      if (checkGoalAchieved(goal.id, tempExp)) {
        score += goal.points * 0.8;
      } else if (isGoalNear(goal.id, tempExp)) {
        score += goal.points * 0.15;
      }
    }
  }

  return score;
}

function evaluateDiscard(cardId: number, state: GameState, hand: number[], aiRole: Role): number {
  const info = cardInfo(cardId);
  const color = info.color;
  const oppRole: Role = aiRole === 'p1' ? 'p2' : 'p1';
  const myExp = state.expeditions[aiRole][color] || [];
  const oppExp = state.expeditions[oppRole][color] || [];

  // Baseline cost: throwing away information / a card.
  let score = -1.5;

  // Discarding while you've started this color is wasteful.
  if (myExp.length > 0) {
    score -= 5;
    if (isLegalPlay(cardId, myExp)) score -= 4;
  } else {
    // Color not started: lonely / hopeless cards are good discard candidates.
    const sameInHand = hand.filter((c) => c !== cardId && cardInfo(c).color === color);
    if (sameInHand.length === 0) score += 2.5;
    else if (sameInHand.length === 1) score += 1;
  }

  // Don't feed the opponent: if they've started this color and this card slots in cleanly, penalize.
  if (oppExp.length > 0) {
    if (info.type === 'wager') {
      const oppHasNumber = oppExp.some((c) => cardInfo(c).type === 'number');
      if (!oppHasNumber && oppExp.filter((c) => cardInfo(c).type === 'wager').length < 3) {
        score -= 5;
      }
    } else {
      const oppNumbers = oppExp.filter((c) => cardInfo(c).type === 'number').map((c) => cardInfo(c).value!);
      const oppMax = oppNumbers.length ? Math.max(...oppNumbers) : 0;
      if (info.value! > oppMax) score -= 4;
    }
  }

  // Generally avoid burning high-value number cards.
  if (info.type === 'number') {
    if (info.value! >= 9) score -= 2;
    else if (info.value! >= 7) score -= 1;
  }
  // Burning a wager when you can't use it is fine.
  if (info.type === 'wager' && myExp.length === 0) score += 0.5;

  return score;
}

// ============================================================
// Draw
// ============================================================

function chooseDraw(state: GameState, hand: number[], aiRole: Role): Action {
  const colors = colorsFor(state.ruleset);
  // Baseline: drawing from deck has informational value but unknown content.
  const deckValue = 1.5;

  let best: { color: Color; value: number } | null = null;

  for (const color of colors) {
    if (color === state.last_discard_color) continue; // forbidden
    const pile = state.discards[color] || [];
    if (pile.length === 0) continue;
    const topId = pile[pile.length - 1];

    const v = valueOfPickingUp(topId, state, hand, aiRole);
    if (best === null || v > best.value) best = { color, value: v };
  }

  if (best && best.value > deckValue) {
    return { type: 'DRAW_FROM_DISCARD', color: best.color };
  }
  return { type: 'DRAW_FROM_DECK' };
}

function valueOfPickingUp(cardId: number, state: GameState, hand: number[], aiRole: Role): number {
  const info = cardInfo(cardId);
  const color = info.color;
  const myExp = state.expeditions[aiRole][color] || [];

  // Score this card as if it were added to the hand: compute its best-case "playValue next turn".
  const newHand = [...hand, cardId];
  let value: number;
  if (isLegalPlay(cardId, myExp)) {
    value = evaluatePlay(cardId, { ...state, my_hand: newHand }, newHand, aiRole);
  } else if (myExp.length > 0 && info.type === 'number') {
    // Number too small for my started exp — nearly useless to pick up.
    value = -2;
  } else {
    // Wager I can't play yet (already have numbers), or a color I'm not committed to.
    // Still mildly useful if I have a strong same-color stack in hand.
    const sameColorInHand = hand.filter((c) => cardInfo(c).color === color);
    value = sameColorInHand.length >= 2 ? 1 : -1;
  }

  // Defensive draw: if the opponent has started this color and is using high cards, pulling the
  // top discard denies them a future cheap draw. Tiny bonus.
  const oppRole: Role = aiRole === 'p1' ? 'p2' : 'p1';
  const oppExp = state.expeditions[oppRole][color] || [];
  if (oppExp.length > 0 && info.type === 'number' && (info.value ?? 0) >= 7) {
    value += 0.5;
  }

  return value;
}

// ============================================================
// Goal proximity helper (for tie-breaking)
// ============================================================

function isGoalNear(goalId: string, exp: Record<Color, number[]>): boolean {
  const colors = Object.keys(exp) as Color[];
  const totalCards = colors.reduce((s, c) => s + exp[c].length, 0);
  const startedColors = colors.filter((c) => exp[c].length > 0).length;
  const allColors = colors.length;
  const allWagers = colors.reduce(
    (s, c) => s + exp[c].filter((id) => cardInfo(id).type === 'wager').length,
    0,
  );
  const numberSum = (c: Color) =>
    exp[c].reduce((s, id) => {
      const info = cardInfo(id);
      return info.type === 'number' ? s + info.value! : s;
    }, 0);
  switch (goalId) {
    case 'first_color_3':
      return colors.some((c) => exp[c].length === 2);
    case 'first_total_5':
      return totalCards === 4;
    case 'first_2_colors':
      return startedColors === 1;
    case 'first_3_colors':
      return startedColors === 2;
    case 'first_4_colors':
      return startedColors === 3;
    case 'first_all_colors':
      return startedColors === allColors - 1;
    case 'first_color_5':
      return colors.some((c) => exp[c].length === 4);
    case 'first_color_score_20':
      return colors.some((c) => numberSum(c) >= 15 && numberSum(c) < 20);
    case 'first_color_score_50':
      return colors.some((c) => scoreExpedition(exp[c]) >= 30);
    case 'first_2_wagers':
      return allWagers === 1;
    case 'first_color_3_wagers':
      return colors.some((c) => exp[c].filter((id) => cardInfo(id).type === 'wager').length === 2);
    case 'first_yellow_3':
      return (exp.y?.length ?? 0) === 2;
    case 'first_purple_start':
      return (exp.p?.length ?? 0) === 0 && colors.includes('p' as Color);
    case 'first_consecutive_3': {
      // Near = expedition has 2+ numbers with values v, v+1 (waiting for v+2 etc.)
      for (const c of colors) {
        const vals = exp[c].map((id) => cardInfo(id)).filter((i) => i.type === 'number').map((i) => i.value!);
        const set = new Set(vals);
        for (const v of vals) if (set.has(v + 1)) return true;
      }
      return false;
    }
    case 'first_blue_plus_other_sum_10': {
      const blueSum = numberSum('b' as Color);
      const otherMax = Math.max(0, ...colors.filter((c) => c !== 'b').map((c) => numberSum(c)));
      return blueSum + otherMax >= 6 && blueSum + otherMax < 10;
    }
    default:
      // End-game goals don't have a sensible "near" heuristic from one side's exp alone.
      return false;
  }
}

// Suggested human-feeling delay before the AI moves.
export function aiThinkDelayMs(): number {
  return 800 + Math.random() * 1000;
}
