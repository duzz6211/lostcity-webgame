import { cardInfo } from '../lib/types';

interface Props {
  cardId: number;
  small?: boolean;
  selected?: boolean;
  clickable?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

export default function Card({ cardId, small, selected, clickable, disabled, onClick }: Props) {
  const info = cardInfo(cardId);
  const cls = [
    'card',
    `card-${info.color}`,
    small ? 'small' : '',
    selected ? 'selected' : '',
    clickable ? 'clickable' : '',
    disabled ? 'disabled' : '',
  ].filter(Boolean).join(' ');

  const label = info.type === 'wager' ? '🤝' : String(info.value);
  const cornerLabel = info.type === 'wager' ? 'W' : String(info.value);

  return (
    <div className={cls} onClick={disabled ? undefined : onClick}>
      <div className="top"><span>{cornerLabel}</span><span>{cornerLabel}</span></div>
      <div className="mid">{info.type === 'wager' ? <span className="wager-badge">{label}</span> : label}</div>
    </div>
  );
}
