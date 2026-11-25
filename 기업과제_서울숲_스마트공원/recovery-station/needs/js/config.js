// 선택지·기준값·가정값을 한곳에 모았습니다. 팀이 고칠 값은 이 파일만 보면 됩니다.
// (가정)이라고 적은 값은 근거 측정이 없는 값입니다. 현장 조사·설문 뒤에 바꿔야 합니다.

export const CENTER = { lat: 37.5443, lon: 127.0374 };          // 기존 대시보드와 같은 기준점(날씨 조회 위치)
export const SPEED = { normal: 70, slow: 53 };                    // 걷는 속도 m/분 = 4.2km/h, 3.2km/h (기존 대시보드와 같은 값)
// 걸어서 쓴 칼로리 = MET × 몸무게(kg) × 걸은 시간(h)
// MET: Ainsworth 외, 2011 Compendium of Physical Activities — 평지 2.0mph(3.2km/h) 2.8(코드 17152), 2.5mph(4.0km/h) 3.0(코드 17170)
// 몸무게 65kg는 (가정). 사람마다 다르므로 화면에는 '약'으로 보여 줍니다.
export const CALORIE = { met: { [SPEED.normal]: 3.0, [SPEED.slow]: 2.8 }, kg: 65 };

// ── 시민 화면 선택지 ─────────────────────────────────────────────
export const NEEDS = [
  { key: 'rest',   label: '앉아서 쉬기',  icon: 'leaf'  },
  { key: 'walk',   label: '걷기',        icon: 'walk'  },
  { key: 'play',   label: '놀기·체험',    icon: 'spark' },
  { key: 'active', label: '운동하기',     icon: 'run'   },
  { key: 'learn',  label: '구경·배우기',  icon: 'book'  },
  { key: 'meet',   label: '모임·피크닉',  icon: 'users' },
];
export const STAYS = [
  { key: 30,  label: '30분' },
  { key: 60,  label: '1시간' },
  { key: 120, label: '2시간' },
  { key: 180, label: '3시간 이상' },
];
// 같이 온 사람: 서울숲 SNS 연구(김지은 외 2019, 한국조경학회지 47(2))의 동반자 분류를 따름
// — 가족 65.3%, 연인 27.4%, 반려견 17.0%, 친구 5.8%, 혼자 1.5%(혼자는 사진을 덜 올려 적게 잡혔을 수 있음)
export const COMPANY = [
  { key: 'alone',   label: '혼자',     group: null },
  { key: 'couple',  label: '연인과',   group: 'youth' },
  { key: 'friends', label: '친구와',   group: 'youth' },
  { key: 'kids',    label: '아이와',   group: 'family' },
  { key: 'elders',  label: '어르신과', group: 'senior' },
  { key: 'pet',     label: '반려견과', group: 'pet' },
];

// 같이 온 사람마다 추천 점수 비중을 바꿉니다(아래 WEIGHTS에 덮어씀). 값은 가정이고, 근거는 방향만 정합니다.
//  혼자: 붐빔을 더 봄 — '일상 탈출' 동기가 만족도를 높임(조경진 외 2014), 같은 밀도도 목적에 따라 더 붐비게 느낌(Vaske & Shelby 2008)
//  연인: 걷기·경관과 날씨에 맞는 자리 — 경관이 만족도 2순위 요인(이재호·김순기 2018)
//  친구: 하고 싶은 일(모임·놀이) 비중을 높이고 붐빔은 덜 봄
//  아이·어르신: 화장실과 걷는 거리 — 가족 이용자에게 편의시설이 중요하지만 성취도가 낮음(이지연 2012)
//  반려견: 붐빔과 걷는 길(산책)
export const COMPANY_W = {
  alone:   { crowd: 20, need: 33 },
  couple:  { crowd: 14, thermal: 13 },
  friends: { need: 42, crowd: 8 },
  kids:    { toilet: 10, walk: 12 },
  elders:  { toilet: 10, walk: 12, thermal: 13 },
  pet:     { crowd: 16, walk: 10 },
};
// 반려견과 함께일 때 (가정 · 서울숲 공식 안내로 확인 필요): 건물 안과 어린이 놀이터는 빼고, 동물을 기르는 곳은 확인 필요로 표시
export const PET = { no: new Set(['forest-play']), noIndoor: true, check: new Set(['deer']) };

