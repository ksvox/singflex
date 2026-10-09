import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Stage from '../components/Stage';
import FontButton from '../components/FontButton';
import Manual from '../components/Manual';
import { ensurePass } from '../lib/client/access';
import { authReady, viewerHeaders } from '../lib/client/firebaseClient';
import { loadLast } from '../lib/client/song';

const KNOB = ['#e2a040', '#d9d4cb', '#4fc3b8', '#d9d4cb', '#c75b4a', '#d9d4cb', '#d9d4cb'];
const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9\u3040-\u9fff]/g, '');

export default function Home() {
  const router = useRouter();
  const [songs, setSongs] = useState([]);
  const [access, setAccess] = useState('checking');
  const [q, setQ] = useState('');
  const [manual, setManual] = useState(false);
  const [fly, setFly] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [last, setLast] = useState(null);
  const stageRef = useRef(null);

  useEffect(() => {
    (async () => {
      const ok = await ensurePass();
      const admin = !!(await authReady());
      setIsAdmin(admin);
      if (ok === false && !admin) { setAccess('locked'); return; }
      let list = [];
      try {
        const r = await fetch('/api/songs', { headers: await viewerHeaders() });
        if (r.status === 401) { setAccess('locked'); return; }
        const j = await r.json();
        list = j.songs; setSongs(list); localStorage.setItem('sf_songs', JSON.stringify(list));
      } catch {
        list = JSON.parse(localStorage.getItem('sf_songs') || '[]'); setSongs(list);
      }
      const lp = loadLast();
      if (lp && list.some((x) => x.id === lp.id)) setLast(lp);
      setAccess('ok');
      if (!localStorage.getItem('sf_manual_seen')) { setManual(true); localStorage.setItem('sf_manual_seen', '1'); }
    })();
  }, []);

  const results = useMemo(() => {
    const n = norm(q);
    if (!n) return [];
    const starts = songs.filter((s) => norm(s.title).startsWith(n));
    const inc = songs.filter((s) => !norm(s.title).startsWith(n) && (norm(s.title).includes(n) || norm(s.ep).includes(n)));
    return [...starts, ...inc];
  }, [q, songs]);

  const pick = (s, e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const st = stageRef.current.getBoundingClientRect();
    const k = st.width / 390;
    setFly({ s, x: (r.left - st.left) / k, y: (r.top - st.top) / k, go: false });
    requestAnimationFrame(() => requestAnimationFrame(() => setFly((f) => f && { ...f, go: true })));
    setTimeout(() => router.push('/booth/' + s.id), 760);
  };

  const meters = Array.from({ length: 28 }, (_, i) => ({ c: i % 7 === 6 ? '#e2a040' : '#4fc3b8', d: (0.9 + (i % 5) * 0.23) + 's', l: -(i % 6) * 0.17 + 's' }));

  return (
    <>
    <Stage bg="#15100c">
      <div ref={stageRef} style={{ position: 'absolute', inset: 0 }}>
        <div className="abs ceiling" /><div className="abs ceiling-edge" />
        <div className="abs wall-h" />
        <div className="abs beam" style={{ left: 11, top: 34 }} /><div className="abs beam" style={{ left: 140, top: 26 }} /><div className="abs beam" style={{ left: 269, top: 34 }} />
        <div className="abs dl" style={{ left: 62, top: 30 }} /><div className="abs dl" style={{ left: 191, top: 22 }} /><div className="abs dl" style={{ left: 320, top: 30 }} />
        <div className="abs spk l"><i className="tw" /><i /><i /></div>
        <div className="abs spk r"><i className="tw" /><i /><i /></div>

        <div className="abs monitor"><div className="screen">
          {!q && (<>
            <div className="logo-k">K'S VOX RECORD</div>
            <div className="logo" style={{ marginTop: 6 }}>SingFlex</div>
            <div className="logo-sub">オリジナル曲 専用カラオケ</div>
            {last && access === 'ok' && (
              <button className="last-btn" onClick={() => router.push('/booth/' + last.id)}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4l13 8-13 8z" /></svg>
                前回の曲:<b>{last.title}</b>
              </button>
            )}
          </>)}
          {!!q && (
            <div className="sel">
              <div className="sel-h">SELECT SONG</div>
              {results.length === 0 && <div className="sel-more" style={{ marginTop: 30 }}>該当する曲がありません</div>}
              {results.slice(0, 1).map((s) => (
                <button key={s.id} className="hit" onClick={(e) => pick(s, e)}>
                  {s.jacket ? <img src={s.jacket} alt="" /> : <span className="nojk" />}
                  <span><span className="t">{s.title}</span>{s.ep && <div className="ep">{s.ep}</div>}{s.ready === false && <div className="ep" style={{ color: '#ffb38a' }}>非公開(管理者のみ表示)</div>}</span>
                </button>
              ))}
              {results.slice(1, 3).map((s) => (
                <button key={s.id} className="hit sm" onClick={(e) => pick(s, e)}><span className="t">{s.title}</span></button>
              ))}
              {results.length > 3 && <div className="sel-more">ほか {results.length - 3} 曲 ― 続けて入力すると絞り込めます</div>}
            </div>
          )}
        </div></div>

        <div className="abs booth-win"><div className="booth-glass">
          <div className="abs booth-glow" /><div className="abs mic" /><div className="abs glare" />
        </div></div>

        <div className="abs console" />
        <div className="abs knobs">{Array.from({ length: 42 }, (_, i) => <i key={i} style={{ background: KNOB[(i * 5 + Math.floor(i / 14)) % 7] }} />)}</div>
        <div className="abs meters">{meters.map((m, i) => <i key={i} style={{ background: m.c, animationDuration: m.d, animationDelay: m.l }} />)}</div>

        <div className="abs search">
          <label htmlFor="q">練習する曲名を入力</label>
          <div className="search-row">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8fd8cf" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
            <input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="曲名の最初の数文字" autoComplete="off" disabled={access !== 'ok'} />
            <button className="manual-btn" onClick={() => setManual(true)}>
              <svg width="14" height="16" viewBox="0 0 14 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M2 1.5h8.5a1.5 1.5 0 0 1 1.5 1.5v11H3.5A1.5 1.5 0 0 1 2 12.5z" /><path d="M2 12.5A1.5 1.5 0 0 1 3.5 11H12" /></svg>
              取扱説明書
            </button>
          </div>
        </div>

        <div className="abs faders">{Array.from({ length: 16 }, (_, i) => <i key={i}><b style={{ top: 6 + ((i * 7) % 26) }} /></i>)}</div>

        <svg className="abs chair" style={{ left: 40, top: 688, width: 310, height: 160 }} viewBox="0 0 310 160" aria-hidden="true">
          <ellipse cx="155" cy="120" rx="150" ry="60" fill="rgba(0,0,0,.5)" />
          <rect x="127" y="32" width="8" height="40" rx="3" fill="#4a4a50" /><rect x="175" y="32" width="8" height="40" rx="3" fill="#4a4a50" />
          <rect x="90" y="2" width="130" height="44" rx="22" fill="#202024" stroke="#55555c" strokeWidth="3" />
          <path d="M24 160V104a46 46 0 0 1 46-46h170a46 46 0 0 1 46 46v56z" fill="#1c1c20" stroke="#5a5a61" strokeWidth="5" />
          <defs><pattern id="mesh" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="#18181b" /><rect width="2" height="5" fill="#2c2c31" /></pattern></defs>
          <path d="M36 160V108a36 36 0 0 1 36-36h166a36 36 0 0 1 36 36v52z" fill="url(#mesh)" />
          <rect x="6" y="112" width="22" height="50" rx="10" fill="#2a2a2f" stroke="#4a4a50" strokeWidth="2" />
          <rect x="282" y="112" width="22" height="50" rx="10" fill="#2a2a2f" stroke="#4a4a50" strokeWidth="2" />
        </svg>
        <a className="abs showcase-tag" href="https://showcase.ksvox.net" target="_blank" rel="noreferrer"><span>K'S VOX RECORD</span><span>Showcase ↗</span></a>

        <FontButton className="abs" style={{ right: 12, top: 10, position: 'absolute' }} />
        {isAdmin && <div className="abs admin-mode">管理者として表示中</div>}

        {access === 'locked' && (
          <div className="abs lock">このアプリは門下生専用です。<br /><a href="https://montei.ksvox.net">門弟アプリ</a>の「SingFlex」ボタンから開いてください。</div>
        )}
        {access === 'checking' && <div className="abs lock">読み込み中…</div>}

        {fly && <div className="flash" style={{ opacity: fly.go ? 1 : 0 }} />}
        {fly && (
          <div className="flyer" style={fly.go ? { left: 75, top: 230, width: 240, height: 240, transform: 'rotate(200deg)' } : { left: fly.x, top: fly.y, width: 64, height: 64 }}>
            {fly.s.jacket ? <img src={fly.s.jacket} alt="" /> : <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: '#3b2a4a' }} />}
          </div>
        )}
      </div>
    </Stage>
    {manual && <Manual onClose={() => setManual(false)} />}
    </>
  );
}
