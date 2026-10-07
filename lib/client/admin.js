import { adminFetch } from './firebaseClient';

export const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9\u3040-\u9fff]/g, '');

// ファイル名から「何のファイルか」と曲名を読み取る(分離ソフトの書き出し名に対応)
export function parseName(name) {
  let base = name.replace(/\.[^.]+$/, '');
  const isImg = /\.(jpe?g|png|webp)$/i.test(name);
  const isAud = /\.(mp3|m4a|wav|flac|ogg)$/i.test(name);
  base = base.replace(/^\d+_/, '');
  let kind = null;
  if (isImg) kind = 'jacket';
  else if (isAud) {
    if (/[_\s-]*\((no[ _-]?vocals?|instrumental|inst)\)$/i.test(base) || /_(instrumental|inst)$/i.test(base)) kind = 'track';
    else if (/[_\s-]*\(vocals?\)$/i.test(base) || /_vocals?$/i.test(base)) kind = 'vocal';
    base = base.replace(/[_\s-]*\((no[ _-]?vocals?|instrumental|inst|vocals?)\)$/i, '').replace(/_(instrumental|inst|vocals?)$/i, '');
  }
  return { kind, base: base.trim() };
}

export async function uploadTo(key, blob, type) {
  const { url } = await adminFetch('/api/admin/presign', { method: 'POST', body: JSON.stringify({ key, type }) });
  const r = await fetch(url, { method: 'PUT', body: blob, headers: { 'Content-Type': type } });
  if (!r.ok) throw new Error('アップロード失敗(R2のCORS設定を確認)');
}

// ジャケットをアプリ用に小さくする(600×600のJPEG)
export function resizeJacket(file, size = 600) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = c.height = size;
      const s = Math.min(img.width, img.height);
      c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      c.toBlob((b) => (b ? res(b) : rej(new Error('resize'))), 'image/jpeg', 0.86);
      URL.revokeObjectURL(img.src);
    };
    img.onerror = rej;
    img.src = URL.createObjectURL(file);
  });
}

export async function saveSong(data) {
  return adminFetch('/api/admin/song', { method: 'POST', body: JSON.stringify(data) });
}

export async function adminAudio(key) {
  const { url } = await adminFetch('/api/admin/url?key=' + encodeURIComponent(key));
  const buf = await (await fetch(url)).arrayBuffer();
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC();
  const audio = await ctx.decodeAudioData(buf);
  ctx.close();
  return audio;
}
