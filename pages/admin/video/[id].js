import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import AdminGate from '../../../components/AdminGate';
import { adminFetch } from '../../../lib/client/firebaseClient';
import { adminAudio } from '../../../lib/client/admin';
import { currentLine } from '../../../lib/client/lyrics';

const W = 1080, H = 1920;
const TAG = "K's VOX RECORD Pickup Song ♬";
const LINK = 'https://showcase.ksvox.net';

function pickMime() {
  const c = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'];
  return c.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
}

// 1コマを描く
function draw(ctx, { img, blur, lines, t, rot, title }) {
  ctx.fillStyle = '#0d0816'; ctx.fillRect(0, 0, W, H);
  if (blur) { ctx.globalAlpha = 0.85; ctx.drawImage(blur, -200, -200, W + 400, H + 400); ctx.globalAlpha = 1; }
  ctx.fillStyle = 'rgba(8,5,14,.45)'; ctx.fillRect(0, 0, W, H);
  // 上部タグ
  ctx.textAlign = 'center';
  ctx.font = '500 40px Unbounded, sans-serif'; ctx.fillStyle = '#ffd9a8';
  ctx.fillText(TAG, W / 2, 170);
  // タイトル
  ctx.font = '700 54px Unbounded, sans-serif'; ctx.fillStyle = '#fff';
  wrap(ctx, title, W / 2, 270, 940, 66);
  // CD
  const cx = W / 2, cy = 760, R = 360;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
  const g = ctx.createConicGradient ? ctx.createConicGradient(0, 0, 0) : null;
  if (g) { ['#c7d2ff', '#ffc7ec', '#c7fff1', '#fff2c2', '#d9c7ff', '#c7d2ff'].forEach((c, i) => g.addColorStop(i / 5, c)); ctx.fillStyle = g; } else ctx.fillStyle = '#ddd';
  ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(0, 0, R - 16, 0, Math.PI * 2); ctx.clip();
  if (img) ctx.drawImage(img, -(R - 16), -(R - 16), (R - 16) * 2, (R - 16) * 2);
  ctx.restore();
  ctx.fillStyle = 'rgba(220,220,235,.55)'; ctx.beginPath(); ctx.arc(0, 0, 96, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#0d0816'; ctx.beginPath(); ctx.arc(0, 0, 40, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  const sh = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
  sh.addColorStop(0.35, 'rgba(255,255,255,0)'); sh.addColorStop(0.45, 'rgba(255,255,255,.22)'); sh.addColorStop(0.55, 'rgba(255,255,255,0)');
  ctx.fillStyle = sh; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
  // 歌詞(カラオケ型)
  const cur = currentLine(lines, t);
  const show = [cur - 1, cur, cur + 1, cur + 2];
  let y = 1300;
  show.forEach((i) => {
    const l = lines[i]; if (!l) { y += 110; return; }
    if (i === cur) {
      ctx.font = '500 52px Unbounded, sans-serif';
      const p = Math.max(0, Math.min(1, (t - l.t) / Math.max(0.5, (lines[i + 1]?.t ?? l.t + 4) - l.t)));
      const lw = Math.min(ctx.measureText(l.text).width, 980);
      ctx.fillStyle = 'rgba(245,238,252,.45)'; ctx.fillText(l.text, W / 2, y, 980);
      ctx.save(); ctx.beginPath(); ctx.rect(W / 2 - lw / 2, y - 70, lw * p, 100); ctx.clip();
      ctx.fillStyle = '#ff8cc6'; ctx.shadowColor = 'rgba(255,111,181,.7)'; ctx.shadowBlur = 24; ctx.fillText(l.text, W / 2, y, 980);
      ctx.restore();
      y += 120;
    } else {
      ctx.font = '400 40px "Zen Kaku Gothic New", sans-serif';
      ctx.fillStyle = i < cur ? 'rgba(245,238,252,.3)' : 'rgba(245,238,252,.62)';
      ctx.fillText(l.text, W / 2, y, 980); y += 96;
    }
  });
  // 下部リンク
  ctx.font = '500 38px Unbounded, sans-serif'; ctx.fillStyle = '#7ff5e3';
  ctx.fillText(LINK, W / 2, H - 170);
  ctx.font = '400 30px "Zen Kaku Gothic New", sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.7)';
  ctx.fillText('全曲はShowcaseで', W / 2, H - 120);
}
function wrap(ctx, text, x, y, max, lh) {
  const words = (text || '').split(' '); let line = ''; const rows = [];
  words.forEach((w) => { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > max && line) { rows.push(line); line = w; } else line = t; });
  rows.push(line); rows.slice(0, 2).forEach((r, i) => ctx.fillText(r, x, y + i * lh));
}

