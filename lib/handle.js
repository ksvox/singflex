// サーバー側のエラーを、理由つきで画面に返す
export const handle = (fn) => async (req, res) => {
  try { await fn(req, res); }
  catch (e) { console.error(e); if (!res.headersSent) res.status(500).json({ error: e.message || String(e) }); }
};
