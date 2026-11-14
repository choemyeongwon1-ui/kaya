import React, { useEffect, useRef, useState } from 'react';

// 발표 슬라이드 같은 등장 효과 — 움직임 줄이기 설정을 켠 사용자에겐 바로 보여 줌
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** 컨테이너 안에서 selector 에 맞는 요소가 화면에 들어오면 .in 을 붙임 (같은 부모 안에서 순서대로 지연) */
export function useReveal(selector, deps = []) {
  const ref = useRef(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    root.querySelectorAll(selector).forEach((el) => el.setAttribute('data-rv', ''));
    const els = [...root.querySelectorAll('[data-rv]')];
    els.forEach((el) => {
      const sibs = [...el.parentElement.children].filter((c) => c.hasAttribute('data-rv'));
      el.style.setProperty('--i', Math.max(0, sibs.indexOf(el)));
    });
    if (reduced() || !('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('in'));
      return undefined;
    }
    root.classList.add('rv-on');
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return ref;
}

/** "휴식 55%" 같은 문자열의 첫 숫자를 0부터 세어 올림 */
export function CountUp({ text, ms = 1100 }) {
  const str = String(text);
  const m = str.match(/\d[\d,]*(\.\d+)?/);
  const el = useRef(null);
  const [shown, setShown] = useState(m && !reduced() ? str.replace(m[0], '0') : str);
  useEffect(() => {
    if (!m || reduced() || !('IntersectionObserver' in window)) { setShown(str); return undefined; }
    const target = Number(m[0].replace(/,/g, ''));
    const dec = m[1] ? m[1].length - 1 : 0;
    const comma = m[0].includes(',');
    const fmt = (v) => (comma ? v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : v.toFixed(dec));
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const step = (t) => {
        const p = Math.min(1, (t - t0) / ms);
        const eased = 1 - (1 - p) ** 3;
        setShown(str.replace(m[0], fmt(target * eased)));
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
      // 탭이 백그라운드라 프레임이 멈춰도 최종 값은 반드시 보이게
      setTimeout(() => setShown(str), ms + 150);
    }, { threshold: 0.5 });
    io.observe(el.current);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [str]); // eslint-disable-line react-hooks/exhaustive-deps
  return <span ref={el}>{shown}</span>;
}
