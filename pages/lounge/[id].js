import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Stage from '../../components/Stage';
import FontButton from '../../components/FontButton';
import { DoorIcon } from '../../components/Door';
import { getSongMeta } from '../../lib/client/song';
import { loadMeta } from '../../lib/client/cache';
import { memoSections } from '../../lib/client/english';
import MemoLine, { MemoLegend } from '../../components/MemoLine';

export default function Lounge() {
  const { query } = useRouter();
  const id = query.id;
  const [meta, setMeta] = useState(null);
  const [tab, setTab] = useState('memo');
  const [sec, setSec] = useState(0);
  const [more, setMore] = useState({ up: false, down: false });
  const body = useRef(null);
  useEffect(() => { if (id) { setMeta(loadMeta(id)); getSongMeta(id).then((m) => m && !m.locked && setMeta(m)); } }, [id]);

  const lines = meta?.lines || [];
  const memo = meta?.memo && meta.memo.length === lines.length ? meta.memo : null;
  const secs = useMemo(() => (memo ? memoSections(lines) : []), [meta]);
  const cur = secs[Math.min(sec, secs.length - 1)];

  // 長い歌詞は右端のボタンでスクロール
  const check = () => { const el = body.current; if (!el) return; setMore({ up: el.scrollTop > 4, down: el.scrollTop + el.clientHeight < el.scrollHeight - 4 }); };
  useEffect(() => { const el = body.current; if (el) el.scrollTop = 0; setTimeout(check, 50); }, [tab, sec, meta]);
  const scrollBy = (d) => { const el = body.current; if (el) el.scrollBy({ top: d * (el.clientHeight - 40), behavior: 'smooth' }); };

  return (
    <Stage bg="#15100c">
      <div style={{ position: 'absolute', inset: 0 }}>
        <div className="abs" style={{ left: 0, top: 0, width: 390, height: 70, background: '#1b1511' }} />
        <div className="abs wall-v" style={{ left: 0, top: 70, width: 390, height: 520 }} />
        <div className="abs beam" style={{ left: 40, top: 22 }} /><div className="abs beam" style={{ left: 240, top: 22 }} />
        <div className="abs dl" style={{ left: 91, top: 20 }} /><div className="abs dl" style={{ left: 291, top: 20 }} />

        <Link href={'/booth/' + id} className="abs door" style={{ left: 10, top: 10, background: 'rgba(0,0,0,.4)', borderColor: '#8a6a46', color: '#f4ece2' }}>
          <DoorIcon /><span className="dn"><span>BOOTH</span><span style={{ color: '#e7c79e' }}>歌いに戻る</span></span>
        </Link>
        <div className="abs" style={{ left: 145, top: 14, width: 100, textAlign: 'center' }}>
          <div className="u" style={{ fontSize: 8, letterSpacing: 3, color: '#c99a62' }}>LOUNGE</div>
          <div style={{ fontSize: 13 }}>控え室</div>
        </div>
        <FontButton className="abs" style={{ position: 'absolute', right: 10, top: 10 }} />

        <div className="abs board"><div className="board-in">
          <div className="tabs">
            <button className={'tab' + (tab === 'memo' ? ' on' : '')} onClick={() => setTab('memo')}>歌詞メモ</button>
            <button className={'tab' + (tab === 'jp' ? ' on' : '')} onClick={() => setTab('jp')}>和訳</button>
            <div className="board-title">{meta?.title}</div>
          </div>
          {tab === 'memo' && memo && secs.length > 0 && (
            <div className="memo-secs">
              {secs.map((x, k) => <button key={k} className={'msec' + (k === sec ? ' on' : '')} onClick={() => setSec(k)}>{x.label}</button>)}
            </div>
          )}
          <div className="board-wrap">
            <div className="board-body" ref={body} onScroll={check}>
              {tab === 'memo' && (memo && cur
                ? <div className="memo">{cur.idx.map((i) => <MemoLine key={i} tokens={memo[i].w} className="memo-line" />)}</div>
                : <div className="prep">この曲の歌詞メモは準備中です。</div>)}
              {tab === 'jp' && (meta?.jp ? <div className="hand-jp">{meta.jp}</div> : <div className="prep">この曲の和訳はありません。</div>)}
            </div>
            {(more.up || more.down) && (
              <div className="board-scroll">
                <button onClick={() => scrollBy(-1)} disabled={!more.up} aria-label="上へ">▲</button>
                <button onClick={() => scrollBy(1)} disabled={!more.down} aria-label="下へ">▼</button>
              </div>
            )}
          </div>
          {tab === 'memo' && memo && <MemoLegend className="memo-legend" />}
        </div></div>
        <div className="abs tray" />
        <div className="abs marker" style={{ left: 92, background: '#d0342c' }} /><div className="abs marker" style={{ left: 130, background: '#2d3a8c' }} /><div className="abs marker" style={{ left: 168, background: '#222' }} />

        <div className="abs" style={{ left: 0, top: 590, width: 390, height: 254, background: 'repeating-linear-gradient(90deg, rgba(0,0,0,.08) 0 2px, transparent 2px 64px), #3a2a20' }} />
        <svg className="abs" style={{ left: 330, top: 500, width: 46, height: 100 }} viewBox="0 0 46 100" aria-hidden="true">
          <path d="M6 60h34l-4 40H10z" fill="#c7b49a" /><ellipse cx="14" cy="34" rx="10" ry="30" fill="#4f7a4a" transform="rotate(-18 14 34)" /><ellipse cx="32" cy="36" rx="10" ry="28" fill="#3f6b3c" transform="rotate(16 32 36)" />
        </svg>
        <svg className="abs" style={{ left: 8, top: 556, width: 324, height: 112 }} viewBox="0 0 324 112" aria-hidden="true">
          <rect x="16" y="0" width="292" height="60" rx="22" fill="#5b4636" />
          <rect x="30" y="12" width="130" height="44" rx="14" fill="#6b5442" /><rect x="166" y="12" width="128" height="44" rx="14" fill="#6b5442" />
          <rect x="10" y="40" width="304" height="46" rx="14" fill="#6f5845" />
          <rect x="4" y="30" width="30" height="62" rx="14" fill="#5b4636" /><rect x="290" y="30" width="30" height="62" rx="14" fill="#5b4636" />
          <rect x="26" y="86" width="8" height="16" fill="#2a1e16" /><rect x="290" y="86" width="8" height="16" fill="#2a1e16" />
          <rect x="210" y="18" width="52" height="30" rx="12" fill="#b98a52" transform="rotate(-6 236 33)" />
        </svg>
        <svg className="abs" style={{ left: 58, top: 668, width: 250, height: 90 }} viewBox="0 0 250 90" aria-hidden="true">
          <rect x="0" y="24" width="250" height="22" rx="6" fill="#8a5530" /><rect x="20" y="46" width="10" height="42" fill="#5e3519" /><rect x="220" y="46" width="10" height="42" fill="#5e3519" />
          <path d="M38 4h24v14a8 8 0 0 1-8 8h-8a8 8 0 0 1-8-8z" fill="#f1ebe2" /><path d="M62 8h4a5 5 0 0 1 0 10h-4" stroke="#f1ebe2" strokeWidth="3" fill="none" />
          <rect x="122" y="10" width="86" height="12" rx="2" fill="#e8e0d0" transform="rotate(-3 165 16)" />
        </svg>
        <Link href={'/booth/' + id} className="abs back-btn"><DoorIcon />ブースへ戻って歌う</Link>
      </div>
    </Stage>
  );
}
