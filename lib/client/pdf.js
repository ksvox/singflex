// 歌詞PDFから文字を取り出す(行ごと)
export async function pdfText(file) {
  const pdfjs = await import('pdfjs-dist/build/pdf');
  pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const out = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const rows = [];
    tc.items.forEach((it) => {
      if (!it.str.trim()) return;
      const y = Math.round(it.transform[5]); const x = it.transform[4];
      let r = rows.find((r) => Math.abs(r.y - y) <= 2);
      if (!r) { r = { y, items: [] }; rows.push(r); }
      r.items.push({ x, s: it.str });
    });
    // 2段組みにも対応(左の段→右の段の順)
    const mid = page.view[2] / 2;
    const col = (left) => rows.map((r) => ({ y: r.y, s: r.items.filter((i) => (left ? i.x < mid - 10 : i.x >= mid - 10)).sort((a, b) => a.x - b.x).map((i) => i.s).join(' ').trim() })).filter((r) => r.s).sort((a, b) => b.y - a.y);
    const L = col(true), R = col(false);
    const twoCol = R.length > 3 && L.length > 3;
    if (twoCol) { out.push(...L.map((r) => r.s), ...R.map((r) => r.s)); }
    else out.push(...rows.sort((a, b) => b.y - a.y).map((r) => r.items.sort((a, b) => a.x - b.x).map((i) => i.s).join(' ').trim()));
  }
  return out.join('\n');
}
