import { cachedBlob, saveMeta, loadMeta, dropSong } from './cache';
import { viewerHeaders } from './firebaseClient';

// 曲データを取得(オフライン時は前回の保存分)
export async function getSongMeta(id) {
  try {
    const r = await fetch('/api/song/' + id, { headers: await viewerHeaders() });
    if (r.status === 401) return { locked: true };
    if (!r.ok) throw new Error('net');
    const j = await r.json();
    const prev = loadMeta(id);
    if (prev && prev.version !== j.version) await dropSong(id);
    saveMeta(id, j);
    return j;
  } catch {
    return loadMeta(id);
  }
}

export async function getSongFiles(meta, onStep) {
  const key = (n) => `${meta.id}/${meta.version}/${n}`;
  onStep && onStep(0);
  const vocal = await cachedBlob(key('vocal'), async () => meta.vocal); onStep && onStep(1);
  const track = await cachedBlob(key('track'), async () => meta.track); onStep && onStep(2);
  const jacket = meta.jacket ? await cachedBlob(key('jacket'), async () => meta.jacket) : null; onStep && onStep(3);
  return { vocal, track, jacket };
}

export const fmt = (t) => { t = Math.max(0, t || 0); return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`; };

// 前回の曲(トップ画面のボタン用)
export function saveLast(meta) {
  try { localStorage.setItem('sf_last', JSON.stringify({ id: meta.id, title: meta.title })); } catch {}
}
export function loadLast() {
  try { return JSON.parse(localStorage.getItem('sf_last') || 'null'); } catch { return null; }
}