function Maker({ id }) {
  const [s, setS] = useState(null);
  const [title, setTitle] = useState('');
  const [start, setStart] = useState(0);
  const [len, setLen] = useState(20);
  const [msg, setMsg] = useState('');
  const [out, setOut] = useState(null);
  const cv = useRef(null); const res = useRef({});

  useEffect(() => {
    (async () => {
      const d = await adminFetch('/api/admin/song?id=' + id);
      setS(d); setTitle(d.ep ? `${d.title}(${d.ep})` : d.title);
      const ch = (d.lines || []).find((l) => l.start && /chorus/i.test(l.sec || '') && l.t != null);
      setStart(ch ? Math.max(0, Math.round((ch.t - 1) * 10) / 10) : 0);
      if (d.jacketKey) {
        const { url } = await adminFetch('/api/admin/url?key=' + encodeURIComponent(d.jacketKey));
        const blob = await (await fetch(url)).blob();
        const img = new Image(); img.src = URL.createObjectURL(blob); await img.decode();
        const b = document.createElement('canvas'); b.width = 18; b.height = 32;
        b.getContext('2d').drawImage(img, 0, 0, 18, 32);
        res.current.img = img; res.current.blur = b;
      }
      await document.fonts.ready;
      setMsg('');
    })();
  }, [id]);

  useEffect(() => {
    if (!s || !cv.current) return;
    draw(cv.current.getContext('2d'), { ...res.current, lines: s.lines || [], t: start + 2, rot: 0, title });
  }, [s, start, title]);

  const make = async () => {
    setOut(null); setMsg('音源を読み込み中…');
    if (!res.current.vocal) [res.current.vocal, res.current.track] = await Promise.all([adminAudio(s.vocalKey), adminAudio(s.trackKey)]);
    const mime = pickMime();
    if (!mime) { setMsg('このブラウザは動画の書き出しに対応していません(ChromeかSafariで開いてください)'); return; }
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const dest = ctx.createMediaStreamDestination();
    const gain = ctx.createGain(); gain.connect(dest);
    // 最初と最後を0.6秒でフェード
    gain.gain.setValueAtTime(0, ctx.currentTime + 0.05); gain.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.65);
    gain.gain.setValueAtTime(1, ctx.currentTime + len - 0.6); gain.gain.linearRampToValueAtTime(0, ctx.currentTime + len);
    const srcs = [res.current.vocal, res.current.track].map((b) => { const n = ctx.createBufferSource(); n.buffer = b; n.connect(gain); return n; });
    const stream = new MediaStream([...cv.current.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
    const chunks = []; rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise((r) => (rec.onstop = r));
    const c2d = cv.current.getContext('2d');
    const t0 = ctx.currentTime + 0.05;
    srcs.forEach((n) => n.start(t0, start));
    rec.start(200);
    setMsg(`録画中…(${len}秒)そのままお待ちください`);
    await new Promise((resolve) => {
      const tick = () => {
        const el = ctx.currentTime - t0;
        draw(c2d, { ...res.current, lines: s.lines || [], t: start + Math.max(0, el), rot: el * 0.9, title });
        if (el < len) requestAnimationFrame(tick); else resolve();
      };
      requestAnimationFrame(tick);
    });
    rec.stop(); srcs.forEach((n) => { try { n.stop(); } catch {} });
    await done; ctx.close();
    const ext = mime.includes('mp4') ? 'mp4' : 'webm';
    const blob = new Blob(chunks, { type: mime.split(';')[0] });
    const name = `${(s.title || 'song').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_')}_pickup.${ext}`;
    setOut({ url: URL.createObjectURL(blob), file: new File([blob], name, { type: blob.type }), name });
    setMsg(ext === 'webm' ? 'できました。※このブラウザではwebm形式です。Instagramに上げる場合はiPhoneのSafariかChrome最新版で作るとMP4になります。' : 'できました!');
  };

  const share = async () => {
    try {
      if (navigator.canShare && navigator.canShare({ files: [out.file] })) await navigator.share({ files: [out.file], title: title });
      else setMsg('この端末では共有ボタンが使えません。「保存」してからTikTok/Instagramで選んでください。');
    } catch {}
  };

  if (!s) return <p>読み込み中…</p>;
  return (
    <>
      <p><Link href={'/admin/song/' + id}>← 曲の編集へ</Link></p>
      <h1>リリックビデオメーカー</h1>
      <p>9:16(TikTok・Instagram用)。上部タグ「{TAG}」と下部リンク「{LINK}」は固定です。</p>
      {msg && <div className="msg">{msg}</div>}
      {!s.timed && <div className="msg">この曲は歌詞のタイミングが未設定です。先にタイミングを付けてください。</div>}
      <div className="card" style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <canvas ref={cv} width={W} height={H} className="vid-prev" />
        <div style={{ flex: 1, minWidth: 240 }}>
          <label>タイトル(曲タイトル(EPタイトル))<input type="text" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
          <label style={{ display: 'block', marginTop: 10 }}>開始位置(秒)<input type="number" step="0.5" value={start} onChange={(e) => setStart(Number(e.target.value))} /></label>
          <div className="row" style={{ marginTop: 6 }}>
            {(s.lines || []).filter((l) => l.start && l.t != null).map((l, i) => <button key={i} className="btn" style={{ minHeight: 34 }} onClick={() => setStart(Math.max(0, Math.round((l.t - 1) * 10) / 10))}>{l.sec}</button>)}
          </div>
          <label style={{ display: 'block', marginTop: 10 }}>長さ
            <select value={len} onChange={(e) => setLen(Number(e.target.value))}><option value={15}>15秒</option><option value={20}>20秒</option><option value={30}>30秒</option></select>
          </label>
          <div className="row" style={{ marginTop: 14 }}><button className="btn pri" onClick={make}>動画を作る</button></div>
          {out && (
            <div style={{ marginTop: 14 }}>
              <video src={out.url} controls playsInline style={{ width: 200, borderRadius: 10 }} />
              <div className="row" style={{ marginTop: 8 }}>
                <a className="btn" href={out.url} download={out.name}>保存</a>
                <button className="btn pri" onClick={share}>TikTok・Instagramへ共有</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default function Page() { const { query } = useRouter(); return <AdminGate>{query.id ? <Maker id={query.id} /> : null}</AdminGate>; }
