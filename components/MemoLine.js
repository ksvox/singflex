import { lineChars, charStyle, groupChars, LEGEND } from '../lib/client/english';

// 歌詞メモの1行(生徒画面はまとめて描き、管理画面は文字ごとに押せるようにする)
export default function MemoLine({ tokens, onPick, className = '' }) {
  const chars = lineChars(tokens);
  if (onPick) {
    return (
      <div className={className}>
        {chars.map((o, x) => (
          <span key={x} style={{ ...charStyle(o), cursor: 'pointer' }} onClick={() => onPick(o.k, o.c)}>{o.ch}</span>
        ))}
      </div>
    );
  }
  return <div className={className}>{groupChars(chars).map((g, x) => <span key={x} style={charStyle(g.o)}>{g.text}</span>)}</div>;
}

export function MemoLegend({ className = '' }) {
  return (
    <div className={className}>
      {LEGEND.map((l) => (
        <span key={l.label} className="lg-item"><span style={charStyle(l.o)}>{l.sample}</span>{l.label}</span>
      ))}
    </div>
  );
}
