import { handle } from '../../../lib/handle';
import { db, SONGS, getAdmin } from '../../../lib/firebaseAdmin';
import { isAdmin } from '../../../lib/pass';

const ALLOWED = ['title', 'ep', 'ready', 'vocalKey', 'trackKey', 'jacketKey', 'lines', 'chords', 'jp', 'timed', 'rawLyrics'];

// 作成(idなし)・更新(idあり)・削除(DELETE)
async function handler(req, res) {
  if (!(await isAdmin(req))) return res.status(401).json({ error: req._adminWhy || 'admin' });
  const col = db().collection(SONGS);
  if (req.method === 'GET') { const d = await col.doc(req.query.id).get(); return res.json(d.exists ? { id: d.id, ...d.data() } : null); }
  if (req.method === 'DELETE') { await col.doc(req.query.id).delete(); return res.json({ ok: true }); }
  if (req.method !== 'POST') return res.status(405).end();
  const body = req.body || {};
  const data = {};
  for (const k of ALLOWED) if (k in body) data[k] = body[k];
  data.updatedAt = Date.now();
  data.version = getAdmin().firestore.FieldValue.increment(1);
  if (body.id) { await col.doc(body.id).set(data, { merge: true }); return res.json({ id: body.id }); }
  const ref = await col.add({ ready: false, ...data });
  res.json({ id: ref.id });
}
export default handle(handler);
export const config = { api: { bodyParser: { sizeLimit: '2mb' } } };
