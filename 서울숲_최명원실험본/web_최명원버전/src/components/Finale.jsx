import React from 'react';
import { useReveal, CountUp } from './motion.jsx';

/** 마지막 화면의 마무리 — 소개의 첫 질문에 답하고, 문제 네 가지를 해법과 다시 연결 */
export default function Finale({ data, go }) {
  const S = data.team.meta.scenario;
  const ref = useReveal('.fin-row, .fin-road li, .fin-title, .fin-end');
  const gained = ((S.vuln_before - S.vuln_after) / 10000).toFixed(1);
  const ROWS = [
    { tag: '집', saw: '작은 집, 밖으로 나온 일상', did: '집 밖에서 머물 땅을 넓힙니다', num: gained, unit: 'ha', note: '머물기 어려운 땅이 줄어드는 면적', tab: 'propose' },
    { tag: '거리', saw: '머물려면 무언가를 사야 하는 거리', did: '그냥 앉아 쉴 그늘과 쉼터를 놓습니다', num: String(S.rest_add), unit: '곳', note: `새 쉼터 · 나무 ${S.trees + S.buf_trees}그루와 함께`, tab: 'propose' },
    { tag: '이웃', saw: '가까이 살지만, 마주치지 않는 이웃', did: '누구와 왔는지에 맞춰 머물 곳을 안내합니다', num: '3', unit: '그룹', note: '유아 동반 가족 · 청년 · 고령층', tab: 'citizen' },
    { tag: '서울숲', saw: '모두가 향하는 단 하나의 숲', did: '붐비고 더운 순간을 미리 알려 피하게 합니다', num: '10', unit: '분', note: '날씨·대기 판정 갱신 주기', tab: 'admin' },
  ];
  return (
    <section className="finale" ref={ref}>
      <div className="fin-kick">마무리</div>
      <h2 className="fin-title">성수에서 잠시 머물 곳,<br /><em>서울숲이 그 답이 되도록.</em></h2>

      <div className="fin-rows">
        <div className="fin-head"><span>우리가 본 것</span><span>대시보드가 하는 일</span></div>
        {ROWS.map((r, i) => (
          <button key={r.tag} type="button" className="fin-row" style={{ '--i': i }} onClick={() => go(r.tab)}>
            <span className="fin-saw"><i>{r.tag}</i>{r.saw}</span>
            <span className="fin-did">{r.did}</span>
            <span className="fin-num"><b className="num"><CountUp text={r.num} /><small>{r.unit}</small></b><em>{r.note}</em></span>
          </button>
        ))}
      </div>

      <div className="fin-road">
        <div className="fin-road-t">앞으로</div>
        <ol>
          <li style={{ '--i': 0 }}><b>8주차 · 중간발표</b><span>실시간 판정과 취약지역 진단 완성</span></li>
          <li style={{ '--i': 1 }}><b>현장 확인</b><span>거점 표본 계수 · 이용자 설문 · 리뷰 분석으로 가정값을 실제 값으로 교체</span></li>
          <li style={{ '--i': 2 }}><b>16주차 · 최종발표</b><span>생애주기별 맞춤 코스와 혼잡 분산까지 확장</span></li>
        </ol>
      </div>

      <div className="fin-end">
        <button type="button" className="btn fin-btn" onClick={() => go('home')}>처음부터 다시 보기</button>
      </div>
    </section>
  );
}
