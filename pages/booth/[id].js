import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Stage from '../../components/Stage';
import FontButton from '../../components/FontButton';
import { DoorIcon } from '../../components/Door';
import { ensurePass } from '../../lib/client/access';
import { getSongMeta, getSongFiles, fmt, saveLast } from '../../lib/client/song';
import { KaraokeEngine } from '../../lib/client/engine';
import { currentLine, sectionMarks } from '../../lib/client/lyrics';
import { chordAt, transpose } from '../../lib/client/chords';
import { jacketColors } from '../../lib/client/color';

const BT_DELAY = 0.3;

export default function Booth() {
  const { query } = useRouter();
  const id = query.id;
  const eng = useRef(null);
  const [meta, setMeta] = useState(null);
  const [status, setStatus] = useState({ step: 0, text: '曲を読み込んでいます…' });
  const [jk, setJk] = useState(null);
  const [col, setCol] = useState({ a: '#7a2f8f', b: '#1f6f8b', dark: '#0d0816' });
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [vocal, setVocal] = useState(0);
  const [track, setTrack] = useState(100);
  const [key, setKey] = useState(0);
  const [tempo, setTempo] = useState(100);
  const [open, setOpen] = useState(true);
  const [bt, setBt] = useState(false);
  const [soft, setSoft] = useState(true);
  const [ab, setAb] = useState({ a: null, b: null });
  const dragY = useRef(null); const dragged = useRef(false);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    (async () => {
      await ensurePass();
      const m = await getSongMeta(id);
      if (!alive) return;
      if (!m) { setStatus({ error: 'この曲を開けませんでした。ネットにつないでもう一度開いてください。' }); return; }
      if (m.locked) { setStatus({ error: '門弟アプリの「SingFlex」ボタンから開き直してください。' }); return; }
      setMeta(m);
      saveLast(m);
      try {
        const files = await getSongFiles(m, (step) => alive && setStatus({ step, text: ['ボーカルを読み込み中…', '伴奏を読み込み中…', 'ジャケットを読み込み中…', '準備しています…'][step] }));
        if (files.jacket) setJk(URL.createObjectURL(files.jacket));
        const e = new KaraokeEngine();
        await e.load(files.vocal, files.track);
        e.setVocal(0); e.setTrack(100);
        let sf = true; try { sf = localStorage.getItem('sf_soft') !== '0'; } catch {}
        e.setSoft(sf); setSoft(sf);
        e.onEnd = () => setPlaying(false);
        eng.current = e;
        if (alive) setStatus(null);
      } catch (err) {
        setStatus({ error: '音源を読み込めませんでした。電波の良い場所で開き直してください。' });
      }
    })();
    return () => { alive = false; eng.current && eng.current.destroy(); };
  }, [id]);

  useEffect(() => {
    let raf, last = 0;
    const loop = (now) => { if (now - last > 50 && eng.current) { setT(eng.current.time); last = now; } raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const E = eng.current;
  const lines = meta?.lines || [];
  const timed = lines.length && lines.every((l) => l.t != null);
  const dt = t - (bt ? BT_DELAY : 0);
  const cur = timed ? currentLine(lines, dt) : -1;
  const marks = useMemo(() => sectionMarks(lines), [meta]);
  const activeMark = marks.filter((m) => m.t <= dt + 0.05).pop();
  const ch = chordAt(meta?.chords || [], dt);
  const dur = E ? E.duration : 0;

  const seek = (s) => { if (!E) return; E.seek(s); setT(s); };
  const toggle = async () => { if (!E) return; if (playing) { E.pause(); setPlaying(false); } else { await E.play(); setPlaying(true); } };
  const cycleAB = () => {
    if (ab.a == null) setAb({ a: t, b: null });
    else if (ab.b == null && t > ab.a + 1) { setAb({ a: ab.a, b: t }); E && E.setLoop(ab.a, t); }
    else { setAb({ a: null, b: null }); E && E.setLoop(null, null); }
  };
  const chKey = (d) => { const k = Math.max(-6, Math.min(6, key + d)); setKey(k); E && E.setKey(k); };
  const chTempo = (d) => { const v = Math.max(70, Math.min(110, tempo + d)); setTempo(v); E && E.setTempo(v); };

  // 表示する歌詞(閉じると先まで見える)
  const span = open ? 3 : 10;
  const from = Math.max(0, cur - 1);
  const shown = timed ? lines.slice(from, from + span + 1).map((l, k) => ({ ...l, i: from + k })) : lines.map((l, i) => ({ ...l, i }));

  const pos = open ? { ly: 150, seek: 476, tr: 514, dr: 584 } : { ly: 360, seek: 690, tr: 726, dr: 800 };
  const onImg = (e) => setCol(jacketColors(e.currentTarget));

  return (
    <Stage bg={col.dark}>
      <div className="booth" style={{ position: 'absolute', inset: 0, '--dark': col.dark }}>
        <div className="abs orb" style={{ left: -120, top: -80, width: 520, height: 520, background: `radial-gradient(closest-side, ${col.a}, transparent)`, opacity: 0.55 }} />
        <div className="abs orb" style={{ left: 120, top: 380, width: 420, height: 420, background: `radial-gradient(closest-side, ${col.b}, transparent)`, opacity: 0.45 }} />
        <div className="abs grid-lines" />

        <div className="abs topbar">
          <Link className="door" href="/"><DoorIcon /><span className="dn"><span>CONTROL ROOM</span><span>曲を選ぶ</span></span></Link>
          <div className="nowin">NOW IN<b>BOOTH</b></div>
          <Link className="door" href={'/lounge/' + id}><span className="dn" style={{ textAlign: 'right' }}><span>LOUNGE</span><span>歌詞メモ・和訳</span></span><DoorIcon /></Link>
        </div>
        <FontButton className="abs" style={{ position: 'absolute', right: 14, top: 66 }} />

        <div className="abs cd" style={{ boxShadow: `0 0 40px ${col.a}` }}>
          <div className="cd-spin" style={{ animationDuration: (4 * 100 / tempo) + 's', animationPlayState: playing ? 'running' : 'paused' }}>
            <div className="cd-face">{jk && <img src={jk} alt="" onLoad={onImg} />}</div>
            <div className="cd-hub" /><div className="cd-hole" />
          </div>
        </div>

        <div className="abs info">
          <div className="title">{meta?.title}</div>
          {(meta?.chords || []).length > 0 && (<>
            <div className="lbl">CHORD <span style={{ fontFamily: 'Zen Kaku Gothic New', letterSpacing: 0 }}>(参考)</span></div>
            <div className="chord">{transpose(ch.now, key)}</div>
            <div className="chord-next">次 <b>{transpose(ch.next, key)}</b></div>
          </>)}
        </div>

        <div className="abs chips">
          {timed && <button className="chip go" onClick={() => seek(Math.max(0, lines[0].t - 2))}>歌い出しへ</button>}
          {marks.map((m) => <button key={m.i} className={'chip' + (activeMark && activeMark.i === m.i ? ' on' : '')} onClick={() => seek(Math.max(0, m.t - 0.3))}>{m.label}</button>)}
        </div>

        <div className="abs lyrics" style={{ height: pos.ly, overflowY: timed ? 'hidden' : 'auto' }}>
          {!lines.length && <div className="ly-empty">この曲の歌詞は準備中です。</div>}
          <div key={timed ? cur : 'all'} className={timed && cur >= 0 ? 'ly-roll' : ''} style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {shown.map((l) => (
            <div key={l.i} style={{ display: 'contents' }}>
              {l.start && l.sec && <div className="ly-sec">{l.sec.toUpperCase()}</div>}
              <button className={'ly' + (l.i === cur ? ' cur' : l.i < cur ? ' past' : '')} onClick={() => l.t != null && seek(l.t)}>{l.text}</button>
            </div>
          ))}
          </div>
        </div>

        <div className="abs seek" style={{ top: pos.seek }}>
          <div style={{ position: 'relative' }}>
            <input type="range" min="0" max={dur || 1} step="0.1" value={Math.min(t, dur || 1)} onChange={(e) => seek(Number(e.target.value))} aria-label="再生位置" />
            {ab.a != null && <i style={{ position: 'absolute', left: `${(ab.a / (dur || 1)) * 100}%`, top: 2, width: 2, height: 20, background: 'var(--teal)' }} />}
            {ab.b != null && <i style={{ position: 'absolute', left: `${(ab.b / (dur || 1)) * 100}%`, top: 2, width: 2, height: 20, background: 'var(--teal)' }} />}
          </div>
          <div className="seek-row"><span>{fmt(t)}</span><span>{ab.a != null ? `A ${fmt(ab.a)}${ab.b != null ? ' 〜 B ' + fmt(ab.b) : ' 〜 B?'}` : ''}</span><span>{fmt(dur)}</span></div>
        </div>

        <div className="abs trans" style={{ top: pos.tr }}>
          <button className={'tb' + (ab.a != null ? ' ab-on' : '')} onClick={cycleAB} aria-label="A-B区間の繰り返し">{ab.b != null ? 'A–B 解除' : ab.a != null ? 'Bを決める' : 'A–B'}</button>
          <button className="tb" onClick={() => seek(t - 5)} aria-label="5秒戻る"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M11 18l-6-6 6-6M19 18l-6-6 6-6" /></svg></button>
          <button className="play" onClick={toggle} aria-label={playing ? '一時停止' : '再生'} disabled={!E}>
            {playing ? <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
              : <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5l11 7-11 7z" /></svg>}
          </button>
          <button className="tb" onClick={() => seek(t + 5)} aria-label="5秒進む"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M13 6l6 6-6 6M5 6l6 6-6 6" /></svg></button>
          <button className="tb" onClick={() => seek(0)} aria-label="曲の頭へ"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 5v14M18 6l-9 6 9 6z" /></svg></button>
        </div>

        <div className="abs drawer" style={{ top: pos.dr }}>
          <button className="handle" aria-label="ミキサーを開け閉め"
            onPointerDown={(e) => { dragY.current = e.clientY; dragged.current = false; }}
            onPointerUp={(e) => { const d = e.clientY - (dragY.current ?? e.clientY); if (Math.abs(d) > 12) { dragged.current = true; setOpen(d < 0); } }}
            onClick={() => { if (dragged.current) { dragged.current = false; return; } setOpen(!open); }}>
            <i /><span>{open ? 'MIXER ▼' : 'MIXER ▲'}</span>
          </button>
          <div className="mix">
            <div className="mcol">
              <label className="ml" htmlFor="vo" style={{ color: '#ff8cc6' }}>VOCAL</label>
              <div className="vwrap"><input id="vo" type="range" min="0" max="100" value={vocal} onChange={(e) => { const v = Number(e.target.value); setVocal(v); E && E.setVocal(v); }} /></div>
              <div className="mv">{vocal}</div><div className="mj">ボーカル</div>
            </div>
            <div className="mcol">
              <label className="ml" htmlFor="tr" style={{ color: 'var(--teal)' }}>TRACK</label>
              <div className="vwrap"><input id="tr" type="range" min="0" max="100" value={track} style={{ accentColor: '#7ff5e3' }} onChange={(e) => { const v = Number(e.target.value); setTrack(v); E && E.setTrack(v); }} /></div>
              <div className="mv">{track}</div><div className="mj">伴奏</div>
            </div>
            <div className="mcol" style={{ justifyContent: 'space-between' }}>
              <div className="ml">KEY</div>
              <button className="tb" onClick={() => chKey(1)} aria-label="キーを上げる">＋</button>
              <div className="big">{key > 0 ? '+' + key : key}</div>
              <button className="tb" onClick={() => chKey(-1)} aria-label="キーを下げる">－</button>
            </div>
            <div className="mcol" style={{ justifyContent: 'space-between' }}>
              <div className="ml">TEMPO</div>
              <button className="tb" onClick={() => chTempo(5)} aria-label="テンポを上げる">＋</button>
              <div className="big">{tempo}%</div>
              <button className="tb" onClick={() => chTempo(-5)} aria-label="テンポを下げる">－</button>
            </div>
          </div>
          <div className="bt-row">
            <label className="bt"><span>Bluetooth使用中<br /><small style={{ color: '#c9a9e6' }}>歌詞を音に合わせる</small></span><input type="checkbox" checked={bt} onChange={(e) => setBt(e.target.checked)} /></label>
            <label className="bt"><span>高音やわらげ<br /><small style={{ color: '#c9a9e6' }}>伴奏のキンキンを抑える</small></span><input type="checkbox" checked={soft} onChange={(e) => { const v = e.target.checked; setSoft(v); E && E.setSoft(v); try { localStorage.setItem('sf_soft', v ? '1' : '0'); } catch {} }} /></label>
          </div>
        </div>

        {status && (
          <div className="abs loading">
            {status.error ? <><div>{status.error}</div><Link href="/" style={{ color: 'var(--amber)' }}>コントロールルームへ戻る</Link></>
              : <><div>{status.text}</div><div className="bar"><i style={{ width: ((status.step || 0) / 3) * 100 + '%' }} /></div><small style={{ color: '#c9a9e6' }}>2回目からは保存した音源ですぐに始まります</small></>}
          </div>
        )}
      </div>
    </Stage>
  );
}
