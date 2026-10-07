import { useEffect, useState } from 'react';
import Link from 'next/link';
import AdminGate from '../../components/AdminGate';
import { adminFetch } from '../../lib/client/firebaseClient';
import { norm, parseName, uploadTo, resizeJacket, saveSong } from '../../lib/client/admin';

function Panel() {
  const [songs, setSongs] = useState([]);
  const [log, setLog] = useState('');
  const [busy, setBusy] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [orphans, setOrphans] = useState([]);
  const load = () => adminFetch('/api/admin/songs').then((j) => setSongs(j.songs)).catch((e) => setLog('曲の一覧を読み込めませんでした: ' + e.message + '\n'));
  useEffect(() => { load(); }, []);
  const say = (s) => setLog((l) => l + s + '\n');

  // フォルダごとの一括登録
  const bulk = async (files) => {
    setBusy(true); setLog(''); const left = [];
    let list = [...songs];
    const find = (base) => list.filter((s) => norm(s.title) === norm(base));
    const findEp = (base) => {
      const nb = norm(base);
      const exact = list.filter((s) => s.ep && norm(s.ep) === nb);
      if (exact.length) return exact;
      // 省略・副題つきでも拾う(画像名がEP名に含まれる/EP名が画像名に含まれる)
      if (nb.length < 4) return [];
      const eps = [...new Set(list.filter((s) => s.ep).map((s) => s.ep))].filter((e) => { const ne = norm(e); return ne.length >= 4 && (ne.includes(nb) || nb.includes(ne)); });
      return eps.length === 1 ? list.filter((s) => s.ep === eps[0]) : [];
    };
    for (const f of files) {
      const { kind, base } = parseName(f.name);
      if (!kind) { say(`× ${f.name}: 種類が分かりません(ファイル名に (Vocals) か (Instrumental) を含めてください)`); continue; }
      try {
        if (kind === 'jacket') {
          const targets = find(base).length ? find(base) : findEp(base);
          if (!targets.length) { left.push(f); say(`? ${f.name}: 一致する曲がありません(下で選べます)`); continue; }
          const blob = await resizeJacket(f);
          for (const s of targets) { await uploadTo(`songs/${s.id}/jacket.jpg`, blob, 'image/jpeg'); await saveSong({ id: s.id, jacketKey: `songs/${s.id}/jacket.jpg` }); }
          say(`✓ ${f.name} → ${targets.map((s) => s.title).join(', ')}`);
        } else {
          let s = find(base)[0];
          if (!s) { say(`? ${f.name}: 「${base}」という曲が見つかりません(ファイル名と曲名を確認してください)`); continue; }
          const k = `songs/${s.id}/${kind}.mp3`;
          await uploadTo(k, f, 'audio/mpeg');
          await saveSong({ id: s.id, [kind + 'Key']: k });
          say(`✓ ${f.name} → ${s.title}(${kind === 'vocal' ? 'ボーカル' : '伴奏'})`);
        }
      } catch (e) { say(`× ${f.name}: ${e.message}`); }
    }
    setOrphans(left); setBusy(false); load();
  };

  // 一致しなかった画像を、選んだEPの全曲 または 選んだ1曲に付ける
  const assignOrphan = async (f, val) => {
    const ids = val.startsWith('ep:') ? songs.filter((s) => s.ep === val.slice(3)).map((s) => s.id) : [val];
    setBusy(true);
    try {
      const blob = await resizeJacket(f);
      for (const id of ids) { await uploadTo(`songs/${id}/jacket.jpg`, blob, 'image/jpeg'); await saveSong({ id, jacketKey: `songs/${id}/jacket.jpg` }); }
      say(`✓ ${f.name} → ${val.startsWith('ep:') ? 'EP「' + val.slice(3) + '」の' + ids.length + '曲' : songs.find((s) => s.id === val)?.title}`);
      setOrphans((o) => o.filter((x) => x !== f));
    } catch (e) { say(`× ${f.name}: ${e.message}`); }
    setBusy(false); load();
  };
  const epList = Object.entries(songs.reduce((m, s) => { if (s.ep) m[s.ep] = (m[s.ep] || 0) + 1; return m; }, {})).sort((a, b) => a[0].localeCompare(b[0]));

  const mark = (b) => <span className={b ? 'ok' : 'ng'}>{b ? '✓' : '－'}</span>;
  return (
    <>
      <h1>SingFlex 管理画面</h1>
      <p>曲の登録・歌詞・タイミング・コード・リリックビデオの作成を行います。</p>

      <h2>門弟アプリの楽曲を取り込む</h2>
      <div className="card row">
        <span style={{ flex: 1, minWidth: 200 }}>門弟アプリに登録済みの曲名・EP名をSingFlexに取り込みます(新しい曲を追加し、EP名が空の曲はEP名を補います)。</span>
        <button className="btn pri" disabled={busy} onClick={async () => { setBusy(true); setLog(''); try { const r = await adminFetch('/api/admin/import', { method: 'POST' }); say(`門弟アプリから ${r.added} 曲を取り込みました。EP名を補った曲: ${r.fixed || 0} 曲(門弟アプリの曲数: ${r.total})`); } catch (e) { say('取り込めませんでした: ' + e.message); } setBusy(false); load(); }}>取り込む</button>
      </div>

      <h2>音源とジャケットを一括登録</h2>
      <div className="card">
        <p>分離ソフトで書き出したMP3(「曲名_(Vocals)」「曲名_(Instrumental)」)と、曲名(EPならEP名)のジャケット画像をまとめて選んでください。ジャケットは自動で小さくしてから保存します。</p>
        <input type="file" multiple accept="audio/*,image/*" disabled={busy} onChange={(e) => bulk([...e.target.files])} />
        {busy && <div className="msg">処理中です。画面を閉じないでください…</div>}
        {log && <div className="msg">{log}</div>}
        {orphans.map((f) => (
          <div key={f.name} className="row" style={{ marginTop: 8 }}>
            <span style={{ minWidth: 160 }}>{f.name}</span>
            <select defaultValue="" disabled={busy} onChange={(e) => e.target.value && assignOrphan(f, e.target.value)} style={{ maxWidth: 420 }}>
              <option value="">どのEP/曲のジャケット?</option>
              <optgroup label="EP(収録曲すべてに付けます)">
                {epList.map(([ep, n]) => <option key={'ep:' + ep} value={'ep:' + ep}>{ep}({n}曲)</option>)}
              </optgroup>
              <optgroup label="曲(1曲だけに付けます)">
                {songs.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </optgroup>
            </select>
          </div>
        ))}
      </div>

      <h2>曲を1つ追加</h2>
      <div className="card row">
        <input type="text" placeholder="曲名" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
        <button className="btn pri" disabled={!newTitle.trim()} onClick={async () => { await saveSong({ title: newTitle.trim() }); setNewTitle(''); load(); }}>追加</button>
      </div>

      <h2>登録済みの曲({songs.length})</h2>
      <div className="card" style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>曲名</th><th>ボーカル</th><th>伴奏</th><th>ジャケット</th><th>歌詞</th><th>タイミング</th><th>コード</th><th>和訳</th><th>公開</th><th></th></tr></thead>
          <tbody>
            {songs.map((s) => (
              <tr key={s.id}>
                <td>{s.title}{s.ep && <div style={{ fontSize: 11, color: '#8a7a64' }}>{s.ep}</div>}</td>
                <td>{mark(s.hasVocal)}</td><td>{mark(s.hasTrack)}</td><td>{mark(s.hasJacket)}</td><td>{mark(s.hasLyrics)}</td><td>{mark(s.timed)}</td><td>{mark(s.hasChords)}</td><td>{mark(s.hasJp)}</td><td>{mark(s.ready)}</td>
                <td><Link className="btn" href={'/admin/song/' + s.id}>編集</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function Admin() { return <AdminGate><Panel /></AdminGate>; }
