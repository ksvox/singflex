import { db } from '../../../lib/firebaseAdmin';
import { isAdmin } from '../../../lib/pass';

// 門弟アプリに登録済みの歌詞PDFを取り出す
export default async function handler(req, res) {
  if (!(await isAdmin(req))) return res.status(401).json({ error: 'admin' });
  const id = String(req.query.id || '');
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return res.status(400).end();
  const snap = await db().collection('songs').doc(id).collection('pdf').orderBy('i').get();
  if (snap.empty) return res.status(404).json({ error: 'nopdf' });
  res.setHeader('Content-Type', 'application/pdf');
  res.send(Buffer.from(snap.docs.map((d) => d.data().data).join(''), 'base64'));
}
