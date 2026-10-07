import { handle } from '../../../lib/handle';
import { db, SONGS } from '../../../lib/firebaseAdmin';
import { isAdmin } from '../../../lib/pass';

const display = (t) => String(t || '').replace(/-\s*\([^()]+\)\s*$/, '').trim();
// EP名:リリース名が空なら、曲名の後ろの「-(EP名)」から拾う
const epOf = (s) => { const r = String(s.release || '').trim(); if (r) return r; const m = String(s.title || '').match(/-\s*\(([^()]+)\)\s*$/); return m ? m[1].trim() : ''; };

// 門弟アプリの楽曲(songs)から、曲名とEP名をSingFlexに取り込む(IDは同じものを使う)
async function handler(req, res) {
  if (!(await isAdmin(req))) return res.status(401).json({ error: req._adminWhy || 'admin' });
  const [src, mine] = await Promise.all([db().collection('songs').get(), db().collection(SONGS).get()]);
  const have = new Map(mine.docs.map((d) => [d.id, d.data()]));
  let added = 0; let fixed = 0; const batch = db().batch();
  src.docs.forEach((d) => {
    const s = d.data();
    if (s.draft || !s.title) return;
    const ep = epOf(s);
    if (have.has(d.id)) {
      if (ep && !String(have.get(d.id).ep || '').trim()) { batch.update(db().collection(SONGS).doc(d.id), { ep, updatedAt: Date.now() }); fixed++; }
      return;
    }
    batch.set(db().collection(SONGS).doc(d.id), { title: display(s.title), ep, hasPdf: !!s.hasPdf, ready: false, version: 1, updatedAt: Date.now() });
    added++;
  });
  if (added || fixed) await batch.commit();
  res.json({ added, fixed, total: src.size });
}
export default handle(handler);
