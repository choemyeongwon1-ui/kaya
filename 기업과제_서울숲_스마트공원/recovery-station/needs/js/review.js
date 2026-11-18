// 장소별 평가: 코스 찾기에서 한 곳을 둘러볼 때마다 별점(1~5)과 아쉬운 까닭을 받고, 산책 한 번을 기록 하나로 저장합니다.
// 지금은 이 기기(localStorage)에만 저장하고, 서버가 생기면 같은 모양으로 보내면 됩니다.
import { h } from './ui.js';

export const REVIEW_KEY = 'sf-needs-ratings';

const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
export const loadReviews = () => read(REVIEW_KEY, []);
/** 같은 산책(id)이면 덮어쓰고, 아니면 더합니다 */
export function upsertJourney(rec) {
  const all = loadReviews().filter(r => r.id !== rec.id);
  all.push(rec);
  write(REVIEW_KEY, all.slice(-500));
  return all;
}

const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.85 5.78 6.38.93-4.62 4.5 1.09 6.35L12 17.36l-5.7 3 1.09-6.35-4.62-4.5 6.38-.93z"/></svg>';
function star(size) {
  const s = document.createElement('span');
  s.className = 'rv-star'; s.style.width = s.style.height = `${size}px`; s.innerHTML = STAR;
  return s;
}
/** 고를 수 있는 별 5개 */
export function stars(size, onPick, cls = '', label = '별점') {
  let val = 0;
  const wrap = h('div', { class: `rv-stars ${cls}`, role: 'radiogroup', 'aria-label': label });
  const paint = k => btns.forEach((b, j) => b.classList.toggle('on', j < k));
  const set = i => { val = i; paint(i); btns.forEach((b, j) => b.setAttribute('aria-checked', String(j === i - 1))); onPick(i); };
  const btns = [1, 2, 3, 4, 5].map(i => {
    const b = h('button', { type: 'button', role: 'radio', 'aria-label': `${i}점`, 'aria-checked': 'false', onclick: e => { e.stopPropagation(); set(i); }, onmouseenter: () => paint(i) });
    b.append(star(size));
    return b;
  });
  wrap.addEventListener('mouseleave', () => paint(val));
  wrap.append(...btns);
  wrap.lock = () => wrap.classList.add('locked');
  return wrap;
}
/** 보기만 하는 별(평균·지난 평가) */
export function staticStars(v, size = 13) {
  const w = h('span', { class: 'rv-stars static', 'aria-label': `5점 만점에 ${(+v).toFixed(1)}점` });
  for (let i = 1; i <= 5; i++) { const s = star(size); if (i <= Math.round(v)) s.classList.add('on'); w.append(s); }
  return w;
}
