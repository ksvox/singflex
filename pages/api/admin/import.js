import { db, SONGS } from '../../../lib/firebaseAdmin';
import { isAdmin } from '../../../lib/pass';

const display = (t) => String(t || '').replace(/-\s*\([^()]+\)\s*$/, '').trim();

// 門弟アプリの楽曲(songs)から、曲名とEP名をSingFlexに取り込む(IDは同じものを使う)
export default async function handler(req, res) {
  if (!(await isAdmin(req))) return res.status(401).json({ error: 'admin' });
  const [src, mine] = await Promise.all([db().collection('songs').get(), db().collection(SONGS).get()]);
  const have = new Set(mine.docs.map((d) => d.id));
  let added = 0; const batch = db().batch();
  src.docs.forEach((d) => {
    const s = d.data();
    if (s.draft || !s.title || have.has(d.id)) return;
    batch.set(db().collection(SONGS).doc(d.id), { title: display(s.title), ep: (s.release || '').trim(), hasPdf: !!s.hasPdf, ready: false, version: 1, updatedAt: Date.now() });
    added++;
  });
  if (added) await batch.commit();
  res.json({ added, total: src.size });
}