// '언제 가면 한산한가' 안내: 이 값 미만의 방문 수준(crowd.js dayCurve, 가장 붐비는 주말 한낮 ≈ 1)이면 한산하다고 봄 (가정)
// .45 = 평일 피크(12시, 17~20시)와 주말 10~20시를 뺀 시간이 한산으로 잡히는 값 (논문의 '평일 피크를 피한 시간'과 맞춤)
export const QUIET_LEVEL = .45;
export const ACTIVE_NEEDS = new Set(['walk', 'active', 'play']);    // 몸을 움직이는 일: 추위 기준을 낮게 봄

// 장소별 '하고 싶은 일' 적합도 0~1 (가정). 1.0에 가까운 값은 기존 대시보드의 프로그램 목적과 맞춘 것이고,
// 그보다 낮은 값은 장소 성격을 보고 팀이 정한 값입니다. 설문 결과가 나오면 이 표를 바꿉니다.
export const AFFINITY = {
  'family-lawn':  { rest: .7, walk: .3, play: .8, active: .5, learn: 0,  meet: 1  },
  'mirror-pond':  { rest: .6, walk: .5, play: .7, active: 0,  learn: .2, meet: .6 },
  'horse-plaza':  { rest: .2, walk: .3, play: .2, active: 0,  learn: .2, meet: .8 },
  'stage':        { rest: .5, walk: .2, play: .3, active: .2, learn: .2, meet: .8 },
  'courts':       { rest: 0,  walk: .2, play: .5, active: 1,  learn: 0,  meet: .3 },
  'visitor':      { rest: .4, walk: 0,  play: .2, active: 0,  learn: .9, meet: .2 },
  'forest-play':  { rest: .3, walk: .2, play: 1,  active: .4, learn: .2, meet: .3 },
  'insect':       { rest: .2, walk: 0,  play: .6, active: 0,  learn: 1,  meet: .1 },
  'butterfly':    { rest: .2, walk: 0,  play: .6, active: 0,  learn: .9, meet: .1 },
  'deer':         { rest: .6, walk: 1,  play: .5, active: .3, learn: .6, meet: .2 },
  'lake':         { rest: 1,  walk: .6, play: .2, active: 0,  learn: .1, meet: .6 },
  'wetland':      { rest: .8, walk: .9, play: .2, active: .2, learn: .6, meet: .2 },
  'culture-ctr':  { rest: .1, walk: 0,  play: .2, active: .9, learn: .2, meet: .2 },
  'water-museum': { rest: .2, walk: .2, play: .3, active: 0,  learn: .9, meet: .1 },
};
export const AFFINITY_DEFAULT = .3;       // 표에 없는 장소(나중에 추가된 거점)

// 물가 자리: 더운 날 시원함 점수에 더함(+WATER_BONUS). 근거: 조현민·권태경(2022) 한국조경학회지 50(6) — 서울숲 실측,
// 10~16시 수변부(중앙호수) 29.0℃ · 광장부(가족마당) 30.6℃ · 공원 밖 도로 35.1℃, 33℃ 넘는 시간엔 수변부가 광장부보다도 유의하게 시원함(30.8 vs 32.7℃).
// 다만 10~16시 평균과 체감 열스트레스(UTCI)에선 수변·광장 차이가 유의하지 않았고, 아침 5~9시엔 수변이 오히려 더 더웠음(같은 논문 p.35·38).
// → 기온 33℃ 이상 & 10~16시에만 보너스를 줌(WATER_ON). 습지생태원은 실측 지점이 아니라 같은 물가로 본 팀 가정
export const WATERSIDE = new Set(['lake', 'wetland']);
export const WATER_BONUS = .2;
export const WATER_ON = { temp: 33, from: 10, to: 16 };

