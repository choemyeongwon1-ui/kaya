// 소개 화면 내용 — 장마다 "결론 1줄 + 숫자 2~3개"만. 숫자는 출처 필수, 원자료 미확인 값은 쓰지 않는다.
// 조사 근거 전체 목록: docs/01_목적_컨셉.md, 조사일 2026-11-14

/** 조원 역할 — 이름은 조원들이 채워 넣기 */
export const TEAM = [
  { name: '조원 1', role: '기획·발표' },
  { name: '조원 2', role: '데이터 수집' },
  { name: '조원 3', role: 'GIS 분석' },
  { name: '조원 4', role: '대시보드 개발' },
  { name: '조원 5', role: '만족도 조사' },
];

/* 01 왜 서울숲 — 녹지 비율 (Sentinel-2 NDVI ≥ 0.3, 팀 계산 · 회복정거장_보완내용_근거정리.md) */
export const GREEN = {
  title: '성수 일대에서 걸어서 갈 수 있는 큰 숲은 서울숲뿐이다',
  bars: [
    { label: '서울숲 안', value: 81.7, hi: true },
    { label: '서울숲 주변 1km', value: 31.0, note: '한강 수면 포함' },
    { label: '성수역 반경 500m', value: 17.1 },
  ],
  src: 'Sentinel-2 L2A 2026.6.15 · 녹지 = NDVI 0.3 이상 · 팀 분석 (10월 장면도 같은 순서)',
};
export const VISITORS = { value: '1,400', unit: '만 명', label: '2026 정원박람회 180일 방문객', src: '서울시 보도자료 2026.10', url: 'https://www.seoul.go.kr/festa/garden/y2026/news-resources/press-releases?article=48079' };

/* 04 문제 — 여름 위험 */
export const HEAT = { value: '79.2', unit: '%', label: '온열질환 중 실외 발생 비율 (2025년 4,460명)', src: '질병관리청 2025 온열질환 응급실감시', url: 'https://www.kdca.go.kr/bbs/kdca/42/215434/artclView.do' };

/* 소개 PART 1 — 문제의식을 느낀 네 장면 (수치 미확보 항목은 pending 으로 표시) */
export const SCENES = [
  {
    key: 'home', tag: '집', title: '작은 집, 밖으로 나온 일상',
    body: '성수 4개 동 가구의 절반이 1인 가구이고, 수도권의 1인당 주거면적은 전국 평균보다 좁습니다. 작은 집에서는 쉬는 일도, 누군가를 만나는 일도 집 밖으로 나옵니다.',
    fact: { num: '33.0㎡', label: '수도권 1인당 주거면적 — 전국 평균 36.0㎡보다 좁음', src: '국토교통부 2024 주거실태조사 (한국경제 2025.11.16)', url: 'https://www.hankyung.com/article/2025111664397' },
  },
  {
    key: 'street', tag: '거리', title: '머물려면 무언가를 사야 하는 거리',
    body: '공장 지대였던 성수는 카페와 매장의 거리가 되었습니다. 잠시 앉아 쉬려면 대개 무언가를 사야 하고, 걸어서 닿는 녹지는 많지 않습니다. 앉을 자리마다 값이 붙어 있습니다.',
    fact: { num: '+33%', label: '성수동카페거리 점포 수 462곳 → 613곳 (2021 → 2026)', src: '서울시 상권분석서비스 (한국경제 2026.9.3)', url: 'https://www.hankyung.com/article/202609016018H' },
  },
  {
    key: 'people', tag: '이웃', title: '가까이 살지만, 마주치지 않는 이웃',
    body: '청년과 어르신이 동네 인구의 60%를 차지합니다. 60세 이상은 10명 중 4명, 20대도 4명 중 1명이 어려울 때 도움받을 사람이 없다고 답합니다. 부담 없이 머물러야 서로 마주칠 수 있습니다.',
    fact: { num: '39.4%', label: '60세 이상 사회적 고립도 (20대 24.4%, 전체 33.0%)', src: '국가데이터처 「국민 삶의 질 2025」 · 지표누리', url: 'https://www.index.go.kr/unity/potal/indicator/IndexInfo.do?clasCd=8&idxCd=8080' },
  },
  {
    key: 'park', tag: '서울숲', title: '모두가 향하는 단 하나의 숲',
    body: '그래서 서울숲은 성수의 숨통입니다. 그런데 이 숲에도 주말의 인파, 여름의 열기, 고르지 않은 쉼터 때문에 오래 머물기 어려운 곳이 생기고 있습니다.',
  },
];

/* 문제의식 (2026-11-14 팀 합의) — 장 제목 = 문제의식 한 줄 */
export const PROBLEM = {
  home: { title: '좁은 집', line: '휴식을 집 밖에서 찾아야 한다' },
  paid: { title: '유료화된 거리', line: '성수에서는 돈을 내야 머물 수 있다' },
  alone: { title: '고립', line: '부담 없이 머물고 마주칠 곳이 없다' },
  park: { title: '서울숲마저', line: '마지막 숨통도 머물기 어려워지고 있다' },
};
// 이용자별로 '머물기' 위해 필요한 것 (가설 — 리뷰·설문으로 확인)
export const STAY_NEEDS = [
  { who: '1인 가구 청년', need: '혼자여도 편한 조용한 자리' },
  { who: '어르신', need: '가까운 그늘과 쉼터' },
  { who: '성수 직장인', need: '점심·퇴근 후 짧은 쉼' },
];

