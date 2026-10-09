import { handle } from '../../../lib/handle';
import { db } from '../../../lib/firebaseAdmin';
import { isAdmin } from '../../../lib/pass';

// SingFlexの設定(熟語・慣用句の一覧)。保存先は門弟アプリのFirestore singflex_settings/main
async function handler(req, res) {
  if (!(await isAdmin(req))) return res.status(401).json({ error: req._adminWhy || 'admin' });
  const ref = db().collection('singflex_settings').doc('main');
  if (req.method === 'GET') { const d = await ref.get(); return res.json(d.exists ? d.data() : {}); }
  if (req.method !== 'POST') return res.status(405).end();
  const body = req.body || {};
  const data = { updatedAt: Date.now() };
  if ('idioms' in body) data.idioms = body.idioms == null ? null : String(body.idioms).slice(0, 200000);
  await ref.set(data, { merge: true });
  res.json({ ok: true });
}
export default handle(handler);