// 장소정체성(이 자리가 서울숲다운가, 10점). 근거: 임승빈 외(2012) 국토계획 47(7) pp.77–90, Table 9 —
// 2011.5.28(토) 서울숲 18개 영역 × 30명 = 540명 설문, 전체 평균 6.73. 숲·잔디·물가·체험 프로그램 공간이 높고 방문자센터·습지가 낮음.
// '볼 게 별로였어요'를 고른 뒤에만 남은 코스에서 (값 − 평균) × 10점을 더함(−9~+7). 영역 안 표준편차(1.2~2.1)가 커서 작게만 씀.
// lake는 '수변휴게실(⑦)'로 본 추정, butterfly는 대응 영역 없음(빠짐). 2011년 자료라 지금 구성과 다를 수 있음(검증 필요)
export const PLACE_IDENTITY = {
  deer: 7.27, insect: 6.93, lake: 6.93, 'horse-plaza': 6.90, 'forest-play': 6.90,
  stage: 6.83, 'family-lawn': 6.70, 'mirror-pond': 6.67, wetland: 6.20, visitor: 5.80,   // ①방문자센터. 복합문화센터(culture-ctr)는 대응 영역 없음
};
export const IDENTITY_MEAN = 6.73;

// 구역별 붐빔 민감도(붐빔 점수에 곱함, 1 = 보통). 근거: 주연이·정진우(2026) 서울숲 블로그 990건 LDA —
// 생태숲·습지생태원은 '분위기·산책·자연' 경험이 중심이라 붐비면 경험 자체가 깨지고,
// 문화예술공원은 '웨이팅·주말·팝업'이 경험의 일부로 함께 나옴. 배수 값 자체는 팀 가정
export const CROWD_SENS = {
  'deer': 1.25, 'wetland': 1.25, 'lake': 1.15,
  'family-lawn': .85, 'mirror-pond': .85, 'horse-plaza': .85, 'stage': .85,
};
export const AFF_FIT = .45;              // 이 값 이상이면 '그 일을 할 수 있는 곳'으로 봄
export const AFF_MIN = .3;               // 이 값 미만인 곳은 추천에서 뺌

// 건물 안에 화장실이 있다고 본 실내 시설 (가정. 박물관·체육센터·안내센터·휴게실 건물)
export const TOILET_INSIDE = new Set(['visitor', 'lake', 'culture-ctr', 'water-museum']);
export const SNAP_PARK = 150;             // 출발점·거점이 공원 밖 막다른 길에 붙으면, 이 거리(m) 안의 공원 안 길에 대신 붙임

// 장소 한 줄 설명
export const PLACE_NOTE = {
  'family-lawn': '넓은 잔디마당', 'mirror-pond': '거울연못과 바닥분수', 'horse-plaza': '군마상 앞 광장', 'stage': '야외무대',
  'courts': '운동 코트', 'visitor': '안내·생태교육', 'forest-play': '숲속 놀이터', 'insect': '곤충·열대식물 관람',
  'butterfly': '나비 체험', 'deer': '생태숲 길과 사슴우리', 'lake': '호숫가 실내 휴게실', 'wetland': '습지 관찰 산책로',
  'culture-ctr': '실내 체육시설', 'water-museum': '수도박물관 전시',
};

// ── 운영시간 ────────────────────────────────────────────────────
// sure: true = 공식 자료로 확인 / false = 확인 못 해 보수적으로 잡은 값(화면에 '확인 필요'로 표시)
// closedDow: 휴관 요일(0=일 … 1=월) / seasons: 운영 월과 시각
export const HOURS = {
  'insect': { sure: true, fee: '무료', closedDow: [1],
    seasons: [{ months: [3, 4, 5, 6, 7, 8, 9, 10], open: 10, close: 17 }, { months: [11, 12, 1, 2], open: 11, close: 16 }],
    src: '서울시 미디어허브 2025.2.13 · 월요일 휴관, 3~10월 10~17시, 11~2월 11~16시' },
  'butterfly': { sure: true, fee: '무료', closedDow: [1],
    seasons: [{ months: [5, 6, 7, 8, 9, 10], open: 10, close: 17 }],
    src: '서울시 미디어허브 2025.2.13 · 5~10월에만 운영, 월요일 휴관' },
  'water-museum': { sure: false, fee: '무료', closedDow: [1],
    seasons: [{ months: 'all', open: 10, close: 18 }],
    src: '월요일 휴관·무료는 확인. 관람시간은 자료마다 달라 겹치는 10~18시로 계산' },
  'culture-ctr': { sure: false, fee: '이용료 확인 필요', closedDow: [],
    seasons: [{ months: 'all', open: 10, close: 17 }],
    src: '수영장·헬스장 등 강습 위주 체육시설(2022 개관 기사). 운영시간·요금 미확인' },
};
export const HOURS_DEFAULT_INDOOR = { sure: false, closedDow: [], seasons: [{ months: 'all', open: 10, close: 17 }], src: '운영시간 미확인 — 10~17시로 가정' };

