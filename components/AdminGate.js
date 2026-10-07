import { useEffect, useState } from 'react';
import { auth } from '../lib/client/firebaseClient';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';

// 管理者ログイン(門弟アプリと同じアカウント)
export default function AdminGate({ children }) {
  const [user, setUser] = useState(undefined);
  const [email, setEmail] = useState('info@ksvox.net');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => onAuthStateChanged(auth(), setUser), []);
  if (user === undefined) return <div className="adm"><div className="adm-in">確認中…</div></div>;
  if (!user) return (
    <div className="adm"><div className="adm-in" style={{ maxWidth: 380 }}>
      <h1>SingFlex 管理画面</h1>
      <p>門弟アプリの管理者アカウントでログインします。</p>
      <div className="card">
        <label>メールアドレス<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label style={{ display: 'block', marginTop: 10 }}>パスワード<input type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
        {err && <div className="msg">{err}</div>}
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn pri" onClick={async () => { setErr(''); try { await signInWithEmailAndPassword(auth(), email, pw); } catch { setErr('メールアドレスかパスワードが違います'); } }}>ログイン</button>
        </div>
      </div>
    </div></div>
  );
  return (
    <div className="adm"><div className="adm-in">
      {children}
      <p style={{ marginTop: 40 }}><button className="btn" onClick={() => signOut(auth())}>ログアウト</button></p>
    </div></div>
  );
}
