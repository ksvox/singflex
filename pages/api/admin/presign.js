import { isAdmin } from '../../../lib/pass';
import { putUrl } from '../../../lib/r2';

export default async function handler(req, res) {
  if (!(await isAdmin(req))) return res.status(401).json({ error: 'admin' });
  const { key, type } = req.body || {};
  if (!key || !/^songs\/[\w-]+\/(vocal\.mp3|track\.mp3|jacket\.jpg)$/.test(key)) return res.status(400).json({ error: 'key' });
  res.json({ url: await putUrl(key, type || 'application/octet-stream') });
}
