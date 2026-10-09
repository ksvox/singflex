import { useEffect, useState } from 'react';
import Link from 'next/link';
import AdminGate from '../../components/AdminGate';
import { adminFetch } from '../../lib/client/firebaseClient';
import { norm, parseName, uploadTo, resizeJacket, saveSong, stampDate } from '../../lib/client/admin';
import { analyzeLines, memoSource } from '../../lib/client/english';
import { DEFAULT_IDIOMS } from '../../lib/client/idioms';

function Panel() {
  const [songs, setSongs] = useState([]);
  const [log, setLog] = useState('');
  const [logAt, setLogAt] = useState('media');
  const [busy, setBusy] = useState(false);
  const [orphans, setOrphans] = useState([]);
  const [filter, setFilter] = useState('all');
  const [sel, setSel] = useState(new Set());
  const [idioms, setIdioms] = useState(null);
  const [idiomOpen, setIdiomOpen] = useState(false);
  useEffect(() => { adminFetch('/api/admin/settings').then((d) => setIdioms(d.idioms || DEFAULT_IDIOMS)).catch(() => setIdioms(DEFAULT_IDIOMS)); }, []);
  const load = () => adminFetch('/api/admin/songs').then((j) => setSongs(j.songs)).catch((e) => setLog('曲の一覧を読み込めませんでした: ' + e.message + '\n'));
  useEffect(() => { load(); }, []);
  const say = (s) => setLog((l) => l + s + '\n');

  // フォルダごとの一括登録
  const bulk = async (files) => {
    setBusy(true); setLog(''); setLogAt('media'); const left = [];
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

  // ---- 一括公開 ----
  const ITEMS = ['hasVocal', 'hasTrack', 'hasJacket', 'hasLyrics', 'timed', 'hasChords'];
  const missing = (s) => ITEMS.filter((k) => !s[k]);
  const FILTERS = {
    all: ['すべて', () => true],
    complete: ['全項目登録済み', (s) => missing(s).length === 0],
    noLyrics: ['歌詞のみ未登録', (s) => s.hasVocal && s.hasTrack && s.hasJacket && s.hasChords && !s.hasLyrics],
    noJacket: ['ジャケットのみ未登録', (s) => missing(s).length === 1 && !s.hasJacket],
    multi: ['複数未登録', (s) => missing(s).length >= 2 && !(s.hasVocal && s.hasTrack && s.hasJacket && s.hasChords && !s.hasLyrics)],
  };
  const shown = songs.filter(FILTERS[filter][1]);
  const pickFilter = (f) => { setFilter(f); setSel(f === 'all' ? new Set() : new Set(songs.filter(FILTERS[f][1]).map((s) => s.id))); };
  const toggle = (id) => setSel((x) => { const n = new Set(x); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allOn = shown.length > 0 && shown.every((s) => sel.has(s.id));
  const toggleAll = () => setSel((x) => { const n = new Set(x); shown.forEach((s) => (allOn ? n.delete(s.id) : n.add(s.id))); return n; });
  const publish = async (ready) => {
    const ids = shown.filter((s) => sel.has(s.id)).map((s) => s.id);
    if (!ids.length) return;
    if (!confirm(`チェックした${ids.length}曲を${ready ? '公開' : '非公開に'}します。よろしいですか?`)) return;
    setBusy(true); setLog(''); setLogAt('media');
    let n = 0;
    for (const id of ids) { try { await saveSong({ id, ready }); n++; } catch (e) { say(`× ${songs.find((s) => s.id === id)?.title}: ${e.message}`); } }
    say(`${n}曲を${ready ? '公開しました(生徒の一覧に出ます)' : '非公開にしました'}`);
    setBusy(false); load();
  };

  // ---- 歌詞メモ(英語歌唱メソッド)の一括分析 ----
  const memoTargets = songs.filter((s) => s.hasLyrics && (!s.hasMemo || s.memoStale));
  const bulkMemo = async () => {
    const stale = memoTargets.filter((s) => s.memoStale).length;
    if (!memoTargets.length) return;
    if (!confirm(`歌詞メモを分析します(未分析 ${memoTargets.length - stale} 曲${stale ? `/歌詞を直した曲 ${stale} 曲` : ''})。${stale ? '\n※歌詞を直した曲は、手直しした印が分析し直しで上書きされます。' : ''}\nよろしいですか?`)) return;
    setBusy(true); setLog(''); setLogAt('memo');
    let n = 0;
    for (const x of memoTargets) {
      try {
        const d = await adminFetch('/api/admin/song?id=' + x.id);
        const memo = await analyzeLines(d.lines || [], idioms);
        await saveSong({ id: x.id, memo, memoSrc: memoSource(d.lines || []), memoAt: Date.now() });
        n++; say(`✓ ${x.title}`);
      } catch (e) { say(`× ${x.title}: ${e.message}`); }
    }
    say(`${n}曲の歌詞メモを作りました。曲ごとの「編集」→「歌詞メモ」で手直しできます。`);
    setBusy(false); load();
  };
  const saveIdioms = async (text) => {
    setBusy(true); setLog(''); setLogAt('memo');
    try { await adminFetch('/api/admin/settings', { method: 'POST', body: JSON.stringify({ idioms: text }) }); setIdioms(text); say('熟語・慣用句の一覧を保存しました(これから分析する曲に使われます)'); }
    catch (e) { say('保存できませんでした: ' + e.message); }
    setBusy(false);
  };

  const mark = (b) => <span className={b ? 'ok' : 'ng'}>{b ? '✓' : '－'}</span>;
  return (
    <>
      <h1>SingFlex 管理画面</h1>
      <p>曲の登録・歌詞・タイミング・コード・歌詞メモ・リリックビデオの作成を行います。 <a className="btn" href="/" target="_blank" rel="noreferrer">生徒画面のトップを見る ↗</a></p>

      <h2>門弟アプリの楽曲を取り込む</h2>
      <div className="card row">
        <span style={{ flex: 1, minWidth: 200 }}>門弟アプリに登録済みの曲名・EP名をSingFlexに取り込みます(新しい曲を追加し、EP名が空の曲はEP名を補います)。</span>
        <button className="btn pri" disabled={busy} onClick={async () => { setBusy(true); setLog(''); setLogAt('media'); try { const r = await adminFetch('/api/admin/import', { method: 'POST' }); say(`門弟アプリから ${r.added} 曲を取り込みました。EP名を補った曲: ${r.fixed || 0} 曲(門弟アプリの曲数: ${r.total})`); } catch (e) { say('取り込めませんでした: ' + e.message); } setBusy(false); load(); }}>取り込む</button>
      </div>

      <h2>音源とジャケットを一括登録</h2>
      <div className="card">
        <p>分離ソフトで書き出したMP3(「曲名_(Vocals)」「曲名_(Instrumental)」)と、曲名(EPならEP名)のジャケット画像をまとめて選んでください。ジャケットは自動で小さくしてから保存します。</p>
        <input type="file" multiple accept="audio/*,image/*" disabled={busy} onChange={(e) => bulk([...e.target.files])} />
        {busy && logAt === 'media' && <div className="msg">処理中です。画面を閉じないでください…</div>}
        {log && logAt === 'media' && <div className="msg">{log}</div>}
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

      <h2>英語歌唱メソッドの歌詞メモ</h2>
      <div className="card">
        <div className="row">
          <span style={{ flex: 1, minWidth: 220 }}>歌詞が登録済みで、歌詞メモが未分析(または歌詞を直した)の曲: <b>{memoTargets.length}</b> 曲。発音辞書と決まりごとで印を付けます(AIは使いません)。</span>
          <button className="btn pri" disabled={busy || !memoTargets.length || idioms == null} onClick={bulkMemo}>まとめて分析する</button>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn" onClick={() => setIdiomOpen(!idiomOpen)}>{idiomOpen ? '熟語・慣用句の一覧を閉じる' : '熟語・慣用句の一覧を開く'}</button>
        </div>
        {busy && logAt === 'memo' && <div className="msg">処理中です。画面を閉じないでください…</div>}
        {log && logAt === 'memo' && <div className="msg">{log}</div>}
        {idiomOpen && idioms != null && (
          <div style={{ marginTop: 10 }}>
            <p style={{ fontSize: 12, color: '#7a6a54', margin: '0 0 6px' }}>1行に1つ。動詞は原形で書くと、fell / falling なども自動で拾います。「*」はどんな1語でも、「~」は my / your / his などに当てはまります。「#」で始まる行はメモ(無視されます)。</p>
            <textarea id="idioms" defaultValue={idioms} style={{ minHeight: 320 }} />
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn pri" disabled={busy} onClick={() => saveIdioms(document.getElementById('idioms').value)}>一覧を保存</button>
              <button className="btn" disabled={busy} onClick={() => { if (confirm('最初の一覧に戻しますか?(追加した熟語は消えます)')) { document.getElementById('idioms').value = DEFAULT_IDIOMS; saveIdioms(DEFAULT_IDIOMS); } }}>最初の一覧に戻す</button>
            </div>
          </div>
        )}
      </div>

      <h2>登録済みの曲({songs.length})</h2>
      <div className="card row" style={{ marginBottom: 10 }}>
        <span>絞り込み:</span>
        <select value={filter} onChange={(e) => pickFilter(e.target.value)}>
          {Object.entries(FILTERS).map(([k, [label, fn]]) => <option key={k} value={k}>{label}({songs.filter(fn).length})</option>)}
        </select>
        <span style={{ fontSize: 13, color: '#7a6a54' }}>チェック {shown.filter((s) => sel.has(s.id)).length} 曲</span>
        <button className="btn pri" disabled={busy} onClick={() => publish(true)}>チェックした曲を公開する</button>
        <button className="btn" disabled={busy} onClick={() => publish(false)}>チェックした曲を非公開にする</button>
      </div>
      <div className="card" style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th><input type="checkbox" checked={allOn} onChange={toggleAll} title="表示中の曲をすべて選ぶ/外す" /></th><th>曲名</th><th>ボーカル</th><th>伴奏</th><th>ジャケット</th><th>歌詞</th><th>タイミング</th><th>コード</th><th>和訳</th><th>メモ</th><th>動画</th><th>公開</th><th></th></tr></thead>
          <tbody>
            {shown.map((s) => (
              <tr key={s.id}>
                <td><input type="checkbox" checked={sel.has(s.id)} onChange={() => toggle(s.id)} /></td>
                <td>{s.title}{s.ep && <div style={{ fontSize: 11, color: '#8a7a64' }}>{s.ep}</div>}</td>
                <td>{mark(s.hasVocal)}</td><td>{mark(s.hasTrack)}</td><td>{mark(s.hasJacket)}</td><td>{mark(s.hasLyrics)}</td><td>{mark(s.timed)}</td><td>{mark(s.hasChords)}</td><td>{mark(s.hasJp)}</td>
                <td>{s.memoStale ? <span style={{ color: '#c0392b', fontSize: 11, fontWeight: 700 }}>要再分析</span> : mark(s.hasMemo)}</td>
                <td>{s.videoMadeAt ? <span className="stamp sm" title={'生成済み ' + stampDate(s.videoMadeAt)}>生成済<br />{new Date(s.videoMadeAt).getMonth() + 1}/{new Date(s.videoMadeAt).getDate()}</span> : <span className="ng">－</span>}</td>
                <td>{mark(s.ready)}</td>
                <td><div className="row" style={{ flexWrap: 'nowrap' }}><Link className="btn" href={'/admin/song/' + s.id}>編集</Link><a className="btn" href={'/booth/' + s.id} target="_blank" rel="noreferrer">生徒画面で見る</a></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function Admin() { return <AdminGate><Panel /></AdminGate>; }
