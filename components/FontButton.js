import { useEffect, useState } from 'react';
import { applyScale, currentScale, scaleName } from '../lib/client/fontScale';

export default function FontButton({ className = '', style }) {
  const [i, setI] = useState(0);
  useEffect(() => setI(currentScale()), []);
  const next = () => { const n = (i + 1) % 3; setI(n); applyScale(n); };
  return (
    <button className={'fontbtn ' + className} style={style} onClick={next} aria-label={`文字サイズ(今は${scaleName(i)})`}>
      拡大 <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5M11 8v6M8 11h6" /></svg>
      <span className="fontlv">{scaleName(i)}</span>
    </button>
  );
}
