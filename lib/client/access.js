// 門弟アプリの通行証を確認(?kspass=... で開かれた時)
export async function ensurePass() {
  const u = new URL(location.href);
  const p = u.searchParams.get('kspass');
  try {
    const r = await fetch('/api/pass' + (p ? '?kspass=' + encodeURIComponent(p) : ''));
    const j = await r.json();
    if (p) { u.searchParams.delete('kspass'); history.replaceState(null, '', u.pathname + u.search); }
    return j.ok;
  } catch { return null; } // オフライン
}
