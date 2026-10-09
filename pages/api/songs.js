import { handle } from '../../lib/handle';
import { db, SONGS } from '../../lib/firebaseAdmin';
import { canListen, isAdmin } from '../../lib/pass';
import { getUrl } from '../../lib/r2';

// 生徒用: 公開中の曲一覧(曲名・EP・ジャケット)。管理者がログイン中なら非公開の曲も含める
async function handler(req, res) {
  if (!(await canListen(req))) return res.status(401).json({ error: 'pass' });
  const admin = await isAdmin(req);
  const col = db().collection(SONGS);
  const snap = admin ? await col.get() : await col.where('ready', '==', true).get();
  const songs = await Promise.all(snap.docs.map(async (d) => {
    const s = d.data();
    const o = { id: d.id, title: s.title, ep: s.ep || '', jacket: s.jacketKey ? await getUrl(s.jacketKey, 6 * 3600) : null };
    if (admin && !s.ready) o.ready = false;
    return o;
  }));
  songs.sort((a, b) => a.title.localeCompare(b.title));
  res.setHeader('Cache-Control', 'no-store');
  res.json({ songs });
}
export default handle(handler);