/* 05 두 가지 실천 → 기대 효과 */
export const ACTIONS_HOME = [
  {
    goal: 1, tab: 'citizen', when: '피한다 · 지금', title: '인파와 폭염을 피해, 지금 머물 자리로',
    text: '혼잡·체감온도·미세먼지를 매시간 판정해, 붐비거나 더운 곳 대신 지금 편히 머물 수 있는 장소와 길을 안내합니다.',
    solves: ['인파', '폭염'],
    effect: '몸을 지킨다', ev: '온열질환의 79.2%가 실외에서 발생', src: '질병관리청 2025', url: 'https://www.kdca.go.kr/bbs/kdca/42/215434/artclView.do',
  },
  {
    goal: 2, tab: 'expert', when: '고친다 · 앞으로', title: '머물기 어려운 자리를, 머물 수 있는 숲으로',
    text: '덥고 쉴 곳이 먼 자리를 20m 단위로 찾아, 그늘·쉼터·동선을 보완해 머물 수 있는 면적을 늘립니다.',
    solves: ['폭염', '휴식공간 불균형'],
    effect: '마음을 회복시킨다', ev: '녹지 노출이 많을수록 스트레스 호르몬·혈압이 낮음 (143개 연구)', src: 'Twohig-Bennett & Jones 2018', url: 'https://doi.org/10.1016/j.envres.2018.06.030',
  },
];

/* 02 누가 오나 */
export const PEOPLE = {
  title: '청년층과 고령층이 공존하는 1인 가구 밀집 지역',
  ageBars: [
    { label: '0–19세', value: 9.5 },
    { label: '20–30대', value: 31.3, hi: true },
    { label: '40–50대', value: 29.7 },
    { label: '60대 이상', value: 29.5, hi: true },
  ],
  ageSrc: '행정안전부 주민등록인구 2026.10 · 서울숲 옆 성수 4개 동 51,391명',
  ageUrl: 'https://jumin.mois.go.kr/ageStatMonth.do',
  solo: { value: '47.4', label: '혼자 사는 세대', src: '행정안전부 2026.10', url: 'https://jumin.mois.go.kr/etcStatHouseholds.do' },
  needs: [
    { who: '1인 가구 청년', need: '조용한 휴식 공간' },
    { who: '성수동 직장인', need: '짧고 시원한 산책로' },
    { who: '고령자·유아 동반 가족', need: '그늘·화장실·실내 대피 공간' },
  ],
};

/* 03 무엇에 만족하나 — 두 층, 근거는 층마다 2개 */
export const SATISFY = {
  title: '안전이 확보된 뒤에 회복이 만족으로 이어진다',
  plus: {
    title: '만족 요인', sub: '있을수록 만족', chips: ['회복', '활동', '발견', '연결'],
    evidence: [
      { who: '일반인', value: '55%', claim: '대형 공원 방문 목적 1위: 휴식', src: '한국리서치 2025', url: 'https://hrcopinion.co.kr/archives/31837' },
      { who: '연구', value: '주 120분', claim: '주 120분 이상 자연 체류 시 건강·웰빙 향상', src: 'White et al. 2019', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6565732/' },
    ],
  },
  basic: {
    title: '기본 요인', sub: '없으면 불만', chips: ['안전', '그늘', '쉼터·화장실', '혼잡 완화'],
    evidence: [
      { who: '전문가', value: '1위', claim: '공원 만족도 영향 요인 1위: 안전성', src: '서울시 23개 공원 분석, 한국조경학회지 2018', url: 'https://scienceon.kisti.re.kr/srch/selectPORSrchArticle.do?cn=JAKO201811459666816' },
      { who: '일반인', value: '44%', claim: '편의시설 만족도 44% — 절반 미만', src: '한국리서치 2025', url: 'https://hrcopinion.co.kr/archives/31837' },
    ],
  },
};

/* 04 목적·컨셉 */
export const CONCEPT = {
  name: '서울숲, 머무는 숲',
  purpose: '백 년간 서울에 물을 공급한 땅이, 이제 시민에게 회복을 공급한다',
  origin: '1908 서울 첫 정수장 뚝도수원지 → 2005 서울숲 개원',
  axes: [
    { key: '회복', icon: 'leaf', text: '조용한 숲·습지에서의 휴식' },
    { key: '활동', icon: 'walk', text: '그늘 산책로 걷기·달리기' },
    { key: '발견', icon: 'book', text: '곤충·나비 생태, 수돗물 100년 역사' },
    { key: '연결', icon: 'users', text: '가족·지인과 함께하는 여가' },
  ],
};
