// ジャケット画像から曲のテーマ色を取り出す
export function jacketColors(img) {
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 24;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0, 24, 24);
    const d = x.getImageData(0, 0, 24, 24).data;
    let best = null, bestScore = -1, sum = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) {
      const [r, g, b] = [d[i], d[i + 1], d[i + 2]];
      sum[0] += r; sum[1] += g; sum[2] += b;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const sat = mx ? (mx - mn) / mx : 0;
      const score = sat * (mx / 255) * (1 - Math.abs(mx / 255 - 0.6));
      if (score > bestScore) { bestScore = score; best = [r, g, b]; }
    }
    const n = d.length / 4;
    const avg = sum.map((v) => Math.round(v / n));
    const vivid = best || avg;
    return { a: `rgb(${vivid.join(',')})`, b: `rgb(${avg.join(',')})`, dark: `rgb(${avg.map((v) => Math.round(v * 0.18)).join(',')})` };
  } catch {
    return { a: '#7a2f8f', b: '#1f6f8b', dark: '#0d0816' };
  }
}
