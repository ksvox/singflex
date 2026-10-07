// 一度開いた曲を端末に保存し、電波が弱くても再生できるようにする
const CACHE = 'singflex-v1';

export async function cachedBlob(key, getUrl) {
  const req = new Request('/__sf/' + key);
  try {
    const c = await caches.open(CACHE);
    const hit = await c.match(req);
    if (hit) return hit.blob();
    const url = await getUrl();
    const r = await fetch(url);
    if (!r.ok) throw new Error('download');
    const blob = await r.blob();
    await c.put(req, new Response(blob));
    return blob;
  } catch (e) {
    const url = await getUrl();
    return (await fetch(url)).blob();
  }
}

export function saveMeta(id, meta) {
  try { localStorage.setItem('sf_meta_' + id, JSON.stringify(meta)); } catch {}
}
export function loadMeta(id) {
  try { return JSON.parse(localStorage.getItem('sf_meta_' + id) || 'null'); } catch { return null; }
}
// 古い版の音源を消す(曲が更新された時)
export async function dropSong(id) {
  try {
    const c = await caches.open(CACHE);
    for (const k of await c.keys()) if (k.url.includes('/__sf/' + id + '/')) await c.delete(k);
  } catch {}
}