// ── 판정 기준 ───────────────────────────────────────────────────
// 날씨 단계는 기존 대시보드와 같은 값입니다(주의/경고).
export const STAGE = [
  { key: 'feels', label: '더위',     caution: 31, warning: 33 },
  { key: 'uv',    label: '자외선',   caution: 6,  warning: 8 },
  { key: 'pm25',  label: '초미세먼지', caution: 36, warning: 76 },
  { key: 'pm10',  label: '미세먼지',  caution: 81, warning: 151 },
  { key: 'pop',   label: '비',       caution: 60, warning: Infinity },
];
export const HEAVY_RAIN = 15;              // mm/h 이상이면 경고 (기존 대시보드와 같음)
export const CROWD_STOP = .85;             // 수용 대비 이 비율 이상이면 '붐벼서 머물기 어려움' (기존 대시보드와 같음)
export const COLD = { still: 0, active: -8 };   // 체감 ℃ 미만이면 야외에 오래 머물기 어려움 (가정. 0℃는 팀의 '쾌적 시간' 기준과 같음)
export const COOL = 12;                    // 체감 ℃ 미만이면 그늘보다 볕 드는 자리가 낫다고 봄 (가정)
export const WARM = 26;                    // 체감 ℃ 이상이면 그늘이 중요하다고 봄 (가정)
export const NIGHT = { from: 22, to: 6 };  // 이 시간대의 야외 자리는 안내하지 않음 (가정)
export const LOOKAHEAD = 12;               // 몇 시간 앞까지 볼지
export const LATER_MAX = 3;                // '지금은 어렵지만 곧 가능한 곳'은 이 시간 안에 풀리는 곳만 추천에 넣음

// 추천 점수 가중치 (가정). 합이 100이 아니어도 됩니다(비율로 계산).
export const WEIGHTS = { need: 35, company: 15, stay: 20, crowd: 12, thermal: 10, toilet: 5, walk: 8 };

// ── 길·코스 ────────────────────────────────────────────────────
export const ROUTE_W = 2.5;                // 고른 조건(그늘·한산함)에 주는 가중치 (기존 대시보드의 '우선' 모드와 같은 크기)
export const STEP_PENALTY = 40;            // 계단 한 구간당 더하는 거리 m (기존 대시보드와 같음)
export const OUT_PENALTY = 1.5;            // 산책 코스가 공원 밖 길로 나가는 것을 꺼리는 정도
// 서울숲 실시간 인구를 받아 오는 중계 서버 주소(Supabase 'kaya' 프로젝트에 배포한 proxy/seoul-crowd · 서울시 장소 코드 POI101 '서울숲공원').
// 인증키는 Supabase 비밀값 SEOUL_API_KEY에만 있음. 비워 두면 실시간 표시를 숨기고 요일·시간대 추정만 씀
export const LIVE_CROWD_URL = 'https://krseuiwyftqbbdsbvycq.supabase.co/functions/v1/seoul-crowd';
// 기상청 단기예보(기온·습도·강수확률·강수량·바람, 지금~3일 뒤) 중계 서버(proxy/kma-forecast · 서울숲 격자 nx=61, ny=126).
// 인증키는 Supabase 비밀 보관함(Vault)의 'kma_api_key'에만 있음. 못 받으면 Open-Meteo만 씀
export const KMA_URL = 'https://krseuiwyftqbbdsbvycq.supabase.co/functions/v1/kma-forecast';
// 에어코리아 대기오염정보(성동구 측정소 실측 + 서울 미세먼지 예보 오늘~모레) 중계 서버(proxy/air-quality).
// 인증키는 Vault의 'airkorea_api_key'에만 있음. 못 받으면 Open-Meteo 대기질 모델값만 씀
export const AIR_URL = 'https://krseuiwyftqbbdsbvycq.supabase.co/functions/v1/air-quality';
// 서울시 공공서비스예약에서 '서울숲' 프로그램만 추린 중계 서버(proxy/seoul-programs). 키는 Vault 'seoul_api_key'
export const PROGRAMS_URL = 'https://krseuiwyftqbbdsbvycq.supabase.co/functions/v1/seoul-programs';
// 도착 평가(표정 3개) 익명 저장·집계 서버(proxy/comfort). 이름·기기·좌표·IP 없이 장소·표정·까닭·당시 날씨/붐빔만 저장
export const COMFORT_URL = 'https://krseuiwyftqbbdsbvycq.supabase.co/functions/v1/comfort';
// 오는 길·나가는 길 실시간(proxy/seoul-parking): 서울시 실시간 도시데이터(서울숲공원)의 주차장·도로·지하철·따릉이·전기차 충전기·재난문자
// + 한국교통안전공단 주차정보 API의 성동구 실시간 주차장(비밀값 DATA_GO_KR_KEY가 있을 때만)
export const ACCESS_URL = 'https://krseuiwyftqbbdsbvycq.supabase.co/functions/v1/seoul-parking';
export const PREF_DETOUR = 1.2;          // 그늘·한산함 조건: 가장 짧은 길의 이 배수(+20m)까지만 돌아가는 것을 허용
export const REST_DETOUR = 1.35;          // '쉼터' 조건: 가장 짧은 길의 이 배수까지 돌아가는 것을 허용
export const REST_NEAR = 30;               // 길에서 이 거리(m) 안에 있는 쉼터를 '지나는 쉼터'로 셈
export const COURSE_MIN = [20, 40, 60];

