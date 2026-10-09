import { useEffect, useState } from 'react';

// 390×844の設計図を、どの画面サイズでも縦横比を保って表示する
export default function Stage({ bg = '#15100c', children }) {
  const [s, setS] = useState(1);
  useEffect(() => {
    const fit = () => setS(Math.min(window.innerWidth / 390, window.innerHeight / 844));
    fit(); window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return (
    <div className="stage-wrap" style={{ background: bg }}>
      <div className="stage" style={{ transform: `scale(${s})` }}>{children}<div className="copy">© ボーカル道場K's VOX</div></div>
    </div>
  );
}
