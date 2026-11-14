import React from 'react';

/** 화면 맨 아래 '다음 이야기'로 넘어가는 띠 — 소개 페이지의 흐름을 뒤 화면까지 이어 줌 */
export default function NextStep({ kick, title, desc, onClick, tone = 'g1' }) {
  return (
    <button type="button" className={`next-step ${tone}`} onClick={onClick}>
      <span className="ns-kick">{kick}</span>
      <span className="ns-title">{title}</span>
      {desc ? <span className="ns-desc">{desc}</span> : null}
      <span className="ns-arrow" aria-hidden="true">→</span>
    </button>
  );
}
