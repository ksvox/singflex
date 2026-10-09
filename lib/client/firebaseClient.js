import { initializeApp, getApps } from 'firebase/app';
import { getAuth, onAuthStateChanged } from 'firebase/auth';

// 門弟アプリと同じFirebase(ログインは管理者のみ使用)
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'ksvox-montei.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'ksvox-montei'
};
export function auth() {
  if (!getApps().length) initializeApp(config);
  return getAuth();
}
export async function adminHeaders() {
  const u = auth().currentUser;
  if (!u) return {};
  const t = await u.getIdToken();
  // サーバーの手前でAuthorizationが消えることがあるため、門弟アプリと同じく X-Id-Token でも送る
  return { Authorization: 'Bearer ' + t, 'X-Id-Token': t };
}
export async function adminFetch(url, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(await adminHeaders()), ...(opts.headers || {}) };
  const r = await fetch(url, { ...opts, headers });
  if (!r.ok) { const t = await r.text(); let m = t; try { m = JSON.parse(t).error || t; } catch {} throw new Error(`(${r.status}) ${m}`); }
  return r.json();
}

// 生徒画面用: 管理者がログイン中なら、その証明を付けて読み込む(鍵が開く)
let ready = null;
export function authReady() {
  if (!ready) ready = new Promise((res) => {
    let done = false;
    const fin = (u) => { if (!done) { done = true; res(u || null); } };
    setTimeout(() => fin(null), 3000);
    try { const un = onAuthStateChanged(auth(), (u) => { un(); fin(u); }); } catch { fin(null); }
  });
  return ready;
}
export async function viewerHeaders() {
  const u = await authReady();
  if (!u) return {};
  try { return await adminHeaders(); } catch { return {}; }
}
