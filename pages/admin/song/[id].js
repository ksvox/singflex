import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import AdminGate from '../../../components/AdminGate';
import { adminFetch, adminHeaders } from '../../../lib/client/firebaseClient';
import { saveSong, uploadTo, resizeJacket, adminAudio } from '../../../lib/client/admin';
import { cleanLyrics, textToLines, linesToText, autoTiming } from '../../../lib/client/lyrics';
import { estimateChords } from '../../../lib/client/chords';
import { pdfText } from '../../../lib/client/pdf';
import { fmt } from '../../../lib/client/song';

function Editor({ id }) {
  const [s, setS] = useState(null);
  const [text, setText] = useState('');
  const [jp, setJp] = useState('');
  const [lines, setLines] = useState([]);
  const [chordTxt, setChordTxt] = useState('');
  const [msg, setMsg] = useState('');
  const [aud, setAud] = useState(null);
  const [t, setT] = useState(0);
  const [tapIdx, setTapIdx] = useState(0);
  const player = useRef(null);

  const load = async () => {
    const d = await adminFetch('/api/admin/song?id=' + id);
    setS(d); setLines(d.lines || []); setText(linesToText(d.lines || [])); setJp(d.jp || '');
    setChordTxt((d.chords || []).map((c) => `${c.t} ${c.c}`).join('\n'));
  };
  useEffect(() => { load(); return () => stop(); }, [id]);

  const save = async (data, note = '保存しました') => { await saveSong({ id, ...data }); setMsg(note); load(); };

  // ---- 簡易プレーヤー(タイミング付け用)----
  const startAt = (off) => {
    stop();
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const srcs = [aud.vocal, aud.track].map((b) => { const n = ctx.createBufferSource(); n.buffer = b; n.connect(ctx.destination); n.start(0, Math.max(0, off)); return n; });
    const t0 = ctx.currentTime - off;
    const timer = setInterval(() => setT(ctx.currentTime - t0), 50);
    player.current = { ctx, srcs, timer, now: () => ctx.currentTime - t0 };
  };
  function stop() { const p = player.current; if (p) { clearInterval(p.timer); p.srcs.forEach((n) => { try { n.stop(); } catch {} }); p.ctx.close(); player.current = null; } }
  const loadAudio = async () => {
    setMsg('音源を読み込み中…');
    const [vocal, track] = await Promise.all([adminAudio(s.vocalKey), adminAudio(s.trackKey)]);
    setAud({ vocal, track }); setMsg('音源を読み込みました');
  };
  const tap = () => {
    if (!player.current) return;
    const now = Math.round(player.current.now() * 10) / 10;
    setLines((ls) => ls.map((l, i) => (i === tapIdx ? { ...l, t: now } : l)));
    setTapIdx((i) => Math.min(i + 1, lines.length - 1));
  };
  const nudge = (i, d) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, t: Math.max(0, Math.round(((l.t || 0) + d) * 10) / 10) } : l)));
  const setTime = (i, v) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, t: v === '' ? null : Number(v) } : l)));

  if (!s) return <p>読み込み中…</p>;
  const can = s.vocalKey && s.trackKey;
  return (
    <>
      <p><Link href="/admin">← 曲の一覧</Link></p>
      <h1>{s.title}</h1>
      {msg && <div className="msg">{msg}</div>}

      <h2>基本情報</h2>
      <div className="card">
        <label>曲名<input type="text" defaultValue={s.title} id="f-title" /></label>
        <label style={{ display: 'block', marginTop: 8 }}>EP名(EP収録曲のみ)<input type="text" defaultValue={s.ep || ''} id="f-ep" /></label>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn" onClick={() => save({ title: document.getElementById('f-title').value.trim(), ep: document.getElementById('f-ep').value.trim() })}>保存</button>
          <label className="row" style={{ marginLeft: 'auto' }}><input type="checkbox" checked={!!s.ready} onChange={(e) => save({ ready: e.target.checked }, e.target.checked ? '公開しました(生徒の一覧に出ます)' : '非公開にしました')} />生徒に公開する</label>
        </div>
      </div>

      <h2>音源・ジャケット(差し替え)</h2>
      <div className="card">
        {[['vocal', 'ボーカル(MP3)', 'audio/*'], ['track', '伴奏(MP3)', 'audio/*'], ['jacket', 'ジャケット', 'image/*']].map(([k, label, acc]) => (
          <div key={k} className="row" style={{ marginBottom: 8 }}>
            <span style={{ width: 120 }}>{label} {s[k + 'Key'] ? <span className="ok">✓</span> : <span className="ng">未登録</span>}</span>
            <input type="file" accept={acc} onChange={async (e) => {
              const f = e.target.files[0]; if (!f) return;
              setMsg('アップロード中…');
              const key = `songs/${id}/${k}.${k === 'jacket' ? 'jpg' : 'mp3'}`;
              const blob = k === 'jacket' ? await resizeJacket(f) : f;
              await uploadTo(key, blob, k === 'jacket' ? 'image/jpeg' : 'audio/mpeg');
              save({ [k + 'Key']: key }, 'アップロードしました');
            }} />
          </div>
        ))}
      </div>

      <h2>歌詞と和訳</h2>
      <div className="card">
        <div className="row" style={{ marginBottom: 8 }}>
          <button className="btn pri" onClick={async () => {
            setMsg('門弟アプリの歌詞PDFを読み込み中…');
            try {
              const r = await fetch('/api/admin/pdf?id=' + id, { headers: await adminHeaders() });
              if (!r.ok) { setMsg('この曲の歌詞PDFは門弟アプリに登録されていません。下からPDFファイルを選んでください。'); return; }
              const raw = await pdfText(await r.blob());
              const c = cleanLyrics(raw, s.title); setText(c.text); setJp(c.jp);
              setMsg('読み込みました。折り返し・繰り返し・和訳の分かれ方を確認して「歌詞を保存」を押してください。');
            } catch (e) { setMsg('読み込めませんでした: ' + e.message); }
          }}>門弟アプリの歌詞PDFから読み込む</button>
        </div>
        <div className="row"><span>PDFファイルを選んで読み込む:</span>
          <input type="file" accept="application/pdf" onChange={async (e) => {
            const f = e.target.files[0]; if (!f) return;
            const raw = await pdfText(f);
            const r = cleanLyrics(raw, s.title);
            setText(r.text); setJp(r.jp);
            setMsg('PDFから読み込みました。折り返し・繰り返し・和訳の分かれ方を確認して「歌詞を保存」を押してください。');
          }} />
        </div>
        <p style={{ fontSize: 12, color: '#7a6a54' }}>[Verse 1] のような見出しの次の行から、その区間の歌詞です。1行=カラオケの1行になります。</p>
        <textarea value={text} onChange={(e) => setText(e.target.value)} />
        <p style={{ marginBottom: 4 }}>和訳(ワンコーラス分・控え室に表示)</p>
        <textarea value={jp} onChange={(e) => setJp(e.target.value)} style={{ minHeight: 140, fontFamily: 'inherit' }} />
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn pri" onClick={() => { const nl = textToLines(text, s.lines || []); save({ lines: nl, jp, timed: nl.every((l) => l.t != null) }, '歌詞を保存しました'); }}>歌詞を保存</button>
        </div>
      </div>

      <h2>歌詞のタイミング</h2>
      <div className="card">
        {!can && <p>先にボーカルと伴奏を登録してください。</p>}
        {can && !aud && <button className="btn" onClick={loadAudio}>音源を読み込む</button>}
        {aud && (<>
          <div className="row">
            <button className="btn" onClick={() => { const ts = autoTiming(aud.vocal, lines.length); setLines((ls) => ls.map((l, i) => ({ ...l, t: ts[i] }))); setMsg('自動で推定しました。再生して確認・微調整してください。'); }}>自動で推定</button>
            <button className="btn" onClick={() => startAt(0)}>最初から再生</button>
            <button className="btn" onClick={stop}>停止</button>
            <span className="mono">{fmt(t)}</span>
          </div>
          <p style={{ fontSize: 12, color: '#7a6a54' }}>タップ記録: 再生しながら、各行の歌い出しで下の大きなボタンを押すと、順番に時間が入ります(今は{tapIdx + 1}行目)。</p>
          {lines.map((l, i) => (
            <div key={i} className={'tl' + (player.current && l.t != null && l.t <= t && (lines[i + 1]?.t ?? 1e9) > t ? ' now' : '')}>
              <input type="number" step="0.1" value={l.t ?? ''} onChange={(e) => setTime(i, e.target.value)} />
              <span>{l.start && l.sec ? <b style={{ color: '#7a3d21' }}>[{l.sec}] </b> : null}{l.text}</span>
              <span className="row" style={{ gap: 4 }}>
                <button className="btn" style={{ minHeight: 34, padding: '0 8px' }} onClick={() => nudge(i, -0.1)}>-0.1</button>
                <button className="btn" style={{ minHeight: 34, padding: '0 8px' }} onClick={() => nudge(i, 0.1)}>+0.1</button>
                <button className="btn" style={{ minHeight: 34, padding: '0 8px' }} onClick={() => startAt((l.t || 0) - 1.5)}>▶</button>
                <button className="btn" style={{ minHeight: 34, padding: '0 8px' }} onClick={() => setTapIdx(i)}>ここから記録</button>
              </span>
            </div>
          ))}
          <div className="sticky">
            <button className="btn pri tap" onClick={tap}>この行の歌い出し!({tapIdx + 1}行目)</button>
            <div className="row" style={{ marginTop: 8 }}><button className="btn pri" onClick={() => save({ lines, timed: lines.every((l) => l.t != null) }, 'タイミングを保存しました')}>タイミングを保存</button></div>
          </div>
        </>)}
      </div>

      <h2>コード(参考表示)</h2>
      <div className="card">
        {aud ? <button className="btn" onClick={async () => { setMsg('コードを推定中…(1〜2分かかります)'); const cs = await estimateChords(aud.track, (p) => setMsg(`コードを推定中… ${Math.round(p * 100)}%`)); setChordTxt(cs.map((c) => `${c.t} ${c.c}`).join('\n')); setMsg('推定しました。おかしな所は直して保存してください(秒数 コード名)。'); }}>伴奏からコードを推定</button>
          : <p>上の「音源を読み込む」の後に推定できます。</p>}
        <textarea value={chordTxt} onChange={(e) => setChordTxt(e.target.value)} style={{ minHeight: 160, marginTop: 8 }} placeholder={'12.4 Am\n14.2 F'} />
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn pri" onClick={() => {
            const cs = chordTxt.split('\n').map((r) => r.trim().split(/\s+/)).filter((p) => p.length >= 2 && !isNaN(Number(p[0]))).map((p) => ({ t: Number(p[0]), c: p[1] })).sort((a, b) => a.t - b.t);
            save({ chords: cs }, 'コードを保存しました');
          }}>コードを保存</button>
        </div>
      </div>

      <h2>リリックビデオ</h2>
      <div className="card"><Link className="btn pri" href={'/admin/video/' + id}>リリックビデオを作る</Link></div>
    </>
  );
}

export default function Page() { const { query } = useRouter(); return <AdminGate>{query.id ? <Editor id={query.id} /> : null}</AdminGate>; }
