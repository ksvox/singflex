const LEVELS = [1, 1.15, 1.3];
const NAMES = ['標準', '大', '特大'];
export function applyScale(i) {
  document.documentElement.style.setProperty('--fs', LEVELS[i]);
  try { localStorage.setItem('sf_fs', String(i)); } catch {}
}
export function currentScale() {
  try { return Number(localStorage.getItem('sf_fs') || 0) % 3; } catch { return 0; }
}
export const scaleName = (i) => NAMES[i];
