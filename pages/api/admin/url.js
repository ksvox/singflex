import { isAdmin } from '../../../lib/pass';
import { getUrl } from '../../../lib/r2';

// 管理画面: 任意の曲の音源URL(解析・動画作成用)
export default async function handler(req, res) {
  if (!(await isAdmin(req))) return res.status(401).json({ error: 'admin' });
  const key = String(req.query.key || '');
  if (!/^songs\/[\w-]+\/(vocal\.mp3|track\.mp3|jacket\.jpg)$/.test(key)) return res.status(400).json({ error: 'key' });
  res.json({ url: await getUrl(key, 3600) });
}
