import { verifyMonteiPass, issueCookie, canListen } from '../../lib/pass';

// 門弟アプリから ?pass=... 付きで開かれた時に呼ばれる
export default async function handler(req, res) {
  const token = req.query.kspass;
  if (token && verifyMonteiPass(token)) { issueCookie(res); return res.json({ ok: true }); }
  return res.json({ ok: await canListen(req) });
}
