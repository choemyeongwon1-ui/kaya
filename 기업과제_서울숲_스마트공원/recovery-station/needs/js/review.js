// 장소별 평가: 코스 찾기에서 한 곳을 둘러볼 때마다 표정(😊5·😐3·😞1)과 까닭을 받고, 산책 한 번을 기록 하나로 저장합니다.
// 전체 산책 기록은 이 기기(localStorage)에만 두고, 장소별 표정 한 건만 익명으로 서버(proxy/comfort)에 보내 관리자 화면에서 모아 봅니다.
import { h } from './ui.js';
import { COMFORT_URL } from './config.js';

export const REVIEW_KEY = 'sf-needs-ratings';
const SENT_KEY = 'sf-comfort-sent';

const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

/** 표정 한 건을 익명으로 보냄. 같은 곳은 30분에 한 번만(여러 번 눌러 통계가 쏠리지 않게). 실패해도 화면은 그대로 */
export function sendComfort(vote) {
  if (!COMFORT_URL || !vote?.place) return;
  const sent = read(SENT_KEY, {}), now = Date.now();
  for (const k of Object.keys(sent)) if (now - sent[k] > 1800e3) delete sent[k];
  if (sent[vote.place]) return;
  sent[vote.place] = now; write(SENT_KEY, sent);
  const ctl = new AbortController(); setTimeout(() => ctl.abort(), 6000);
  fetch(COMFORT_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(vote), signal: ctl.signal, keepalive: true }).catch(() => {});
}
/** 관리자용 합계(개별 응답 없음) */
export async function fetchComfort(days = 90) {
  if (!COMFORT_URL) return null;
  try {
    const ctl = new AbortController(); setTimeout(() => ctl.abort(), 8000);
    const r = await fetch(`${COMFORT_URL}?days=${days}`, { signal: ctl.signal });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}
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
/**
 * 표정 3개 한 번 누르기(1초 평가). 도착은 위치로 알아채므로 이용자는 표정만 누르면 됨.
 * 기존 별점과 같은 저장 모양을 쓰려고 😊=5 · 😐=3 · 😞=1점으로 바꿔 저장(4점 이상=좋음, 3점=약하게 다시 짬, 2점 이하=다시 짬)
 */
// 직접 그린 얼굴(이모지는 기기마다 모양이 달라서). 동그라미 + 눈 + 입, 좋아요엔 볼터치
const FACE_SVG = {
  good: '<circle class="fc-bg" cx="24" cy="24" r="21"/><circle class="fc-cheek" cx="13.5" cy="27.5" r="3.2"/><circle class="fc-cheek" cx="34.5" cy="27.5" r="3.2"/>'
    + '<path class="fc-line" d="M14.5 20.5q3.2-3.6 6.4 0M27.1 20.5q3.2-3.6 6.4 0"/><path class="fc-line" d="M15.5 28.5q8.5 8.5 17 0"/>',
  mid: '<circle class="fc-bg" cx="24" cy="24" r="21"/><circle class="fc-eye" cx="17.5" cy="20.5" r="2.3"/><circle class="fc-eye" cx="30.5" cy="20.5" r="2.3"/>'
    + '<path class="fc-line" d="M16.5 31h15"/>',
  bad: '<circle class="fc-bg" cx="24" cy="24" r="21"/><circle class="fc-eye" cx="17.5" cy="21.5" r="2.3"/><circle class="fc-eye" cx="30.5" cy="21.5" r="2.3"/>'
    + '<path class="fc-line" d="M13.5 17.5l5.5-2.2M34.5 17.5l-5.5-2.2"/><path class="fc-line" d="M16.5 33.5q7.5-5.5 15 0"/>',
};
const faceIcon = (cls, size) => { const s = document.createElement('span'); s.className = 'fc'; s.style.width = s.style.height = `${size}px`; s.innerHTML = `<svg viewBox="0 0 48 48" aria-hidden="true">${FACE_SVG[cls]}</svg>`; return s; };
export const FACES = [
  { v: 5, label: '좋아요', cls: 'good' },
  { v: 3, label: '보통', cls: 'mid' },
  { v: 1, label: '별로', cls: 'bad' },
];
export const faceOf = v => v == null ? null : v >= 4 ? FACES[0] : v >= 3 ? FACES[1] : FACES[2];
export function faces(onPick, label = '이 자리 쾌적함') {
  const wrap = h('div', { class: 'rv-faces', role: 'radiogroup', 'aria-label': label });
  const btns = FACES.map((f, i) => h('button', { type: 'button', role: 'radio', class: `rv-face ${f.cls}`, style: `--i:${i}`, 'aria-checked': 'false', 'aria-label': f.label,
    onclick: e => {
      e.stopPropagation();
      const me = e.currentTarget;
      btns.forEach(b => { const on = b === me; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
      me.classList.remove('pop'); void me.offsetWidth; me.classList.add('pop');
      wrap.classList.add('picked'); onPick(f.v);
    } },
    faceIcon(f.cls, 52), h('small', null, f.label)));
  wrap.append(...btns);
  return wrap;
}
/** 보기만 하는 표정(지난 평가) */
export function staticFace(v, size = 20) {
  const f = faceOf(v);
  if (!f) return h('span');
  const s = h('span', { class: `rv-face-s ${f.cls}`, title: f.label, 'aria-label': f.label });
  s.append(faceIcon(f.cls, size));
  return s;
}
/** 보기만 하는 별(평균·지난 평가) */
export function staticStars(v, size = 13) {
  const w = h('span', { class: 'rv-stars static', 'aria-label': `5점 만점에 ${(+v).toFixed(1)}점` });
  for (let i = 1; i <= 5; i++) { const s = star(size); if (i <= Math.round(v)) s.classList.add('on'); w.append(s); }
  return w;
}
