import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';

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
  return u ? { Authorization: 'Bearer ' + (await u.getIdToken()) } : {};
}
export async function adminFetch(url, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(await adminHeaders()), ...(opts.headers || {}) };
  const r = await fetch(url, { ...opts, headers });
  if (!r.ok) { const t = await r.text(); let m = t; try { m = JSON.parse(t).error || t; } catch {} throw new Error(`(${r.status}) ${m}`); }
  return r.json();
}