// ── 관리자 화면: 쉬기 어려운 곳 판정 기준 (가정. 기존 진단 화면의 기준을 따름) ──
export const REST_STD = {
  all:  { label: '일반 이용자',   seat: 150, toilet: 250, shade: .30, crowd: 60 },
  care: { label: '어르신·유아',   seat: 100, toilet: 150, shade: .50, crowd: 50 },
};
export const REST_REASONS = [
  { key: 'seat',   label: '앉을 곳이 멂',   short: '앉을 곳', color: '--series-1' },
  { key: 'shade',  label: '그늘이 없음',    short: '그늘',   color: '--g4' },
  { key: 'toilet', label: '화장실이 멂',    short: '화장실', color: '--v-buffer' },
  { key: 'crowd',  label: '붐빔',          short: '붐빔',   color: '--serious' },
];
export const HARD_FROM = 2;                // 네 가지 중 이 개수 이상 부족하면 '쉬기 어려운 곳'
export const SITE_DEFAULT = { bench: 10, shade: 8, toilet: 2 };

// ── 법적 구역 (data/legal.json: 브이월드 연속지적도 필지마다 토지이음 토지이용계획을 조회해 붙인 지정) ──
// 유수지·하천구역은 큰비 때 물이 차거나 빗물을 담는 곳입니다(legal.json의 zones[*].flood).
export const FLOOD_AFTER = 3;              // 큰비가 그친 뒤 이 시간 동안도 물이 차는 구역의 야외 자리는 추천하지 않음 (가정)
export const FLOOD_PENALTY = 4;            // 큰비 때 물이 차는 구역을 지나는 길 구간의 비용 배수 (가정. 산책 코스의 되짚기 벌점과 같은 크기)
export const LEGAL_COLOR = {
  park: '#3F6B5C', park_river: '#78AAC8', park_plant: '#9DB3A7', detention: '#2F4F6F', plant: '#B7793A', river: '#4F86B5', other: '#B9BBB5',
};

// ── AI ─────────────────────────────────────────────────────────
// 관리자 화면의 AI 도우미. 공식 Anthropic SDK(vendor/anthropic-sdk.mjs)로 Claude를 부릅니다.
export const AI = {
  model: 'claude-opus-5-5',
  maxTokens: 16000,                        // 답은 짧지만 생각하는 데 쓰는 토큰도 여기에 들어가므로 넉넉히 둠
  effort: 'medium',                        // low | medium | high — 값이 클수록 꼼꼼하지만 느리고 비쌈
  fallbackBeta: 'server-side-fallback-2026-07-01',   // 모델이 답을 거절했을 때 다른 모델로 이어 답하게 하는 설정
  keyStore: 'sf-needs-ai-key',             // 브라우저에 API 키를 넣어 두는 이름
};
