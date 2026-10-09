import { handle } from '../../../lib/handle';
import { db, SONGS } from '../../../lib/firebaseAdmin';
import { canListen, isAdmin } from '../../../lib/pass';
import { getUrl } from '../../../lib/r2';

// 1曲分のデータ(歌詞・タイミング・コード・和訳)と音源の鍵付きURL
async function handler(req, res) {
  if (!(await canListen(req))) return res.status(401).json({ error: 'pass' });
  const doc = await db().collection(SONGS).doc(req.query.id).get();
  if (!doc.exists) return res.status(404).json({ error: 'notfound' });
  const s = doc.data();
  if (!s.ready && !(await isAdmin(req))) return res.status(404).json({ error: 'notready' });
  const url = async (k) => (k ? getUrl(k, 6 * 3600) : null);
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    id: doc.id, title: s.title, ep: s.ep || '', version: s.version || 1,
    lines: s.lines || [], chords: s.chords || [], jp: s.jp || '',
    count: s.count && s.count.on ? s.count : null,
    memo: s.memo && s.memoSrc === (s.lines || []).map((l) => l.text).join('\n') ? s.memo : null,
    vocal: await url(s.vocalKey), track: await url(s.trackKey), jacket: await url(s.jacketKey)
  });
}
export default handle(handler);
