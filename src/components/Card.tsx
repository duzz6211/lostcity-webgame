import { cardInfo } from '../lib/types';
import { HandshakeIcon } from './icons';

interface Props {
  cardId: number;
  small?: boolean;
  selected?: boolean;
  clickable?: boolean;
  disabled?: boolean;
  animClass?: string;
  onClick?: () => void;
}

export default function Card({ cardId, small, selected, clickable, disabled, animClass, onClick }: Props) {
  const info = cardInfo(cardId);
  const cls = [
    'card',
    `card-${info.color}`,
    small ? 'small' : '',
    selected ? 'selected' : '',
    clickable ? 'clickable' : '',
    disabled ? 'disabled' : '',
    animClass ?? '',
    info.type === 'wager' ? 'is-wager' : '',
  ].filter(Boolean).join(' ');

  const isWager = info.type === 'wager';
  const cornerLabel = isWager ? '×2' : String(info.value);

  return (
    <div className={cls} onClick={disabled ? undefined : onClick}>
      <span className="corner tl">{cornerLabel}</span>
      <span className="corner tr">{cornerLabel}</span>
      <div className="art" aria-hidden />
      <div className="mid">
        {isWager ? (
          <span className="wager-icon">
            <HandshakeIcon size={small ? 24 : 32} strokeWidth={1.6} />
          </span>
        ) : (
          <span className="num">{info.value}</span>
        )}
      </div>
      <span className="corner bl">{cornerLabel}</span>
      <span className="corner br">{cornerLabel}</span>
    </div>
  );
}
