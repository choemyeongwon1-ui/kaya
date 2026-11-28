// 디지털트윈 개선 시뮬레이션 (관리자용) — [만족도] 화면(ops/index.html)의 「디지털트윈에서 개선안 만들기」로 들어온다.
// 개선안 = 대시보드 만족도 식(index.html sat: 붐빔 .35 · 날씨 .30 · 환경 .35)의 세 갈래를 각각 고치는 '공간 패키지'
//   붐빔 → 혼잡 시나리오(쾌적한 토요일) 혼잡률이 70%를 넘으면: 옆 칸으로 체류공간 확충(수용 인원↑) + 여유 있는 거점으로 분산 유도 안내(사람↓)
//   더위 → 폭염 시나리오(2026-08-07 체감 36.3℃, ERA5 재분석값) 체류공간 그늘 비율이 50%가 될 때까지 가장 효과 큰 자리에 그늘막·녹음수(햇빛 광선으로 계산)
//   환경 → 팀 20m 칸 점수(analysis/02_vulnerability.py 식)로 식재·잔디·쉴 곳 효과 → envScore(80m)
// 장면: Sky·하늘빛 환경광, 자료로 그린 바닥(숲·잔디·포장·길·나무 그늘), 창이 있는 건물, 나무 3종(가까우면 자세히), 사람(혼잡을 눈으로). three.js r170(vendor, MIT)
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';

const D = '../data/';
const CSV = '../../output/seoulforest_vulnerability_grid.csv';   // 02_vulnerability.py 원본 산출(team.json과 같은 칸 순서)
const LA = -2.755, LB = 2.434, RA = 32.1, RB = 444.5, EA = 39.3, EB = 508.1;   // 02_vulnerability.py 표준화 범위(5~95 백분위)
const WT = { heat: .35, crowd: .15, access: .25, air: .25 };
const K_TREE = -0.839, K_PAVE = 1.345;   // LST편차 ~ 수관비율 + 포장비율 (R² 0.21) — 산출 스크립트가 저장소에 없음(확인 필요). 팀 산출 단순회귀는 수관만 −1.61, R² 0.175(02_vulnerability.py·output/vuln.json)
const CELL_M2 = 400, CANOPY_M2 = 64, TOILET_M = 250;
const SW = { dens: .35, wx: .30, env: .35 };   // index.html sat()과 같은 가중치 — 시작할 때 index.html 결과와 맞는지 콘솔로 확인
// 두 상황: 붐빔은 날씨가 좋을 때, 더위는 여름 한낮에 문제가 됨(대시보드 식에서 폭염일엔 야외 거점 사람이 줄어듦)
const SCN = {
  crowd: { key: 'crowd', label: '혼잡 시나리오', day: '쾌적한 봄·가을 토요일', date: '5월 토요일', doy: 130, dow: 6, w: { feels: 21, pm25: 15, pop: 0 }, wTxt: '체감 21℃·초미세먼지 15 — 날씨 감점이 없는 날(가정)' },
  heat: { key: 'heat', label: '폭염 시나리오', day: '폭염일 토요일', date: '8월 7일 날씨', doy: 219, dow: 6, w: { feels: 36.3, pm25: 13, pop: 0 }, wTxt: '체감 36.3℃·초미세먼지 13 — 2026-08-07 15시 재분석 모델값(Open-Meteo ERA5·CAMS, 팀 climate.json)을 토요일에 적용' }
};
const OPT_HRS = [10, 12, 14, 16];
const STAY_R = 40, ENV_R = 80, NB_R = 450;
const CROWD_CUT = .7, NB_FREE = .55, SHIFT = .15, YARD_USE = .85, MAX_YARD = 6, SHADE_TARGET = .5, MAX_SHADE = 8;   // 가정값(패널·보고서에 표시)

const FAC = {
  yard: { label: '체류공간 확충' }, sign: { label: '혼잡 분산 유도 안내' },
  sail: { label: '대형 차양(그늘막)', roof: { hx: 4, hy: 4, h: 4 } }, tree: { label: '녹음수' }, bench: { label: '쉼터 벤치' },
  garden: { label: '계절 정원' }, photo: { label: '포토존' }, toilet: { label: '화장실' }
};
const BAD = { weather: '기상(더위·추위)', crowded: '혼잡', far: '접근성', boring: '경관·볼거리 부족', facility: '휴게·편의시설 부족' };
// A/B/C안 — 같은 거점·같은 계산식에서 쓸 수 있는 수단만 달리해 세 안을 만든다(공간 패키지의 부분집합)
//   A 운영 개선: 공사 없이 분산 유도 안내(정적 안내판·앱 알림) + 이동식 벤치
//   B 시설 보강: A + 대형 차양(그늘막)(철거·이동 가능한 구조물), 분산 유도 안내는 디지털 안내판
//   C 공간 재조성: B + 체류공간 확충(데크·잔디) + 녹음수 + 볼거리·편의(방문객 아쉬움에 맞춤)
const ALT = {
  A: { key: 'A', name: 'A안 · 운영 개선', short: '운영 개선', use: { key: 'A', shift: true, timeShift: true, sign: 'static', bench: true, benchAlways: true, benchN: 2, sail: false, tree: false, yard: false, extra: false },
    maint: '안내 문구·앱 알림 운영, 이동식 벤치 점검 — 시설 유지비 작음', pick: '예산·시간이 빠듯하거나, 근거가 더 쌓일 때까지 우선 운영으로 대응하고 싶을 때', period: '2~4주(가정)', proc: '시설 설치 없음 → 공원 관리 주체의 운영 결정으로 가능(확인 필요)',
    pros: ['공사 없이 혼잡 예보·앱 알림으로 피크 방문 분산', '이동식 벤치로 즉시 휴게공간 보강', '비용 최소 · 원상복구 용이'], cons: ['폭염(그늘 부족) 대응 불가', '분산 효과가 이용자 호응(가정 15%)에 좌우됨'] },
  B: { key: 'B', name: 'B안 · 시설 보강', short: '시설 보강', use: { key: 'B', shift: true, timeShift: true, sign: 'digital', bench: true, benchAlways: true, benchN: 4, sail: true, sailFixed: 2, tree: false, yard: false, extra: false },
    maint: '차양 강풍 대비 접기·정기 점검, 디지털 안내판 전기·통신 유지', pick: '올여름 더위 대책이 급하고, 철거·이동 가능한 시험 설치로 먼저 효과를 보고 싶을 때', period: '1~3개월(가정)', proc: '그늘막·안내판 설치 → 공원시설 설치 협의 필요(확인 필요)',
    pros: ['폭염 대응: 대형 차양(그늘막) 2개로 체류공간 그늘 확보', '벤치 8개로 휴게 수용력 보강', '디지털 혼잡 안내판으로 실시간 분산 유도', '철거·이동 가능 — 시험 설치 적합'], cons: ['강풍·태풍 시 차양 접기·점검 필요', '수용 인원 자체는 늘지 않음'] },
  C: { key: 'C', name: 'C안 · 공간 재조성', short: '공간 재조성', use: { key: 'C', shift: true, timeShift: true, sign: 'digital', bench: true, sail: true, tree: true, yard: true, extra: true },
    maint: '데크·잔디 보수, 녹음수 생육 관리(관수·전정), 화장실 청소 등 상시 관리', pick: '혼잡과 더위를 근본적으로 줄이고 수용 인원을 늘리는 장기 개선을 원할 때', period: '6~12개월(가정)', proc: '쉼터 확장·식재 → 공원조성계획 변경(경미한 변경 해당 여부) 검토 필요(확인 필요)',
    pros: ['쉼터를 넓혀 수용 인원 자체가 늘어남', '녹음수가 자라면 땅 온도·환경 점수가 함께 좋아짐'], cons: ['비용과 공사 기간이 가장 큼', '녹음수는 그늘이 다 차기까지 여러 해가 걸림', '공사 중 이용 제한'] }
};
// 팀이 고친 A·B·C안 — 이 브라우저에 저장(localStorage). 기본값은 ALT_DEF
const ALT_DEF = JSON.parse(JSON.stringify(ALT)), ALT_KEY = 'seoulforest-abc-v1';
const MEAS = [['shift', '분산 유도 안내'], ['bench', '벤치(휴게시설 원거리 구간)'], ['sail', '대형 차양(그늘막)'], ['tree', '녹음수'], ['yard', '체류공간 확충(데크·잔디)'], ['extra', '볼거리·편의(정원·포토존·화장실)']];
function loadAltEdits() { try { return JSON.parse(localStorage.getItem(ALT_KEY) || 'null'); } catch (e) { return null; } }
function applyAltEdits(e) {
  ['A', 'B', 'C'].forEach(k => {
    const d = ALT_DEF[k], x = (e && e[k]) || null, use = Object.assign({}, d.use, x && x.use, { key: k });
    const short = (x && x.short) || d.short;
    ALT[k] = Object.assign({}, d, x || {}, { key: k, short, name: k + '안 · ' + short, use, edited: !!x });
  });
}
applyAltEdits(loadAltEdits());
// 객관 근거 판정(만족도 + 3단 확인) — 만족도만으로는 주관적이라, 측정값으로 한 번 더 걸러 '확인된 문제'에만 시설안(B·C)을 권한다
//   ① 표본: 만족도 95% 신뢰구간 위쪽 끝도 60점 아래(평가 5건 이상)  ② 일치: 그 불만이 평가 시각의 실시간 측정과 맞음(Fisher, 공원 전체)
//   ③ 기준선: 공인 기준을 넘은 상황에서 나온 불만 2건 이상 — 혼잡 '약간 붐빔' 이상(서울시 실시간 도시데이터 4단계 중 3·4단계), 체감 35℃ 이상(기상청 폭염경보)
const SAT_CUT = 60, MIN_N = 5, OVER_N = 2;
const GRADE = {
  confirmed: { label: '문제 확인', act: '측정치가 이용자 불만을 뒷받침함 — 시설 대안(B·C) 검토 근거 있음', cls: 'g-conf' },
  perception: { label: '인식 문제', act: '만족도는 낮으나 측정치는 정상 범위 — 운영·안내(A안) 중심 검토 권장', cls: 'g-perc' },
  suspect: { label: '판정 유보 · 평가 더 필요', act: '통계적 판정 유보 — 시설 대안(B·C) 선택 시 설치 전후 평가로 효과 검증 필요', cls: 'g-susp' },
  latent: { label: '잠재 문제', act: '만족도는 양호하나 기준 초과 상황 존재 — 예방적 검토 필요', cls: 'g-lat' },
  ok: { label: '개선 불필요', act: '만족 확인 — 대안을 만들지 않음', cls: 'g-ok' },
  few: { label: '평가 부족', act: '평가 ' + MIN_N + '건 미만 — 판정 보류', cls: 'g-few' }
};
// 개략 단가(원) — lo~hi 범위. 공식·원문 출처가 있는 값만 넣고, 못 찾은 항목은 null('견적 필요')로 둔다(2026-11-28 조사).
//   inc: 단가에 들어간 범위(자재만/노무비만/설치 포함) · ref: 참고만 하는 유사 품목(합계에 넣지 않음)
const GARDEN_M2 = 24;   // 계절 정원 한 곳 넓이 — 3D 모형 화단 7.0×3.4m(약 24㎡)
const COST = {
  deck: { label: '데크 쉼터', unit: '㎡', lo: 120000, hi: 120000, inc: '데크재 자재비만 — 설치비 별도(설치 포함 단가는 못 찾음)', src: '대전 대덕구 2026 본예산 세출예산사업명세서(공원녹지과) 「목재(판재,데크재) 120,000원×220㎡」 — https://www.daedeok.go.kr/document/ftp/ftp02/2026/00/3/21.pdf' },
  lawn: { label: '잔디 쉼터(평떼 붙임)', unit: '㎡', lo: 5406, hi: 5406, inc: '노무비만, 잔디 재료비 별도', src: '국토교통부·한국건설기술연구원 「2025년 상반기 건설공사 표준시장단가」 DK520 잔디붙임(평떼)' },
  bench: { label: '벤치(등의자)', unit: '개', lo: 475000, hi: 1000000, inc: '예산·기부 단가(설치 포함 여부 원문에 없음)', src: '대구 북구 2023 본예산(공원녹지과) 「의자(등의자,평의자) 475,000원×20개소」 · 강남구 「우리동네 초록기부 챌린지」 2026-01-09 「2인용 벤치 100만원」' },
  signS: { label: '분산 유도 안내(정적 안내판·앱 알림)', unit: '식', lo: 11400000, hi: 12000000, inc: '지주식 종합안내판 1,400×2,320 기준(업체 견적 1곳) — 작은 유도 사인이면 더 낮음, 앱 알림은 0원', src: '부산 남구의회 제342회 기획행정위원회 회의록 2025-12-05(오륙도 종합안내판 견적 1,140만·1,200만원)' },
  signD: { label: '분산 유도 안내(디지털 안내판)', unit: '대', lo: 12000000, hi: 12950000, inc: '지자체 실제 취득가(화면 크기 미상)', src: '부산 남구의회 제342회 기획행정위원회 회의록 2025-12-05(디지털 안내판 11개소 1억4,250만원 → 대당 약 1,295만원, 답변 「1,200만원 정도」)' },
  sail: { label: '대형 차양(그늘막)(8×8m)', unit: '개', lo: 9500000, hi: 32000000, inc: '근거 약함 — 낮은 값은 파고라 1개소 교체 예산, 높은 값은 막구조 그늘막 30㎡ 1,500만원을 64㎡로 늘린 값', src: '대구 북구 2023 본예산 「파고라 9,500,000원×2개소」 · 부산시 주민참여예산 제안 「도심 속 테마공원 조성」 2021-03-31 「그늘막 15백만원(30㎡)」(제안자 산정)' },
  tree: { label: '녹음수(느티나무 H4.5×R15~R20)', unit: '주', lo: 499000, hi: 867000, inc: '수목값만(유통가), 식재 품 별도: 1주당 조경공 0.25인·보통인부 0.083인·굴착기 0.083대(2025 건설공사 표준품셈 4-3-5)', src: '한국농촌경제연구원(KREI) 임업관측 2025.12 조경수 가격조사 — 설계 가격으로는 부적절하다고 원문에 명시' },
  garden: { label: '계절 정원(초화)', unit: '㎡', lo: 40000, hi: 128000, inc: '초화 자재비만(1,000~2,000원/본 × 40~64본/㎡), 식재 품 별도', src: '대구 북구 2023 본예산 「초화구입 1,000원/본」 · 대덕구 2026 본예산 「경관조성용초화류 2,000원/본」 · 수원시 저관리형 도시공원 숲 조성 매뉴얼(2021.12) 표3-4 식재밀도 40~64본/㎡' },
  photo: { label: '포토존', unit: '식', lo: 13360000, hi: 56070000, inc: '조형물 제작·설치 계약·예산 범위', src: '나주시 영산강 정원 조형물(뉴시스 2024-10-28, 1,336만~4,100만원) · 목포시 2023 추경 「평화광장 포토존 30,000,000원×1식」 · 평창군 겨울축제 포토존 제작·설치 계약 56,070,000원(2023-12-14)' },
  toilet: { label: '모듈형 화장실', unit: '동', lo: 77600000, hi: 200000000, inc: '관급자재 구입·제작 사례 범위(수량·유형 일부 불명확)', src: '고성군 거진체육공원 이동식화장실 관급자재 구입 77,600,000원(2021-12-20, 쇼핑몰 주문) · 당진시 차량형 공중화장실 2억원(중부매일 2025-05-18)' },
};
// 공문 머리·끝 — 학생팀은 행정기관이 아니므로 결재란·생산등록번호 없이 공문 형식을 빌린 '협조 요청'으로 쓴다
//   수신: 서울숲은 2022년부터 서울시 직영(서울신문 2021-11-21) → 서울특별시 동부공원여가센터(공원여가과)·서울숲관리사무소
const DOC = { from: '서울숲관리사무소 ○○팀', to: '동부공원여가센터장', cc: '성동구청 공원녹지과(협의)',   // 대시보드를 쓰는 공원 관리 담당자가 올리는 내부 검토 보고(부서명·담당자는 빈칸)
  contact: '담당자 ○○○ · 연락처 ○○○-○○○○-○○○○ · 전자우편 ○○○@○○○' };
// 법적 근거 — 「도시공원 및 녹지 등에 관한 법률」(법률 제21039호, 2026.8.27 시행) 국가법령정보센터 현행 본문 대조(2026-11-28)
const LAW = {
  rel: '「도시공원 및 녹지 등에 관한 법률」 제10조의2(공원녹지정보체계 구축·운영), 제19조(도시공원의 설치 및 관리)',
  lines: ['「도시공원 및 녹지 등에 관한 법률」 제10조의2(공원녹지정보체계 구축·운영, 2025.8.26 신설·2026.8.27 시행): 국토교통부장관은 공원녹지의 확충·관리 및 이용자의 편의증진을 위하여 공원녹지정보체계를 구축·운영하여야 한다 — 이용자 평가·공간 자료로 개선안을 만드는 이 제안의 취지와 같음',
    '같은 법 제19조(도시공원의 설치 및 관리) ①: 도시공원은 특별시장·광역시장·특별자치시장·특별자치도지사·시장 또는 군수가 공원조성계획에 따라 설치·관리한다 — 서울숲의 설치·관리 주체(서울특별시)와 협의가 필요한 이유'],
  c: '같은 법 제16조의2(공원조성계획의 결정) ②·③: 공원조성계획을 변경할 때의 절차와, 공원의 주제·특색을 바꾸지 않는 변경의 간이 절차 — C안(쉼터 확장·식재)을 고를 경우 해당 여부 확인 필요'
};
// 필요성 근거 — 동료심사 논문(DOI)과 팀 분석만. [k] = REFS 번호
const REFS = [
  'Armson, D., Stringer, P., Ennos, A.R. (2012). The effect of tree shade and grass on surface and globe temperatures in an urban area. Urban Forestry & Urban Greening 11(3), 245–255. doi:10.1016/j.ufug.2012.05.002',
  '조상만·현철지·박수국 (2017). 여름철 인간 열환경지수에 미치는 가로수의 영향 분석. 한국조경학회지 45(5), 105–112. doi:10.9715/KILA.2017.45.5.105',
  'Brown, A., Kappes, J., Marks, J. (2013). Mitigating Theme Park Crowding with Incentives and Information on Mobile Devices. Journal of Travel Research 52(4), 426–436. doi:10.1177/0047287512475216',
  'Immitzer, M. et al. (2019). Optimal Input Features for Tree Species Classification in Central Europe Based on Multi-Temporal Sentinel-2 Data. Remote Sensing 11(22), 2599. doi:10.3390/rs11222599',
  'ESA WorldCover 10 m (Microsoft Planetary Computer STAC API, esa-worldcover) · Landsat 지표온도 — 팀 analysis/01_fetch.py·02_vulnerability.py',
  '서울특별시 푸른도시국·서울기록원 (2020). 「시민의 숲을 기록하다, 서울숲」 전시 — 서울숲의 식물(수종별 그루 수·키)',
  '서울특별시 (2026). 2027년 시민참여예산 사업제안서 양식(작성요령 포함) — https://news.seoul.go.kr/gov/archives/575588'
];
// ---------- 만족도가 오르는 이유·대상지 의도 근거 (원문 확인, 2026-11-28 조사) ----------
// CITE: 근거 목록. 화면에는 짧은 이름(s), 검토 보고서 참고문헌에는 전체(f)
const CITE = {
  zhan: { s: 'Zhan 외 2024', f: 'Zhan, P., Guo, Q., Chen, H.-L., Wu, Y. (2024). Landscape and Urban Planning 245, 105015. doi:10.1016/j.landurbplan.2024.105015' },
  np: { s: '국립공원 혼잡지각 연구 2016', f: '「국립공원 탐방객의 혼잡지각이 감정, 만족, 태도 및 행동의도에 미치는 영향」 관광연구저널 30(11):121–134, 2016 (치악산, 400명) — 저자·DOI 검증 필요' },
  lin09: { s: 'Lin 2009', f: 'Lin, T.-P. (2009). Building and Environment 44(10), 2017–2026. doi:10.1016/j.buildenv.2009.02.004' },
  lin13: { s: 'Lin 외 2013', f: 'Lin, T.-P., Tsai, K.-T., Liao, C.-C., Huang, Y.-C. (2013). Building and Environment 59, 599–611. doi:10.1016/j.buildenv.2012.10.005' },
  colter: { s: 'Colter 외 2019', f: 'Colter, K.R., Middel, A.C., Martin, C.A. (2019). Urban Forestry & Urban Greening 44, 126429. doi:10.1016/j.ufug.2019.126429' },
  cho22: { s: '조현민·권태경 2022(서울숲 실측)', f: '조현민·권태경 (2022). Effects of Urban Park on Thermal Comfort in Summer(서울숲 미기후). 한국조경학회지 50(6), 30–41. doi:10.9715/KILA.2022.50.6.030' },
  whyte: { s: 'Whyte 1980', f: 'Whyte, W.H. (1980). The Social Life of Small Urban Spaces. Conservation Foundation (2장 Sitting Space)' },
  ottoni: { s: 'Ottoni 외 2016', f: 'Ottoni, C.A. et al. (2016). "Benches become like porches". Social Science & Medicine 169, 33–41. doi:10.1016/j.socscimed.2016.08.044' },
  chv: { s: 'Chvirova 외 2026', f: 'Chvirova, D., Menke, F., Buchwald, A., Keller, R., Niemeijer, C. (2026). Electronic Markets 36, 26. doi:10.1007/s12525-026-00874-3' },
  yang: { s: 'Yang 외 2020', f: 'Yang, G., Han, Y., Gong, H., Zhang, T. (2020). Sustainability 12(8), 3478. doi:10.3390/su12083478' },
  brown: { s: 'Brown 외 2013', f: 'Brown, A., Kappes, J., Marks, J. (2013). Journal of Travel Research 52(4), 426–436. doi:10.1177/0047287512475216' },
  hassall: { s: 'Hassall 외 2024', f: 'Hassall, C. et al. (2024). Land 13(3), 290. doi:10.3390/land13030290' },
  felappi: { s: 'Felappi 외 2024', f: 'Felappi, J.F. et al. (2024). Scientific Reports 14, 4856. doi:10.1038/s41598-024-55357-2' },
  ulrich: { s: 'Ulrich 1984', f: 'Ulrich, R.S. (1984). Science 224(4647), 420–421. doi:10.1126/science.6143402' },
  dsw: { s: '동심원조경 설계 설명', f: '(주)동심원조경기술사사무소, 「서울숲 현상 및 실시설계」 — https://www.dongsimwon.com/blog/portfolio_page/서울숲-현상-및-실시설계-2005/' },
  tour: { s: '설계자 투어 2018', f: '서울숲컨서번시, 「[리뷰] 설계자와 함께하는 서울숲 투어」 2018.7.13 — https://seoulforest.or.kr/12784' },
  s04: { s: '서울시 2004 개장 준비 기사', f: '서울시 내 손안에 서울, 「내년 4월 개장 앞둔 서울숲 마무리 공사 한창」 2004.12.22 — https://mediahub.seoul.go.kr/archives/147141' },
  s24: { s: '서울시 2024 서울숲 소개', f: '서울시 내 손안에 서울, 2024.4.24 — https://mediahub.seoul.go.kr/archives/2010950' },
  s26: { s: '서울시 2026 물놀이 명소', f: '서울시 내 손안에 서울, 「무료 물놀이 명소 10선」 2026.7.27 — https://mediahub.seoul.go.kr/archives/2018803' },
  expo: { s: '2026 정원박람회 공지', f: '서울시 2026 서울국제정원박람회 공지(군마상·잔디마당 일대 출입 제한) — https://www.seoul.go.kr/festa/garden/y2026/news-resources/notice?article=41356' },
  law: { s: '도시공원법 제16조의2③', f: '「도시공원 및 녹지 등에 관한 법률」 제16조의2제3항 — 공원의 주제·특색을 바꾸지 않는 소규모 공원시설 설치 등은 위원회 심의·주민의견 청취 생략 가능(2009 판본 확인, 현행 문언 확인 필요)' }
};
// 수단마다: 무엇이 바뀌어 → 어느 요인이 → 왜 만족도가 오르나(근거)
const WHY = {
  sign: { chain: '붐비는 시간에 안내 → 일부가 옆 거점·다른 시간으로 → 이곳 혼잡률 ↓ → 「붐빔」 점수 ↑', ev: [['실시간 분산 안내를 받으면 66.5%가 행동을 바꾸겠다고 답함(이화원 시뮬레이션)', 'yang'], ['테마파크 현장조사 2회에서 다수가 모바일 안내에 따라 동선을 바꿀 의향', 'brown']], lim: ['도시형 관광지에서는 온라인 정보가 오히려 혼잡을 더 느끼게 한 결과도 있어, 설치 뒤 평가로 확인', 'chv'] },
  yard: { chain: '앉고 머물 공간을 넓힘 → 같은 인원이어도 혼잡률 ↓ → 「붐빔」 점수 ↑', ev: [['느끼는 혼잡이 클수록 만족·재방문 의향이 낮아짐(도시공원)', 'zhan'], ['사람 수보다 「공간이 비좁다」는 느낌이 부정적 감정을 키움(치악산 400명)', 'np']] },
  sail: { chain: '체류공간 그늘 ↑ → 폭염일 체감 열부담 ↓ → 「날씨」 점수 ↑', ev: [['더운 계절엔 더울수록 공원 방문이 줄어듦', 'lin09'], ['그늘 수준에 따른 열쾌적 범위가 계절별 방문자 수를 크게 바꿈', 'lin13'], ['서울숲 실측: 한낮(10~16시) 광장부가 공원 밖 도로보다 5.5℃ 낮음', 'cho22']] },
  tree: { chain: '그늘 + 땅 온도 ↓ + 초록 경관 → 「날씨」·「환경」 점수 ↑', ev: [['일사를 잘 막는 나무 그늘은 차양 구조물보다 체감온도(PET)를 2.9~4.3℃ 더 낮춤', 'colter'], ['나무가 늘수록 회복감이 커지지만 빽빽하면 포화', 'hassall'], ['수관이 많을수록 회복 효과, 단 안전감이 함께 중요', 'felappi']] },
  bench: { chain: '쉴 곳까지 거리 ↓ → 오래 머물 수 있음 → 「환경」 점수 ↑', ev: [['사람은 앉을 곳이 있는 곳에 머묾 — 광장 관찰 연구', 'whyte'], ['벤치가 고령자의 공원 이용·이동·만남을 가능하게 함', 'ottoni']] },
  garden: { chain: '「볼거리 부족」 불만 대응 — 점수 계산에는 넣지 않음', ev: [['자연 경관을 보는 것만으로 회복이 빨라짐(병원 연구)', 'ulrich']] },
  photo: { chain: '「볼거리 부족」 불만 대응 — 점수 계산에는 넣지 않음', ev: [] },
  toilet: { chain: '「편의시설 부족」 불만 대응 — 점수 계산에는 넣지 않음', ev: [] }
};
// 대상지 의도: 장소별 원래 용도·경관 의도와, 수단별 맞음(ok)·주의(warn)·충돌(no)
const INTENT_ALL = { t: '설계 원안은 「고정적인 시설이 아닌 참여를 통해 변화할 수 있는 가변적인 공간」을 내세움 → 고정 구조물보다 탈착·이동식을 먼저', src: 'dsw' };
const INTENT_ZONE = {
  '문화예술공원': { t: '서울숲광장·야외무대 등 시민 여가활동 공간', src: 's04' },
  '자연생태숲': { t: '야생동물 서식처 재현 — 일부는 사람 출입 통제가 조성 의도, 동물은 보행가교에서 관찰', src: 's04', rule: { bench: ['warn', '출입 가능한 동선·가교에만'], yard: ['no', '숲 안쪽 쉼터 확장은 서식처 교란'], sign: ['warn', '밝은 안내판은 동선 입구에만'], sail: ['warn', '숲 안 구조물 대신 기존 수관 활용'], tree: ['ok', '자생 수종으로 보식'] } },
  '체험학습원': { t: '옛 정수장 시설을 고쳐 쓴 식물 학습·감상 공간', src: 's04' },
  '습지생태원': { t: '유수지 기능을 유지하며 서울숲과 중랑천 생태를 잇는 공간', src: 's04', rule: { yard: ['no', '포장·성토는 빗물 담는 기능을 해침'], sail: ['warn', '탈착식만'], bench: ['warn', '관찰대·환경놀이터 주변만'] } }
};
const INTENT = {
  'mirror-pond': { t: '수심 3cm 거울연못에 메타세쿼이아 길이 비치는 반영 경관(서울숲 대표 포토존) + 여름 가족 물놀이 바닥분수(2026년 8/30까지, 12~16:30), 쿨링포그 쉼터 이미 있음', src: ['s24', 's26'],
    rule: { sail: ['warn', '수면·분수 위 고정 구조물은 물놀이 동선·반영 경관을 가림 → 바깥 테두리, 운영 기간 탈착식'], tree: ['warn', '반영되는 메타세쿼이아 길 시야 밖, 가장자리에'], yard: ['warn', '포장 확장 대신 잔디 쉼터로'], bench: ['ok', '연못·분수 바깥 테두리에'], sign: ['ok', '낮은 높이로'], photo: ['warn', '이미 대표 포토존 — 조형물 중복은 불필요'], garden: ['ok', '테두리 화단'] } },
  'family-lawn': { t: '「다양한 문화 행사가 열리는 탁 트인 잔디밭」 — 2026 정원박람회 때도 행사장으로 씀', src: ['s24', 'expo'],
    rule: { sail: ['no', '잔디 중앙 고정 그늘막은 행사 면적·시야를 막음 → 탈착식만'], tree: ['warn', '가장자리에만'], yard: ['warn', '잔디 면적을 줄이지 않게'], bench: ['ok', '이동식 의자'], sign: ['ok', ''] } },
  'stage': { t: '야외무대 — 공연·행사 공간', src: ['s04'],
    rule: { sail: ['warn', '무대 시야를 막지 않는 객석 가장자리, 탈착식'], tree: ['warn', '무대 조망축 밖'], yard: ['warn', '객석 잔디 유지'], bench: ['ok', '이동식'] } },
  'horse-plaza': { t: '경마장의 기억을 담은 군마상(「START」, 새로운 도약) — 정문 진입부 상징', src: ['tour', 's24'],
    rule: { sign: ['warn', '상징물 조망을 가리지 않게 낮게·측면에, 디지털 안내 우선'], sail: ['warn', '군마상 조망 축 밖'], tree: ['warn', '조망 축 밖'], bench: ['ok', '광장 가장자리'], yard: ['warn', '진입부 개방감 유지'] } },
  'deer': { t: '사슴 방사 서식처 — 방문객은 보행가교 위에서 관찰', src: ['s04'] },
  'wetland': { t: '유수지 기능 유지 + 조류관찰대·환경놀이터', src: ['s04'] }
};
// 안마다 최선: 계산 수단이 못 다루는 문제를 그 안의 성격(A 운영 · B 소규모 시설 · C 공간)에 맞는 보완 수단으로 채움 — 점수 계산 밖, 설치 후 평가로 확인
const SUPP = {
  A: {
    '더위': { t: '폭염 시간대 실내 시원한 곳 안내 + 그늘 쪽 길 안내', d: '체감 31℃ 넘는 시간에 안내판·앱으로 곤충식물원·나비정원(실내) 위치와 그늘 따라 걷는 길을 알림', cost: 0, costT: '0원 — 분산 안내 화면·앱에 함께 표시', ev: ['더운 계절엔 더울수록 공원 방문이 줄어듦 — 시원한 대안을 알려 이탈을 줄임', 'lin09'], intent: ['ok', '시설 설치 없음'] },
    '쉴 곳': { t: '혼잡 시간 이동식 의자 배치', d: '주말 피크 시간에만 접이식 의자를 꺼내 두고 저녁에 거둠', cost: 'bench2', costT: '', ev: ['사람은 앉을 곳이 있는 곳에 머묾', 'whyte'], intent: ['ok', '쓰지 않을 땐 치움 — 가변적 공간'] },
    '볼거리': { t: '계절 해설·체험 프로그램 연계', d: '서울숲 기존 숲 해설·체험 프로그램 집결지를 이곳으로 잡아 붐비지 않는 시간대에 운영', cost: 0, costT: '0원 — 기존 프로그램 장소 조정', ev: ['자연 경관을 보는 것만으로 회복이 빨라짐', 'ulrich'], intent: ['ok', '설계 원안 「참여의 숲」과 맞음'] },
    '편의': { t: '가까운 화장실 길 안내', d: '안내판·앱에 가장 가까운 화장실 방향과 거리 표시', cost: 0, costT: '0원 — 분산 안내 화면에 함께 표시', ev: null, intent: ['ok', '설치 없음'] }
  },
  B: {
    '쉴 곳': { t: '그늘막 아래 벤치 보강', d: '그늘막 아래·가장자리에 벤치 추가', cost: 'bench2', costT: '', ev: ['사람은 앉을 곳이 있는 곳에 머묾', 'whyte'], intent: ['ok', '가장자리에'] },
    '볼거리': { t: '이동식 계절 화분(플랜터) 20㎡', d: '광장 가장자리에 계절 초화 플랜터를 놓고 철마다 바꿔 심음', cost: 'garden20', costT: '', ev: ['자연 경관을 보는 것만으로 회복이 빨라짐', 'ulrich'], intent: ['ok', '옮길 수 있어 행사 때 치움'] },
    '편의': { t: '화장실 방향 안내 추가', d: '분산 안내판에 가장 가까운 화장실 방향·거리 표시', cost: 0, costT: '0원 — 안내판 문안에 포함', ev: null, intent: ['ok', '설치 없음'] },
    '혼잡': { t: '혼잡 시간 이동식 의자·동선 정리', d: '붐비는 시간 동선을 줄 세워 병목을 풀고 대기 공간에 이동식 의자', cost: 'bench2', costT: '', ev: ['사람 수보다 「공간이 비좁다」는 느낌이 부정적 감정을 키움', 'np'], intent: ['ok', '가변적'] }
  },
  C: {
    '쉴 곳': { t: '쉼터 둘레 벤치 보강', d: '넓힌 쉼터와 거점 사이 먼 쪽에 벤치 추가', cost: 'bench2', costT: '', ev: ['사람은 앉을 곳이 있는 곳에 머묾', 'whyte'], intent: ['ok', '가장자리에'] },
    '더위': { t: '쉼터 둘레 녹음수 3주 보식', d: '넓힌 쉼터 남·서쪽에 녹음수 3주(수목값, 식재 품 별도)', cost: 'tree3', costT: '', ev: ['일사를 잘 막는 나무 그늘은 차양 구조물보다 체감온도를 더 낮춤', 'colter'], intent: ['warn', '조망 축 밖에'] },
    '편의': { t: '가까운 화장실 길 안내', d: '안내판에 가장 가까운 화장실 방향·거리 표시', cost: 0, costT: '0원 — 안내판 문안에 포함', ev: null, intent: ['ok', ''] },
    '볼거리': { t: '계절 정원 확대', d: '쉼터 가장자리를 계절 정원으로', cost: 'garden20', costT: '', ev: ['자연 경관을 보는 것만으로 회복이 빨라짐', 'ulrich'], intent: ['ok', ''] }
  }
};
const NEED = {
  crowd: ['테마파크 현장연구 2회(910명·1,370명)에서 방문객 다수가 모바일 정보·인센티브에 따라 동선을 바꿀 의향을 보였고, 저자들은 이런 안내가 혼잡 분포를 실시간으로 완화할 수 있다고 결론지었다 [3]. 대상 거점은 이용자 「혼잡」 응답과 예상 혼잡률이 함께 높아 분산 유도 안내·쉼터 확장이 필요하다.'],
  heat: ['나무 그늘은 햇빛을 받는 콘크리트·잔디보다 최고 표면온도를 최대 19℃, 흑구온도를 5~7℃ 낮췄다(영국 맨체스터 현장 측정) [1]. 국내(제주 가로수 5종) 여름 측정에서도 수목 그늘은 양지보다 체감 열환경지수 PET를 21.2~31.3% 낮췄다 [2]. 폭염일 체류공간 그늘 비율이 목표(50%)에 못 미치면 그늘막·녹음수가 필요하다.'],
  tree: ['녹음수는 그늘과 함께 땅 온도도 낮출 수 있다. 팀 Landsat 분석(서울숲 20m 칸, 수면 제외)에서 수관 비율 100%당 지표온도 편차가 −1.61℃였다(R² 0.175 — 설명력이 낮아 참고값) [5].'],
  base: ['진단은 이용자 평가(대시보드 도착 평가)와 공간 자료(위성·지도) 두 갈래로 했고, 개선 효과는 같은 계산식으로 A·B·C안을 비교해 공사 규모가 작은 안부터 검토했다.']
};
const won = v =>v == null ? '—' : v >= 1e8 ? (v / 1e8).toFixed(v >= 1e9 ? 0 : 1) + '억' : v >= 1e4 ? Math.round(v / 1e4).toLocaleString() + '만' : Math.round(v).toLocaleString();
const wonR = (lo, hi) => lo == null ? '견적 필요' : won(lo) + (hi > lo ? '~' + won(hi) : '') + '원';
const REC = { weather: '차양시설·녹음수', crowded: '체류공간 확충·분산 유도', far: '휴게·편의시설', boring: '경관 연출(계절정원·포토존)', facility: '휴게·편의시설' };

const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = v => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const J = u => fetch(u, { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); });
const TX = u => fetch(u, { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error(u + ' ' + r.status); return r.text(); });
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const hm = v => { const a = Math.floor(v), m = Math.round((v - a) * 60); return String(a).padStart(2, '0') + ':' + String(m).padStart(2, '0'); };
const f1 = v => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1);
const pc = v => Math.round(v * 100) + '%';
const DIR8 = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
const POP = new Uint8Array(65536); for (let i = 1; i < 65536; i++) POP[i] = POP[i >> 1] + (i & 1);
const NUM = '①②③④⑤⑥⑦⑧⑨⑩';

// 해 위치: 적위·균시차(NOAA 일반식) → 고도·방위각(도, 북에서 시계 방향)
export function sunPos(hour, doy) {
  const s = { lat: 37.544, lon: 127.043, tz: 9 }, g = 2 * Math.PI / 365 * (doy - 1 + (hour - 12) / 24);
  const eq = 229.18 * (.000075 + .001868 * Math.cos(g) - .032077 * Math.sin(g) - .014615 * Math.cos(2 * g) - .040849 * Math.sin(2 * g));
  const de = .006918 - .399912 * Math.cos(g) + .070257 * Math.sin(g) - .006758 * Math.cos(2 * g) + .000907 * Math.sin(2 * g) - .002697 * Math.cos(3 * g) + .00148 * Math.sin(3 * g);
  const tst = hour * 60 + eq + 4 * s.lon - 60 * s.tz, ha = (tst / 4 - 180) * Math.PI / 180, la = s.lat * Math.PI / 180;
  const cz = Math.sin(la) * Math.sin(de) + Math.cos(la) * Math.cos(de) * Math.cos(ha), zen = Math.acos(Math.max(-1, Math.min(1, cz)));
  const az = (Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(la) - Math.tan(de) * Math.cos(la)) * 180 / Math.PI + 180) % 360;
  return { alt: 90 - zen * 180 / Math.PI, az };
}
function sunDir(hour, doy) { const p = sunPos(hour, doy), a = p.alt * Math.PI / 180, z = p.az * Math.PI / 180; return { x: Math.sin(z) * Math.cos(a), y: Math.cos(z) * Math.cos(a), z: Math.sin(a), alt: p.alt, az: p.az }; }

const RAMP = [[15, [47, 158, 107]], [30, [150, 205, 92]], [39.7, [242, 211, 91]], [49.1, [245, 150, 74]], [55.8, [229, 72, 77]], [66, [170, 30, 58]]];
function ramp(v) {
  if (v <= RAMP[0][0]) return RAMP[0][1];
  for (let i = 1; i < RAMP.length; i++) if (v <= RAMP[i][0]) { const t = (v - RAMP[i - 1][0]) / (RAMP[i][0] - RAMP[i - 1][0]), a = RAMP[i - 1][1], b = RAMP[i][1]; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  return RAMP[RAMP.length - 1][1];
}
const pctColor = p => p >= 85 ? 0x2fbf7f : p >= 75 ? 0xe8b93a : 0xf07a3a;
const pctCss = p => p >= 85 ? '#6af5b0' : p >= 75 ? '#f5d58a' : '#ff9d5c';

async function loadRatings() {
  let live = null;
  try { const m = await import('../needs/js/review.js'); live = await m.fetchComfort(90); } catch (e) { live = null; }
  if (live && live.places && Object.keys(live.places).length) return { places: live.places, demo: false, check: live.check || null, n: live.total ? live.total.n : null, since: live.since };
  const seed = await J('../needs/data/ratings_seed.json').catch(() => null), places = {};
  (seed && seed.journeys || []).forEach(j => (j.stops || []).forEach(s => {
    const p = places[s.id] || (places[s.id] = { n: 0, good: 0, mid: 0, bad: 0, reasons: {} });
    p.n++; if (s.rating >= 4) p.good++; else if (s.rating >= 3) p.mid++; else p.bad++;
    (s.tags || []).forEach(t => { p.reasons[t] = (p.reasons[t] || 0) + 1; });
  }));
  return { places, demo: true };
}
const satPct = p => p && p.n ? (p.good * 100 + p.mid * 50) / p.n : null;

// ---------- 근거 확인: 방문객 아쉬움이 실제 상황(평가 당시 실시간 도시데이터)과 맞는지 ----------
const NOW_URL = 'https://krseuiwyftqbbdsbvycq.supabase.co/functions/v1/seoul-now';   // proxy/seoul-now · OA-21285 서울숲공원
function fisherGreater(a, b, c, d) {
  const n = a + b + c + d, r1 = a + b, c1 = a + c, LF = [0]; for (let i = 1; i <= n; i++) LF[i] = LF[i - 1] + Math.log(i);
  const pr = x => Math.exp(LF[r1] + LF[n - r1] + LF[c1] + LF[n - c1] - LF[n] - LF[x] - LF[r1 - x] - LF[c1 - x] - LF[n - r1 - c1 + x]);
  let p = 0; for (let x = a; x <= Math.min(r1, c1); x++) p += pr(x); return Math.min(1, p);
}
const COND = {
  crowded: { tag: 'crowded', src: 'crowd', inside: k => k >= 1, inLabel: '혼잡 보통 이상', outLabel: '여유' },
  weather: { tag: 'weather', src: 'feels', inside: k => k >= 30 || k <= -10, inLabel: '체감 30℃↑·−5℃↓', outLabel: '그 밖' }
};
function crossTab(chk, key) {
  const c = COND[key], bins = chk && chk[c.src] || {}; let a = 0, b = 0, cc = 0, d = 0;
  Object.keys(bins).forEach(k => { const v = bins[k], t = v[c.tag] || 0; if (c.inside(+k)) { a += t; b += v.n - t; } else { cc += t; d += v.n - t; } });
  return { a, b, c: cc, d, nIn: a + b, nOut: cc + d, tags: a + cc };
}
function verdict(t) {
  const rIn = t.nIn ? t.a / t.nIn : 0, rOut = t.nOut ? t.c / t.nOut : 0, p = t.nIn && t.nOut ? fisherGreater(t.a, t.b, t.c, t.d) : 1;
  let v = 'none';
  if (!t.tags) v = 'zero'; else if (t.nIn < 5) v = 'few'; else if (rIn >= 2 * rOut && p < .05) v = 'yes'; else if (p < .1 || rIn > rOut) v = 'lean'; else v = 'no';
  return Object.assign({}, t, { rIn, rOut, p, v });
}
const VTXT = { yes: '측정치와 일치', lean: '경향 있음(유의성 부족)', no: '측정치와 불일치', few: '해당 조건 표본 부족', zero: '해당 응답 없음', none: '검증 자료 없음' };
function topBad(p) { if (!p) return null; let b = null; Object.keys(BAD).forEach(k => { const v = (p.reasons || {})[k] || 0; if (v && (!b || v > b[1])) b = [k, v]; }); return b; }
function parseCSV(txt) {
  const L = txt.replace(/^﻿/, '').trim().split(/\r?\n/), H = L[0].split(','), col = ['lst_anom', 'tree', 'built', 'd_rest', 'd_ent'].map(k => H.indexOf(k));
  if (col.some(c => c < 0)) throw new Error('CSV 열 없음');
  return L.slice(1).map(r => { const v = r.split(','); return col.map(c => +v[c]); });
}
function inPoly(x, y, r) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }

// ---------- 모양(나무·사람·그늘막) ----------
const hash3 = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
// 수관: 덩어리 여러 개(정이십면체를 같은 자리면 같은 만큼 울퉁불퉁하게) + 아래는 어둡고 위는 밝은 정점 색 / 줄기는 곱해도 갈색이 되게
function treeGeo(kind, hi) {
  const pos = [], nor = [], col = [], g0 = new THREE.Color().setHSL(.27, .42, .33), br = new THREE.Color(0x5b4634), tc = [br.r / g0.r, br.g / g0.g, br.b / g0.b];
  const put = (g, f, trunk) => { const p = g.attributes.position.array, n = g.attributes.normal.array; for (let i = 0; i < p.length; i += 3) { const q = f(p[i], p[i + 1], p[i + 2]); pos.push(q[0], q[1], q[2]); nor.push(n[i], n[i + 1], n[i + 2]); if (trunk) col.push(tc[0], tc[1], tc[2]); else { const c = q[3]; col.push(c, c, c); } } g.dispose(); };
  const lobes = (L, det, sx, sy, cy) => L.forEach(([x, y, z, r], li) => {
    const g = new THREE.IcosahedronGeometry(r, det).toNonIndexed(), tint = (hash3(li, 3, 7) - .5) * .12;
    put(g, (vx, vy, vz) => { const k = 1 + (hash3(Math.round(vx * 40), Math.round(vy * 40), Math.round(vz * 40) + li) - .5) * .3; return [(vx * k + x) * sx, (vy * k + y) * sy + cy, (vz * k + z) * sx, .58 + .55 * clamp01((vy + r) / (2 * r)) + tint]; });
  });
  const trunk = (h, r0, r1) => { const g = new THREE.CylinderGeometry(r1, r0, 1, hi ? 7 : 5).toNonIndexed(); put(g, (x, y, z) => [x, (y + .5) * h, z], true); };
  if (kind === 0) { trunk(3.4, .3, .18); lobes(hi ? [[0, 0, 0, 1.05], [.62, -.15, .2, .74], [-.58, -.1, -.28, .76], [.12, .45, -.4, .68], [-.18, .3, .55, .68]] : [[0, 0, 0, 1.1], [.6, -.1, .2, .78], [-.5, .1, -.3, .8]], hi ? 1 : 0, 3, 2.7, 5.2); }
  if (kind === 1) { trunk(4.2, .26, .15); lobes(hi ? [[0, -.55, 0, .82], [0, .2, 0, .86], [0, .85, 0, .68]] : [[0, -.4, 0, .85], [0, .5, 0, .8]], hi ? 1 : 0, 2.2, 3.2, 6.4); }
  if (kind === 2) {
    trunk(2.2, .25, .14);
    (hi ? [[2.6, 4.2, 3.6], [2.0, 3.6, 5.6], [1.3, 3.0, 7.4]] : [[2.4, 8, 5]]).forEach(([r, h, y]) => { const g = new THREE.ConeGeometry(r, h, hi ? 9 : 7).toNonIndexed(); put(g, (vx, vy, vz) => [vx, vy + y, vz, .55 + .45 * clamp01((vy + h / 2) / h)]); });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); return g;
}
// 대형 차양(그늘막) 막(8×8m): 모서리 높이를 엇갈리게(4.6·3.4m) + 가운데 처짐
function sailGeo() {
  const g = new THREE.PlaneGeometry(8, 8, 12, 12); g.rotateX(-Math.PI / 2); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const u = (p.getX(i) + 4) / 8, v = (p.getZ(i) + 4) / 8, h = (1 - u) * (1 - v) * 4.6 + u * (1 - v) * 3.4 + (1 - u) * v * 3.4 + u * v * 4.6 - .38 * Math.sin(Math.PI * u) * Math.sin(Math.PI * v); p.setY(i, h); }
  g.computeVertexNormals(); return g;
}
function canvasTex(w, h, draw, srgb = true) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }
function glowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(.5, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export async function openTwin(o) {
  applyAltEdits(loadAltEdits());
  const xy = o.xy, low = !!o.low, M = o.model;
  if (!o.headless && !document.getElementById('twCss')) { const l = document.createElement('link'); l.id = 'twCss'; l.rel = 'stylesheet'; l.href = './sim3d.css?v=48'; document.head.appendChild(l); }
  const root = document.createElement('div'); root.className = 'tw'; root.innerHTML = '<div class="tw-load"><i></i><span>디지털트윈을 불러오는 중…</span></div>'; if (!o.headless) document.body.appendChild(root);
  if (!M || !M.sat) { root.remove(); throw new Error('만족도 모형(model) 수신 실패'); }

  // ---------- 자료 ----------
  const [team, csvTxt, eng, feats0, net, NOW, rat, city, TREES_DB] = await Promise.all([
    J(D + 'team.json'), TX(CSV), J(D + 'grid.geojson'), J(D + 'features.geojson').catch(() => null), J(D + 'network.json').catch(() => null),
    Promise.race([J(NOW_URL), new Promise(r => setTimeout(() => r(null), 8000))]).catch(() => null), loadRatings(), o.city ? Promise.resolve(o.city) : J(D + 'city3d.json').catch(() => null), J('../needs/data/trees.json').catch(() => null)]).catch(e => { root.remove(); throw e; });
  const nowOk = NOW && !NOW.error ? NOW : null;
  const EV = {}; Object.keys(COND).forEach(k => { EV[k] = rat.check ? verdict(crossTab(rat.check.total, k)) : { v: 'none' }; });
  const P = rat.places;
  function hubEv(id) {
    const p = P[id] || {}, rs = p.reasons || {};
    return Object.keys(COND).filter(k => rs[k]).map(k => { const t = rat.check && rat.check.places[id] ? crossTab(rat.check.places[id], k) : null; return { key: k, n: rs[k], inCond: t ? t.a : null, park: EV[k] }; });
  }
  const pTxt = p => p < .001 ? 'p<0.001' : 'p=' + p.toFixed(3);
  function evLine(k) {
    const e = EV[k], c = COND[k];
    if (e.v === 'none') return '검증 자료 없음(시연용 가상 평가)';
    if (e.v === 'zero') return '「' + BAD[k] + '」 0건 · ' + c.inLabel + ' 때 평가 ' + e.nIn + '건 → ' + (k === 'weather' ? '더위는 여름 자료가 쌓여야 판단' : '판단할 것 없음');
    return c.inLabel + ' 때 ' + e.a + '/' + e.nIn + '(' + pc(e.rIn) + ') vs ' + c.outLabel + ' ' + e.c + '/' + e.nOut + '(' + pc(e.rOut) + ') · ' + pTxt(e.p);
  }
  function opsRecs() {
    const out = []; if (!nowOk) return out;
    const crowdHubs = hubs.filter(h => ((P[h.id] || {}).reasons || {}).crowded).sort((a, b) => P[b.id].reasons.crowded - P[a.id].reasons.crowded).slice(0, 3).map(h => h.name);
    const fc = (nowOk.crowd && nowOk.crowd.forecast || []).filter(f => f.rank != null), peak = fc.reduce((m, f) => !m || f.rank > m.rank || (f.rank === m.rank && (f.max || 0) > (m.max || 0)) ? f : m, null);
    if (peak && peak.rank >= 1) out.push(peak.time.slice(11, 13) + '시 「' + peak.level + '」 예상(' + (peak.min || 0).toLocaleString() + '~' + (peak.max || 0).toLocaleString() + '명) → ' + (EV.crowded.v === 'yes' && crowdHubs.length ? '붐빔 불만이 실제 혼잡과 맞으니 ' + crowdHubs.join('·') + '에 그 전부터 우회 안내·분산 배치' : '거점별 분산 유도 안내 준비'));
    else if (peak) out.push('12시간 안 「여유」만 예상(최대 ' + (peak.max || 0).toLocaleString() + '명) → 오늘은 혼잡 대응보다 시설 점검·프로그램 운영에 집중');
    const w = nowOk.weather || {}, f = w.feels != null ? w.feels : w.temp;
    if (f != null && f >= 31) out.push('체감 ' + f + '℃ → 그늘 거점 안내·그늘막 먼저 펼치기(체감 31℃ 기준: 주제서 예시)');
    if (f != null && f <= -5) out.push('체감 ' + f + '℃ → 실내 대체시설(곤충식물원·나비정원)과 실내 쉼터 안내');
    if (w.uv != null && w.uv >= 6) out.push('자외선 ' + (w.uvText || w.uv) + ' → 그늘 동선 안내');
    if (w.pm25 != null && w.pm25 >= 36) out.push('초미세먼지 ' + w.pm25 + '㎍/㎥(' + (w.pm25Text || '') + ') → 실내 대체시설 안내·야외 프로그램 줄이기(36 기준: 주제서 예시)');
    (nowOk.events || []).slice(0, 2).forEach(e => out.push('행사 「' + e.name + '」 ' + (e.period || '') + ' → 행사 시간 앞뒤로 입구·화장실 혼잡 대비'));
    return out;
  }
  function liveHTML() {
    if (!nowOk) return '<div class="tw-live"><h3>서울숲 실시간 현황</h3><p class="tw-note">실시간 도시데이터 수신 실패.</p></div>';
    const w = nowOk.weather || {}, c = nowOk.crowd || {}, f = w.feels != null ? w.feels : null;
    return '<div class="tw-live"><h3>서울숲 실시간 현황 <small>서울시 실시간 도시데이터(OA-21285) · ' + esc((w.time || c.time || '').slice(5)) + '</small></h3>' +
      '<div class="tw-lg"><span>기온<b>' + (w.temp != null ? w.temp + '℃' : '—') + '</b>' + (f != null ? '<i>체감 ' + f + '℃</i>' : '') + '</span><span>초미세먼지<b>' + (w.pm25 != null ? w.pm25 : '—') + '</b><i>' + esc(w.pm25Text || '') + '</i></span>' +
      '<span>혼잡<b>' + esc(c.level || '—') + '</b><i>' + (c.min != null ? c.min.toLocaleString() + '~' + c.max.toLocaleString() + '명' : '') + '</i></span><span>행사<b>' + (nowOk.events || []).length + '건</b><i>인근</i></span></div>' +
      '<h4>이용자 불만 요인 검증</h4><ul class="tw-ev">' + Object.keys(COND).map(k => '<li class="v-' + EV[k].v + '"><b>「' + BAD[k] + '」 · ' + VTXT[EV[k].v] + '</b><small>' + esc(evLine(k)) + '</small></li>').join('') + '</ul>' +
      (opsRecs().length ? '<h4>금일 운영 권고</h4><ul class="tw-ops">' + opsRecs().map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '') + '</div>';
  }

  // ---------- 칸 자료 · 팀 식 재현 ----------
  const feats = team.grid.features, rows = parseCSV(csvTxt), N = feats.length;
  if (rows.length !== N) { root.remove(); throw new Error('칸 수가 다름(team ' + N + ' / csv ' + rows.length + ')'); }
  const Q = [], CX = new Float64Array(N), CY = new Float64Array(N), A = new Float64Array(N), TR = new Float64Array(N), B = new Float64Array(N), R = new Float64Array(N), EN = new Float64Array(N),
    CR = new Float64Array(N), AIR = new Float64Array(N), S0 = new Float64Array(N), F0 = new Float64Array(N), DT = new Float64Array(N);
  feats.forEach((f, i) => {
    const c = f.geometry.coordinates[0].slice(0, 4).map(q => xy(q[0], q[1])); Q.push(c);
    CX[i] = (c[0][0] + c[1][0] + c[2][0] + c[3][0]) / 4; CY[i] = (c[0][1] + c[1][1] + c[2][1] + c[3][1]) / 4;
    const p = f.properties, r = rows[i];
    A[i] = r[0]; TR[i] = clamp01(r[1]); B[i] = clamp01(r[2]); R[i] = r[3]; EN[i] = clamp01((r[4] - EA) / (EB - EA)) * 100; CR[i] = p.crowd; AIR[i] = p.air; S0[i] = p.score;
  });
  function formula(i, a, sh, dr, cr) {
    const heat = .6 * clamp01((a - LA) / (LB - LA)) * 100 + .4 * (1 - clamp01(sh)) * 100, acc = .65 * clamp01((dr - RA) / (RB - RA)) * 100 + .35 * EN[i];
    return WT.heat * heat + WT.crowd * cr + WT.access * acc + WT.air * AIR[i];
  }
  let errMax = 0, errN = 0;
  for (let i = 0; i < N; i++) { F0[i] = formula(i, A[i], TR[i], R[i], CR[i]); const e = Math.abs(F0[i] - S0[i]); if (e > errMax) errMax = e; if (e > .02) errN++; }
  console.info('[디지털트윈] 칸 점수 재현(02_vulnerability.py 식 vs team.json score): 최대 오차 ' + errMax.toFixed(4) + ' · 0.02 넘는 칸 ' + errN + ' / ' + N + (errN ? ' ← 확인 필요' : ' · 통과'));
  const E = eng.features.map(f => { const z = f.geometry.coordinates[0].slice(0, -1); let lo = 0, la = 0; z.forEach(q => { lo += q[0]; la += q[1]; }); const p = xy(lo / z.length, la / z.length); return [p[0], p[1], f.properties.dToilet]; });
  for (let i = 0; i < N; i++) { let bd = 1e18, v = 0; for (const e of E) { const d = (e[0] - CX[i]) ** 2 + (e[1] - CY[i]) ** 2; if (d < bd) { bd = d; v = e[2]; } } DT[i] = v; }
  const hubs = o.hubs.map(h => ({ id: h.id, name: h.name, zone: h.zone, x: h.x, y: h.y, cap: h.capacity || 0, pull: h.pull == null ? .5 : h.pull, type: h.type || 'outdoor', env0: h.env0 != null ? h.env0 : (h.env != null ? h.env : 70) }));

  // ---------- 대시보드 만족도 식(index.html에서 받은 함수) + 그늘 비율 보간 ----------
  const wxS = (type, w, s) => type !== 'outdoor' || !s ? M.wxScore(type, w).v : (1 - s) * M.wxScore('outdoor', w).v + s * M.wxScore('shade', w).v;
  const wxfS = (type, w, s) => type !== 'outdoor' || !s ? M.wxf(type, w) : (1 - s) * M.wxf('outdoor', w) + s * M.wxf('shade', w);
  const demand = (h, sc, hr, s) => Math.min(1.35, M.tp(sc.dow, Math.floor(hr)) * (.55 + .6 * h.pull) * wxfS(h.type, sc.w, s) * 1.15);   // index.html crowd()와 같은 식
  function satOf(ratio, x, e, Wt) { const d = M.densScore(ratio), w = Wt || SW; return { raw: .75 * (d * w.dens + x * w.wx + e * w.env) + .25 * Math.min(d, x, e), d, x, e }; }
  { let mx = 0; hubs.forEach(h => [.3, .8, 1.2].forEach(r => [SCN.crowd.w, SCN.heat.w].forEach(w => { mx = Math.max(mx, Math.abs(satOf(r, wxS(h.type, w, 0), h.env0).raw - M.sat({ type: h.type, env: h.env0 }, r, w).raw)); })));
    console.info('[디지털트윈] 만족도 식 재현(index.html sat vs 트윈): 최대 오차 ' + mx.toFixed(4) + (mx > .01 ? ' ← 확인 필요' : ' · 통과')); }

  // 바닥 자료
  const pairs = (a, s) => { const out = []; for (let i = s; i + 1 < a.length; i += 2) out.push([a[i], a[i + 1]]); return out; };
  const FE = (feats0 && feats0.features || []).map(f => ({ k: f.properties.kind, ring: f.geometry.coordinates[0].map(q => xy(q[0], q[1])) }));
  // 실제 공원 경계(OpenStreetMap 「서울숲」 경계, 2026-11-09 수집 — data/meta.json) — 기본설계 도면용
  // 길 중심선·폭(OpenStreetMap, data/paths.json — width 태그 있으면 그 값, 없으면 유형별 표준폭 추정)
  let PATHW = [], PATHT = 0; J(D + 'paths.json').then(g => { PATHW = g.ways.map(w => ({ hw: w[0], w: w[1], tag: w[2], pts: w[3].map(q => xy(q[0], q[1])) })); PATHT = PATHW.filter(w => w.tag).length; }).catch(() => {});
  let PARKB = []; J(D + 'park.geojson').then(g => { const gm = g.features ? g.features[0].geometry : g.geometry, ps = gm.type === 'Polygon' ? [gm.coordinates] : gm.coordinates; PARKB = ps.map(pg => pg[0].map(q => xy(q[0], q[1]))); }).catch(() => {});
  const CWATER = (city && city.water || []).map(w => Array.isArray(w[0]) ? w : pairs(w, 0)).filter(p => p.length > 2);
  const NX = net ? net.nodes.map(q => xy(q[0], q[1])) : [], NE = net ? net.edges.filter(e => NX[e[0]] && NX[e[1]]) : [];
  const BLOCK = FE.filter(f => f.k === 'building' || f.k === 'water').map(f => f.ring).concat(CWATER);
  const blocked = new Uint8Array(N); for (let i = 0; i < N; i++) blocked[i] = BLOCK.some(r => inPoly(CX[i], CY[i], r)) ? 1 : 0;
  const okPt = (x, y) => !BLOCK.some(r => inPoly(x, y, r));
  let bx0 = 1e9, bx1 = -1e9, by0 = 1e9, by1 = -1e9; (o.rings || []).forEach(r => r.forEach(q => { bx0 = Math.min(bx0, q[0]); bx1 = Math.max(bx1, q[0]); by0 = Math.min(by0, q[1]); by1 = Math.max(by1, q[1]); }));
  if (bx0 > bx1) for (let i = 0; i < N; i++) { bx0 = Math.min(bx0, CX[i]); bx1 = Math.max(bx1, CX[i]); by0 = Math.min(by0, CY[i]); by1 = Math.max(by1, CY[i]); }

  // 나무 목록(바닥 그늘 그림에도 씀): 칸 수관비율 × 400㎡ ÷ 64㎡ 그루, 종류 3가지(둥근 활엽 72% · 길쭉한 활엽 18% · 침엽 10%)
  const TL = [];
  { let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < N; i++) { let n = Math.round(TR[i] * CELL_M2 / CANOPY_M2); if (low) n = Math.round(n / 2); for (let k = 0; k < n; k++) { const u = r(), v = r(), q = Q[i], kd = r(); TL.push([(q[0][0] * (1 - u) + q[1][0] * u) * (1 - v) + (q[3][0] * (1 - u) + q[2][0] * u) * v, (q[0][1] * (1 - u) + q[1][1] * u) * (1 - v) + (q[3][1] * (1 - u) + q[2][1] * u) * v, 2.4 + r() * 1.5, r(), r() * 6.28, kd < .72 ? 0 : kd < .9 ? 1 : 2]); } } }

  // ---------- 그늘(햇빛 광선 4×4) ----------
  const SMP = []; for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) SMP.push([(a + .5) / 4, (b + .5) / 4]);
  const SPX = new Float64Array(N * 16), SPY = new Float64Array(N * 16);
  for (let i = 0; i < N; i++) { const q = Q[i]; SMP.forEach(([u, v], s) => { SPX[i * 16 + s] = (q[0][0] * (1 - u) + q[1][0] * u) * (1 - v) + (q[3][0] * (1 - u) + q[2][0] * u) * v; SPY[i * 16 + s] = (q[0][1] * (1 - u) + q[1][1] * u) * (1 - v) + (q[3][1] * (1 - u) + q[2][1] * u) * v; }); }
  const cs = t => { if (t.c == null) { t.c = Math.cos(t.rot); t.s = Math.sin(t.rot); } };
  function hitObj(t, px, py, sd) {
    if (t.k === 'tree') { const ox = px - t.x, oy = py - t.y, oz = -5.6, bb = ox * sd.x + oy * sd.y + oz * sd.z, cc = ox * ox + oy * oy + oz * oz - 20.25, ds = bb * bb - cc; return ds >= 0 && -bb - Math.sqrt(ds) > 0; }
    const rf = FAC[t.k].roof, k = rf.h / sd.z, dx = px + sd.x * k - t.x, dy = py + sd.y * k - t.y; cs(t); const lx = dx * t.c + dy * t.s, ly = -dx * t.s + dy * t.c; return Math.abs(lx) <= rf.hx && Math.abs(ly) <= rf.hy;
  }
  function maskOf(t, i, sd) { if (sd.z <= .035) return 0; const L = Math.min(160, (t.k === 'tree' ? 10 : FAC[t.k].roof.h) * Math.hypot(sd.x, sd.y) / sd.z); if (Math.hypot(CX[i] - t.x, CY[i] - t.y) > L + 22) return 0; let m = 0; for (let s = 0; s < 16; s++) if (hitObj(t, SPX[i * 16 + s], SPY[i * 16 + s], sd)) m |= 1 << s; return m; }
  function shareAt(stay, cast, sd) { if (!stay.length) return 0; let s = 0; for (const i of stay) { let m = 0; for (const t of cast) m |= maskOf(t, i, sd); s += Math.min(1, TR[i] + POP[m] / 16 * (1 - TR[i])); } return s / stay.length; }
  // 팀 칸 점수로 주변 환경(80m) — 빈 개선안이면 index.html envScore와 같음
  function envEval(cells, md, sds) {
    let sum = 0, sh = 0, re = 0, dl = 0, far = 0; const sc = new Float64Array(cells.length);
    cells.forEach((i, j) => {
      const trees = md.tc.get(i) || 0, Tn = Math.min(1, TR[i] + trees * CANOPY_M2 / CELL_M2), Bn = md.lawn.has(i) ? 0 : B[i], a = A[i] + K_TREE * (Tn - TR[i]) + K_PAVE * (Bn - B[i]);
      let dr = R[i]; for (const p of md.rests) { const d = Math.hypot(CX[i] - p[0], CY[i] - p[1]); if (d < dr) dr = d; }
      let s = 0, ss = 0; for (const sd of sds) { let m = 0; for (const t of md.cast) m |= maskOf(t, i, sd); const v = Math.min(1, Tn + POP[m] / 16 * (1 - Tn)); ss += v; s += S0[i] + formula(i, a, v, dr, CR[i]) - F0[i]; }
      s /= sds.length; sc[j] = s; sum += s; sh += ss / sds.length; re += dr; dl += a - A[i]; if (dr > 150) far++;
    });
    const n = cells.length; return { env: clamp(100 - (sum / n - 10) * 1.25, 20, 98), sc, shade: sh / n, rest: re / n, dLst: dl / n, far, n };
  }
  const EMPTY = { tc: new Map(), lawn: new Set(), rests: [], cast: [] };

  // ---------- 길(분산 동선) ----------
  const ADJ = NX.map(() => []); NE.forEach(e => { const d = Math.hypot(NX[e[0]][0] - NX[e[1]][0], NX[e[0]][1] - NX[e[1]][1]); ADJ[e[0]].push([e[1], d]); ADJ[e[1]].push([e[0], d]); });
  const nearNode = (x, y) => { let b = -1, bd = 1e18; NX.forEach((p, k) => { if (!ADJ[k].length) return; const d = (p[0] - x) ** 2 + (p[1] - y) ** 2; if (d < bd) { bd = d; b = k; } }); return b; };
  function route(a, b) {
    const straight = { pts: [[a.x, a.y], [b.x, b.y]], len: Math.hypot(a.x - b.x, a.y - b.y) }, s = nearNode(a.x, a.y), t = nearNode(b.x, b.y); if (s < 0 || t < 0) return straight;
    const dist = new Float64Array(NX.length).fill(Infinity), prev = new Int32Array(NX.length).fill(-1), done = new Uint8Array(NX.length), hp = [[0, s]]; dist[s] = 0;
    const push = v => { hp.push(v); let i = hp.length - 1; while (i) { const p = (i - 1) >> 1; if (hp[p][0] <= hp[i][0]) break; [hp[p], hp[i]] = [hp[i], hp[p]]; i = p; } };
    const pop = () => { const top = hp[0], e = hp.pop(); if (hp.length) { hp[0] = e; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < hp.length && hp[l][0] < hp[m][0]) m = l; if (r < hp.length && hp[r][0] < hp[m][0]) m = r; if (m === i) break; [hp[m], hp[i]] = [hp[i], hp[m]]; i = m; } } return top; };
    while (hp.length) { const [d, u] = pop(); if (done[u]) continue; done[u] = 1; if (u === t) break; for (const [v, w] of ADJ[u]) { const nd = d + w; if (nd < dist[v]) { dist[v] = nd; prev[v] = u; push([nd, v]); } } }
    if (!isFinite(dist[t])) return straight;
    const pts = []; for (let u = t; u >= 0; u = prev[u]) pts.push(NX[u]); pts.reverse();
    return { pts: [[a.x, a.y]].concat(pts, [[b.x, b.y]]), len: dist[t] + Math.hypot(a.x - NX[s][0], a.y - NX[s][1]) + Math.hypot(b.x - NX[t][0], b.y - NX[t][1]) };
  }
  function nearEdge(x, y) {
    let bd = 1e9, ang = 0, nx = 0, ny = 0;
    for (const e of NE) { const a = NX[e[0]], b = NX[e[1]], vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * vx + (y - a[1]) * vy) / l2)), px = a[0] + vx * t, py = a[1] + vy * t, d = Math.hypot(x - px, y - py); if (d < bd) { bd = d; ang = Math.atan2(vy, vx); nx = x - px; ny = y - py; } }
    return { d: bd, ang, nx, ny };
  }
  const offPath = (x, y, want) => { const ed = NE.length ? nearEdge(x, y) : { d: 99, ang: 0, nx: 0, ny: 0 }; if (ed.d < want) { const l = Math.hypot(ed.nx, ed.ny), ux = l > .01 ? ed.nx / l : -Math.sin(ed.ang), uy = l > .01 ? ed.ny / l : Math.cos(ed.ang); x += ux * (want - ed.d); y += uy * (want - ed.d); } return { x, y, rot: ed.ang }; };
  const near = (h, R0) => { const out = []; for (let i = 0; i < N; i++) if (Math.hypot(CX[i] - h.x, CY[i] - h.y) < R0) out.push(i); return out; };
  const cellAt = (x, y) => { let b = -1, bd = 1e18; for (let i = 0; i < N; i++) { const d = (CX[i] - x) ** 2 + (CY[i] - y) ** 2; if (d < bd) { bd = d; b = i; } } return bd < 225 ? b : -1; };
  const dirOf = (h, x, y) => { const d = Math.hypot(x - h.x, y - h.y); return d < 8 ? '거점 바로 옆' : '거점 ' + DIR8[Math.round(((Math.atan2(x - h.x, y - h.y) * 180 / Math.PI) + 360) % 360 / 45) % 8] + '쪽 ' + Math.round(d) + 'm'; };

  // ---------- 개선안(공간 패키지) ----------
  const SDH = OPT_HRS.map(hr => sunDir(hr, SCN.heat.doy));
  // 거점마다 A/B/C 세 안을 한 묶음으로 둔다. plans[id]는 지금 고른 안(alt)을 돌려준다(없으면 undefined, 격자 밖이면 null)
  const SETS = {};
  let alt = 'C', altPinned = false;
  const plans = new Proxy({}, { get: (_, id) => SETS[id] ? SETS[id][alt] : SETS[id], has: (_, id) => id in SETS, set: (_, id, v) => { SETS[id] = v; return true; }, ownKeys: () => Reflect.ownKeys(SETS), getOwnPropertyDescriptor: (_, id) => id in SETS ? { enumerable: true, configurable: true, value: SETS[id] } : undefined });
  function buildPlan(h, opt) {
    opt = opt || ALT.C.use;
    let cells = near(h, ENV_R); if (!cells.length) cells = near(h, 150); if (!cells.length) return null;
    let stay0 = near(h, STAY_R).filter(i => !blocked[i]); if (!stay0.length) { const c = cells.filter(i => !blocked[i]).sort((a, b) => Math.hypot(CX[a] - h.x, CY[a] - h.y) - Math.hypot(CX[b] - h.x, CY[b] - h.y))[0]; if (c == null) return null; stay0 = [c]; }
    const openOf = i => Math.max(40, (1 - TR[i]) * CELL_M2), open0 = stay0.reduce((s, i) => s + openOf(i), 0);
    const ppl14 = demand(h, SCN.crowd, 14, 0) * h.cap, r14 = h.cap ? ppl14 / h.cap : 0;
    const evC = hubEv(h.id).find(e => e.key === 'crowded'), proven = !!(evC && evC.park.v === 'yes');
    const crowdOn = h.cap > 0 && (r14 > CROWD_CUT || (proven && evC.n >= 2 && r14 > NB_FREE));
    let shift = null, added = 0; const yards = [];
    if (crowdOn) {
      // ① 분산: 450m 안, 같은 시각 혼잡률 55% 이하인 거점으로 실시간 안내
      const nb = hubs.filter(g => g !== h && g.cap > 0).map(g => ({ g, r: demand(g, SCN.crowd, 14, 0), d: Math.hypot(g.x - h.x, g.y - h.y) })).filter(q => q.d < NB_R && q.r <= NB_FREE).sort((a, b) => a.r - b.r || a.d - b.d)[0];
      if (nb && opt.shift) { const n = Math.min(SHIFT * ppl14, (CROWD_CUT - nb.r) * nb.g.cap); if (n >= 5) { const rt = route(h, nb.g); shift = { to: nb.g, n, share: n / ppl14, rTo: nb.r, rTo1: nb.r + n / nb.g.cap, len: rt.len, pts: rt.pts }; } }
      // ①' 450m 안에 여유 거점이 없으면: 혼잡 예보·앱 알림으로 피크(14시 전후) 방문을 다른 시간대로 분산(비율은 같은 가정값)
      if (!shift && opt.shift && opt.timeShift && ppl14 * SHIFT >= 5) shift = { to: null, time: true, n: SHIFT * ppl14, share: SHIFT, len: 0, pts: [[h.x, h.y]] };
      // ② 체류공간 확충: 지금 이곳 수용 밀도 그대로, 붙어 있는 칸(숲 제외)을 데크·잔디 쉼터로
      const need = (ppl14 - (shift ? shift.n : 0)) / CROWD_CUT - h.cap;
      if (need > 0 && h.type !== 'indoor' && opt.yard) {
        const dens = h.cap / open0, used = new Set(stay0), pool = near(h, 110).filter(i => !blocked[i] && !used.has(i) && TR[i] < .55);
        while (added < need && yards.length < (opt.maxYard != null ? opt.maxYard : MAX_YARD)) {
          let best = null;
          for (const i of pool) { if (used.has(i)) continue; let adj = false; for (const u of used) if (Math.hypot(CX[i] - CX[u], CY[i] - CY[u]) < 21) { adj = true; break; } if (!adj) continue;
            const sc = B[i] + .6 * (1 - TR[i]) - Math.hypot(CX[i] - h.x, CY[i] - h.y) / 200; if (!best || sc > best.sc) best = { i, sc }; }
          if (!best) break; const cap = dens * CELL_M2 * YARD_USE;
          yards.push({ k: 'yard', cell: best.i, x: CX[best.i], y: CY[best.i], surf: B[best.i] >= .35 ? 'deck' : 'lawn', cap, B: B[best.i], T: TR[best.i] }); added += cap; used.add(best.i);
        }
      }
    }
    const stay = stay0.concat(yards.map(y => y.cell));
    // ③ 그늘: 야외 거점만 — 폭염 시나리오 14시 체류공간 그늘 비율 50%까지, 10~16시 평균으로 가장 효과 큰 자리부터
    const shade = [], sd14 = sunDir(14, SCN.heat.doy), target = Math.max(SHADE_TARGET, shareAt(stay0, [], sd14));
    if (h.type === 'outdoor' && (opt.sail || opt.tree)) {
      const C = []; stay.forEach(i => { if (TR[i] >= (opt.sailFixed ? .95 : .7)) return; const p = offPath(CX[i], CY[i], 6); if (opt.sail) C.push({ k: 'sail', x: p.x, y: p.y, rot: p.rot, cell: i }); if (opt.tree) [[-6, -6], [6, 6], [-6, 6]].forEach(([ox, oy]) => { const q = offPath(CX[i] + ox, CY[i] + oy, 4); C.push({ k: 'tree', x: q.x, y: q.y, rot: 0, cell: i }); }); });
      const CC = C.filter(t => okPt(t.x, t.y)), NS = stay.length, NH = SDH.length;
      CC.forEach(t => { t.mk = new Uint16Array(NS * NH); stay.forEach((i, j) => SDH.forEach((sd, k) => { t.mk[j * NH + k] = maskOf(t, i, sd); })); });
      const cur = new Uint16Array(NS * NH), mean = mk => { let s = 0; for (let j = 0; j < NS; j++) { const i = stay[j]; for (let k = 0; k < NH; k++) s += Math.min(1, TR[i] + POP[mk[j * NH + k]] / 16 * (1 - TR[i])); } return s / (NS * NH); };
      let base = mean(cur);
      const capS = opt.sailFixed || (opt.maxShade != null ? opt.maxShade : MAX_SHADE) + 2 * yards.length;   // B안: 목표와 상관없이 차양 고정 개수
      while (shade.length < capS && (opt.sailFixed || shareAt(stay, shade, sd14) < target)) {
        let best = null;
        for (const t of CC) { if (t.used || shade.some(u => Math.hypot(u.x - t.x, u.y - t.y) < (t.k === 'sail' || u.k === 'sail' ? 9 : 7))) continue;
          const tmp = new Uint16Array(cur.length); for (let q = 0; q < cur.length; q++) tmp[q] = cur[q] | t.mk[q]; const v = mean(tmp) - base; if (!best || v > best.v) best = { t, v, tmp }; }
        if (!best || (!opt.sailFixed && best.v < .004)) break; best.t.used = true; best.t.gain = best.v; shade.push(best.t); cur.set(best.tmp); base += best.v;
      }
    }
    // ④ 쉴 곳: 넓힌 쉼터가 없고 쉴 곳이 먼 경우만 벤치
    const benches = [], rest0 = stay0.reduce((s, i) => s + R[i], 0) / stay0.length;
    const nBench = !opt.bench || yards.length ? 0 : (opt.benchN || 2);
    if (nBench && (opt.benchAlways || rest0 > 60)) { const cand = stay.slice().sort((a, b) => R[b] - R[a]); for (let j = 0; j < cand.length * 2 && benches.length < nBench; j++) { const i = cand[j % cand.length], o2 = j < cand.length ? 3.5 : 7, p = offPath(CX[i] + (j >= cand.length ? 5 : 0), CY[i], o2); if (okPt(p.x, p.y) && !benches.some(b => Math.hypot(b.x - p.x, b.y - p.y) < 4)) benches.push({ k: 'bench', x: p.x, y: p.y, rot: p.rot, cell: i }); } }
    // ⑤ 점수 밖: 방문객 아쉬운 이유에 맞춰
    const rs = (P[h.id] || {}).reasons || {}, extra = [], taken = new Set(yards.map(y => y.cell).concat(shade.map(t => t.cell)));
    const freeCell = pref => { const c = stay.filter(i => !taken.has(i)).sort((a, b) => pref(b) - pref(a))[0]; if (c != null) taken.add(c); return c; };
    const put = (k, cell, why) => { if (cell == null) return; const p = offPath(CX[cell], CY[cell], 5); if (okPt(p.x, p.y)) extra.push({ k, x: p.x, y: p.y, rot: p.rot, cell, why }); };
    if (rs.boring && opt.extra) { put('garden', freeCell(i => B[i]), '「' + BAD.boring + '」 ' + rs.boring + '건'); put('photo', freeCell(i => B[i]), '「' + BAD.boring + '」 ' + rs.boring + '건'); }
    if (opt.extra && (rs.far || rs.facility) && stay.some(i => DT[i] > TOILET_M)) put('toilet', freeCell(i => DT[i]), '화장실 250m 밖 · 「' + (rs.facility ? BAD.facility : BAD.far) + '」 ' + (rs.facility || rs.far) + '건');
    // 환경(80m): 녹음수 = 칸 수관 +16%p, 잔디 쉼터 = 포장 0, 쉼터·그늘막·벤치 = 쉴 곳
    const tc = new Map(); shade.filter(t => t.k === 'tree').forEach(t => { const c = cellAt(t.x, t.y); if (c >= 0) tc.set(c, (tc.get(c) || 0) + 1); });
    const md = { tc, lawn: new Set(yards.filter(y => y.surf === 'lawn').map(y => y.cell)), rests: yards.map(y => [y.x, y.y]).concat(shade.filter(t => t.k === 'sail').map(t => [t.x, t.y]), benches.map(t => [t.x, t.y])), cast: shade };
    const eb = envEval(cells, EMPTY, SDH), ea = envEval(cells, md, SDH), env1 = clamp(h.env0 + ea.env - eb.env, 20, 98);
    // 번호 묶음(3D 번호와 같음)
    const G = [], cen = L => [L.reduce((s, t) => s + t.x, 0) / L.length, L.reduce((s, t) => s + t.y, 0) / L.length];
    if (yards.length) G.push({ k: 'yard', items: yards, at: cen(yards), z: 1.5 });
    if (shift) { const d0 = shift.pts[1] || (shift.to ? [shift.to.x, shift.to.y] : [h.x + 12, h.y + 4]), l = Math.hypot(d0[0] - h.x, d0[1] - h.y) || 1, p = offPath(h.x + (d0[0] - h.x) / l * 9, h.y + (d0[1] - h.y) / l * 9, 3); shift.sign = { k: 'sign', x: p.x, y: p.y, rot: Math.atan2(d0[1] - h.y, d0[0] - h.x) - Math.PI / 2, to: shift.to, len: shift.len }; G.push({ k: 'sign', items: [shift.sign], at: [p.x, p.y], z: 3.4 }); }
    const sails = shade.filter(t => t.k === 'sail'), trees = shade.filter(t => t.k === 'tree');
    if (sails.length) G.push({ k: 'sail', items: sails, at: cen(sails), z: 5.5 });
    if (trees.length) G.push({ k: 'tree', items: trees, at: cen(trees), z: 10 });
    if (benches.length) G.push({ k: 'bench', items: benches, at: cen(benches), z: 1.6 });
    extra.forEach(t => G.push({ k: t.k, items: [t], at: [t.x, t.y], z: 3 }));
    const pl = { h, alt: opt.key, sign: opt.sign, cells, stay0, stay, open0, added, yards, shift, shade, benches, extra, G, crowdOn, proven, r14, md, env0: h.env0, env1, cmp: { b: eb, a: ea } };
    pl.d14 = { crowd: evalHub(pl, SCN.crowd, 14), heat: evalHub(pl, SCN.heat, 14) };
    return pl;
  }
  // 한 상황·시각에서 지금 vs 개선 후
  // v(민감도): shift = 분산 비율 배수, yard = 새 쉼터 수용 배수, shade = 그늘 효과 배수, env = 환경 점수 변화 배수, w = 세 요인 가중치
  function evalHub(pl, sc, hr, v) {
    v = v || {}; const fs = v.shift == null ? 1 : v.shift, fy = v.yard == null ? 1 : v.yard, fh = v.shade == null ? 1 : v.shade, fe = v.env == null ? 1 : v.env;
    const h = pl.h, sd = sunDir(hr, sc.doy), s0 = shareAt(pl.stay0, [], sd), s1 = Math.min(1, s0 + (shareAt(pl.stay, pl.shade, sd) - s0) * fh);
    const p0 = demand(h, sc, hr, s0) * h.cap, p1 = demand(h, sc, hr, s1) * h.cap * (1 - Math.min(.9, (pl.shift ? pl.shift.share : 0) * fs)), cap1 = h.cap + pl.added * fy;
    const e1 = clamp(pl.env0 + (pl.env1 - pl.env0) * fe, 20, 98);
    const r0 = h.cap ? p0 / h.cap : 0, r1 = cap1 ? p1 / cap1 : 0, b = satOf(r0, wxS(h.type, sc.w, s0), pl.env0, v.w), a = satOf(r1, wxS(h.type, sc.w, s1), e1, v.w);
    return { b: Object.assign(b, { ratio: r0, ppl: p0, s: s0, cap: h.cap }), a: Object.assign(a, { ratio: r1, ppl: p1, s: s1, cap: cap1 }) };
  }
  const planFor = h => {
    if (!(h.id in SETS)) { const c = buildPlan(h, ALT.C.use); SETS[h.id] = c ? { A: buildPlan(h, ALT.A.use) || c, B: buildPlan(h, ALT.B.use) || c, C: c } : null; }
    return plans[h.id];
  };
  // ---------- 비용(개략) ----------
  // 수량은 개선안에서 바로 셈. 단가는 COST(출처·기준연도와 함께) — 범위로 보여 주고 합계도 범위로.
  function qtyOf(pl) {
    const L = [], add = (k, q) => { if (q > 0) L.push({ k, q }); };
    const deck = pl.yards.filter(y => y.surf === 'deck').length, lawn = pl.yards.length - deck;
    add('deck', deck * CELL_M2); add('lawn', lawn * CELL_M2); add('bench', pl.yards.length * 2 + pl.benches.length * 2);
    if (pl.shift) add(pl.sign === 'digital' ? 'signD' : 'signS', 1);
    add('sail', pl.shade.filter(t => t.k === 'sail').length); add('tree', pl.shade.filter(t => t.k === 'tree').length);
    pl.extra.forEach(t => add(t.k === 'garden' ? 'garden' : t.k === 'photo' ? 'photo' : 'toilet', t.k === 'garden' ? GARDEN_M2 : 1));
    return L;
  }
  function costOf(pl) {
    const lines = qtyOf(pl).map(({ k, q }) => { const c = COST[k] || {}; return { k, q, label: c.label || k, unit: c.unit || '', lo: c.lo != null ? c.lo * q : null, hi: c.hi != null ? c.hi * q : null, refLo: c.refLo != null ? c.refLo * q : null, refHi: c.refHi != null ? c.refHi * q : null, src: (c.lo == null && c.where ? '견적 필요 — 단가 출처 찾을 곳: ' + c.where + ' · ' : '') + (c.src || '단가 확인 필요') + (c.inc ? ' · ' + c.inc : '') + (c.ref ? ' · ' + c.ref : '') }; });
    const known = lines.filter(l => l.lo != null);
    const refs = lines.filter(l => l.lo == null && l.refLo != null);
    return { lines, lo: known.reduce((s, l) => s + l.lo, 0), hi: known.reduce((s, l) => s + l.hi, 0), unknown: lines.length - known.length, refLo: refs.reduce((s, l) => s + l.refLo, 0), refHi: refs.reduce((s, l) => s + l.refHi, 0) };
  }
  // 효과: 혼잡 시나리오·폭염 시나리오 14시 예측 만족도 변화의 평균
  const gainOf = pl => pl ? ((pl.d14.crowd.a.raw - pl.d14.crowd.b.raw) + (pl.d14.heat.a.raw - pl.d14.heat.b.raw)) / 2 : 0;
  const KS0 = ['A', 'B', 'C'];
  // ---------- 점수 상승 근거: 단계별 분해 · 가정 민감도 · 사후 검증 기준 ----------
  const gainV = (pl, v) => { const c = evalHub(pl, SCN.crowd, 14, v), hh = evalHub(pl, SCN.heat, 14, v); return ((c.a.raw - c.b.raw) + (hh.a.raw - hh.b.raw)) / 2; };
  const SHADE_EQ = .4 * Math.max(0, SCN.heat.w.feels - 26);   // 그늘 거점 계수(더위 감점 ×.6)를 폭염 시나리오 체감온도 감소로 환산: 1℃당 7점 × 40% ÷ 7 = .4℃/℃
  const WALT = [{ n: '같은 가중치(⅓씩)', w: { dens: 1 / 3, wx: 1 / 3, env: 1 / 3 } }, { n: '붐빔 중시(.45/.25/.30)', w: { dens: .45, wx: .25, env: .30 } }, { n: '날씨 중시(.25/.45/.30)', w: { dens: .25, wx: .45, env: .30 } }, { n: '환경 중시(.30/.25/.45)', w: { dens: .30, wx: .25, env: .45 } }];
  const SENS = [
    { k: 'shift', label: '분산 유도 안내를 따르는 비율', base: pc(SHIFT), alts: [{ n: '10%', v: { shift: .10 / SHIFT } }, { n: '20%', v: { shift: .20 / SHIFT } }], why: '팀 가정 — 테마파크 현장연구에서 다수가 안내에 따라 동선을 바꿀 의향을 보임(Brown 외 2013), 서울숲 실측 없음' },
    { k: 'yard', label: '새 쉼터 사용률', base: pc(YARD_USE), alts: [{ n: '70%', v: { yard: .70 / YARD_USE } }, { n: '100%', v: { yard: 1 / YARD_USE } }], why: '팀 가정 — 지금 거점의 수용 밀도를 새 칸에 적용' },
    { k: 'shade', label: '그늘 효과 크기', base: '완전 그늘 = 체감 약 ' + SHADE_EQ.toFixed(1) + '℃↓(그늘 거점 계수)', alts: [{ n: '절반(약 ' + (SHADE_EQ / 2).toFixed(1) + '℃↓)', v: { shade: .5 } }, { n: '문헌 하한(5℃↓)', v: { shade: 5 / SHADE_EQ } }, { n: '문헌 상한(7℃↓)', v: { shade: 7 / SHADE_EQ } }], why: '문헌 범위로 점검 — 나무 그늘은 흑구온도를 5~7℃ 낮춤(Armson 외 2012), 수목 그늘은 PET를 21.2~31.3% 낮춤(조상만 외 2017). 흑구온도 감소를 체감온도 감소로 본 것은 근사(검증 필요). 팀 계수는 문헌 하한보다 작아 보수적' },
    { k: 'env', label: '환경 점수 변화', base: '트윈 지표온도 계수(수관 −0.839)', alts: [{ n: '절반', v: { env: .5 } }, { n: '팀 단순회귀 −1.61 적용(×1.9)', v: { env: 1.61 / .839 } }], why: '트윈 계수는 산출 스크립트가 저장소에 없어 확인 필요 · 팀 산출 단순회귀는 −1.61(R² 0.175)' },
    { k: 'w', label: '세 요인 가중치', base: '.35/.30/.35', alts: WALT.map(x => ({ n: x.n, v: { w: x.w } })), why: '대시보드 가정 — 방문객 중요도 조사(IPA)로 정할 값' }
  ];
  function sensOf(pl) {
    if (pl._sv) return pl._sv;
    const g0 = gainV(pl, {}), rows = SENS.map(f => { const gs = f.alts.map(a => ({ n: a.n, g: gainV(pl, a.v) })); const lo = gs.reduce((m, x) => x.g < m.g ? x : m), hi = gs.reduce((m, x) => x.g > m.g ? x : m); return { f, lo, hi, swing: hi.g - lo.g }; }).sort((a, b) => b.swing - a.swing);
    const vLo = {}, vHi = {}; rows.forEach(r => { const pick = (n, tgt) => Object.assign(tgt, r.f.alts.find(a => a.n === n).v); pick(r.lo.n, vLo); pick(r.hi.n, vHi); });
    const gLo = gainV(pl, vLo), gHi = gainV(pl, vHi);
    return (pl._sv = { g0, rows, lo: Math.min(gLo, g0), hi: Math.max(gHi, g0) });
  }
  // 단계별 분해(14시): 개선 → 물리 변화 → 요인 점수 → 종합 점수 기여(.75 × 가중치 × 요인 변화, 나머지는 가장 낮은 요인 보정 .25)
  function basisRows(pl, sc) {
    const e = evalHub(pl, sc, 14), b = e.b, a = e.a, wsum = k => .75 * SW[k];
    const cD = wsum('dens') * (a.d - b.d), cX = wsum('wx') * (a.x - b.x), cE = wsum('env') * (a.e - b.e), cM = .25 * (Math.min(a.d, a.x, a.e) - Math.min(b.d, b.x, b.e));
    const eqC = pl.h.type === 'outdoor' && sc.w.feels > 26 ? (.4 * (sc.w.feels - 26)).toFixed(1) : null;
    return { total: a.raw - b.raw, rows: [
      ['붐빔', '혼잡률 ' + pc(b.ratio) + ' → ' + pc(a.ratio) + ' (수용 ' + Math.round(b.cap).toLocaleString() + ' → ' + Math.round(a.cap).toLocaleString() + '명' + (pl.shift ? ', 분산 ' + pc(pl.shift.share) : '') + ')', Math.round(b.d) + ' → ' + Math.round(a.d), f1(cD), '계산 + 가정: 혼잡률은 시간대 방문 비율×끌림×수용 인원(수용·끌림은 대시보드 가정값). 붐빔 점수 곡선(35%까지 100점, 70%에서 75점, 그 위 1%p당 1점)은 가정'],
      ['날씨', '체류공간 그늘 비율 ' + pc(b.s) + ' → ' + pc(a.s) + ' (' + sc.label + ', 체감 ' + sc.w.feels + '℃)', Math.round(b.x) + ' → ' + Math.round(a.x), f1(cX), '계산: 그늘 비율은 태양 위치(NOAA 식)와 햇빛 광선 4×4로 셈. 기상 점수(체감 26℃ 넘으면 1℃당 7점 감점)와 그늘 효과 계수는 가정' + (eqC ? ' — 완전 그늘 = 체감 약 ' + eqC + '℃ 낮춤과 같음, 문헌 흑구온도 5~7℃↓(Armson 외 2012)보다 보수적' : '')],
      ['환경', '둘레 80m 칸 점수 다시 셈(수관·포장·휴게시설 거리)', Math.round(b.e) + ' → ' + Math.round(a.e), f1(cE), '계산: 팀 20m 격자 식(02_vulnerability.py, team.json 재현 최대 오차 0.015). 지표온도 계수(수관 −0.839·포장 +1.345)는 확인 필요'],
      ['최저 요인 보정', (() => { const nm = { d: '혼잡', x: '기상', e: '환경' }, kb = ['d', 'x', 'e'].sort((u, w) => b[u] - b[w])[0], ka = ['d', 'x', 'e'].sort((u, w) => a[u] - a[w])[0]; return '최저 요인 보정 ' + f1(cM) + ' = ' + (kb === ka ? nm[kb] + ' 개선이 가장 낮은 요인이라 한 번 더 반영된 값(×.25)' : '가장 낮은 요인이 ' + nm[kb] + ' → ' + nm[ka] + '(으)로 바뀌며 한 번 더 반영된 값(×.25)'); })(), Math.round(Math.min(b.d, b.x, b.e)) + ' → ' + Math.round(Math.min(a.d, a.x, a.e)), f1(cM), '가정(대시보드 식): 한 요인이 아주 나쁘면 전체가 끌려 내려감 — 위 요인 기여와 겹쳐 반영됨']
    ] };
  }
  // 사후 검증: 설치 전후 같은 거점 평가로 이 상승을 확인하는 데 필요한 평가 수(양측 5%, 검정력 80%)
  function poolSD() { let n = 0, sx = 0, sxx = 0; Object.values(P).forEach(p => { n += p.n; sx += p.good + .5 * p.mid; sxx += p.good + .25 * p.mid; }); if (n < 10) return { sd: 40, n, est: true }; const m = sx / n; return { sd: Math.sqrt(Math.max(0, sxx / n - m * m) * n / (n - 1)) * 100, n, est: false }; }
  function needN(delta) { const sd = poolSD().sd; return delta > .5 ? Math.ceil(2 * (1.96 + .84) ** 2 * sd * sd / (delta * delta)) : null; }

  // 데이터 기준 추천: 공사 규모가 작은 안(A→B→C)부터 보아, C안 효과의 70% 이상을 내는 첫 안. C안 효과가 0.5점 미만이면 A안(공사할 이유가 약함)
  //   단가 빈칸(견적 필요)이 많아 금액이 아니라 수단의 규모 순서로 고른다 — B는 A에 그늘막을, C는 B에 쉼터 확장·식재를 더한 안
  const REC_SHARE = .7, REC_MIN = .5;
  function recAlt(set) {
    if (!set) return 'C'; const gC = gainOf(set.C);
    if (gC < REC_MIN) return 'A';
    return ['A', 'B', 'C'].find(k => gainOf(set[k]) >= REC_SHARE * gC) || 'C';
  }
  // ---------- 나무 현황(유추) ----------
  // 그루 수 = 칸 수관 비율(ESA WorldCover 10m 나무 피복을 20m 칸에 모은 값) × 400㎡ ÷ 그루당 수관 64㎡(지름 9m 가정)
  // 수종 = 서울숲 전체 수종 집계(서울시 2020 전시, trees.json count) 비율 + 거점 근처 명소 기록(trees.json spots)이 있으면 그 수종 가중 ×4
  function treeInfo(h) {
    const cells = near(h, ENV_R); if (!cells.length) return null;
    let canopy = 0; cells.forEach(i => { canopy += TR[i]; });
    const est = Math.round(canopy * CELL_M2 / CANOPY_M2), cover = canopy / cells.length, cnt = (TREES_DB && TREES_DB.count) || {};
    const spots = ((TREES_DB && TREES_DB.spots) || []).filter(s => (s.near || []).includes(h.id));
    const w = {}; Object.keys(cnt).forEach(k => { w[k] = cnt[k]; }); spots.forEach(s => s.trees.forEach(t => { w[t] = (w[t] || (cnt[Object.keys(cnt).pop()] || 100)) * 4; }));
    const tot = Object.values(w).reduce((s, v) => s + v, 0) || 1, top = Object.keys(w).sort((a, b) => w[b] - w[a]).slice(0, 3).map(k => ({ name: k, share: w[k] / tot, h: (TREES_DB && TREES_DB.height || {})[k], spot: spots.find(s => s.trees.includes(k)) }));
    return { est, cover, top, spots, area: cells.length * CELL_M2 };
  }
  let parkTrees = 0; for (let i = 0; i < N; i++) parkTrees += TR[i] * CELL_M2 / CANOPY_M2; parkTrees = Math.round(parkTrees);
  const TREE_NOTE = '알고리즘 추정치 — 수종·본수·규격은 현장 매목조사(실측)로 확인 필요.';
  const baseSat = (h, sc, hr) => satOf(h.cap ? demand(h, sc, hr, 0) : 0, wxS(h.type, sc.w, 0), h.env0).raw;

  const PET = new Set(((TREES_DB && TREES_DB.groups) || []).filter(g => g.warn).flatMap(g => g.list));
  const SHADE_SP = ['느티나무', '상수리나무', '중국단풍', '물푸레나무', '느릅나무'];   // 넓은 그늘을 만드는 활엽 교목 후보
  function shadeSpecies() { const cnt = (TREES_DB && TREES_DB.count) || {}; return SHADE_SP.filter(k => !PET.has(k)).sort((a, b) => (cnt[b] || 0) - (cnt[a] || 0))[0]; }
  // ---------- 객관 근거 판정 ----------
  function ciOf(p) {
    if (!p || !p.n) return null; const n = p.n, m = (p.good + .5 * p.mid) / n, ss = p.good * (1 - m) ** 2 + p.mid * (.5 - m) ** 2 + p.bad * m ** 2, sd = n > 1 ? Math.sqrt(ss / (n - 1)) : 0, hw = 1.96 * sd / Math.sqrt(n);
    return { n, m: m * 100, lo: Math.max(0, m - hw) * 100, hi: Math.min(1, m + hw) * 100, need: sd ? Math.ceil((1.96 * sd / .1) ** 2) : n };   // need: 구간 폭 ±10점에 필요한 평가 수
  }
  function gradeOf(id) {
    const p = P[id], ci = ciOf(p), rs = (p && p.reasons) || {}, chk = rat.check && rat.check.places ? rat.check.places[id] : null;
    const over = { crowded: 0, weather: 0 };
    if (chk) { Object.keys(chk.crowd || {}).forEach(k => { if (+k >= 2) over.crowded += chk.crowd[k].crowded || 0; }); Object.keys(chk.feels || {}).forEach(k => { if (+k >= 35) over.weather += chk.feels[k].weather || 0; }); }
    const enough = !!(ci && ci.n >= MIN_N), s1 = enough && ci.hi < SAT_CUT, low = enough && ci.m < SAT_CUT;
    const s2keys = Object.keys(COND).filter(k => rs[k] && EV[k] && EV[k].v === 'yes'), s3keys = Object.keys(over).filter(k => over[k] >= OVER_N);
    const s2 = s2keys.length > 0, s3 = s3keys.length > 0;
    const sOk = enough && ci.lo >= SAT_CUT;   // 신뢰구간 하한도 기준 이상 = 만족 확인
    const key = !enough ? 'few' : s1 && (s2 || s3) ? 'confirmed' : s1 ? 'perception' : sOk ? (s3 ? 'latent' : 'ok') : 'suspect';
    return { key, ci, s1, s2, s3, s2keys, s3keys, over, demo: !!rat.demo, ...GRADE[key] };
  }
  function gradeLines(g) {
    const ci = g.ci, L = [];
    L.push('① 표본 검정: ' + (ci ? '만족도 ' + Math.round(ci.m) + '점, 95% 신뢰구간 ' + Math.round(ci.lo) + '~' + Math.round(ci.hi) + '점(응답 ' + ci.n + '건) → ' + (ci.n < MIN_N ? '응답 ' + MIN_N + '건 미만' : g.s1 ? '신뢰구간 상한 ' + SAT_CUT + '점 미만 — 저만족 확인' : ci.lo >= SAT_CUT ? '신뢰구간 하한 ' + SAT_CUT + '점 이상 — 만족 확인(개선 불필요)' : '신뢰구간이 기준 ' + SAT_CUT + '점 포함 — 판정 유보' + (ci.need > ci.n ? '(추가 ' + (ci.need - ci.n) + '건 필요, ±10점 정밀도 기준 총 ' + ci.need + '건)' : '')) : '평가 자료 없음'));
    L.push('② 측정치 일치: ' + (g.s2 ? g.s2keys.map(k => '「' + BAD[k] + '」').join('·') + ' 응답이 평가 시점 실시간 측정치와 일치(공원 전체, Fisher 정확검정)' : g.demo ? '검증 자료 없음(시연용 가상 평가)' : '측정치와 일치하는 불만 응답 없음'));
    L.push('③ 공인 기준 초과: ' + (g.demo ? '검증 자료 없음' : '혼잡 「약간 붐빔」 이상 시 「혼잡」 응답 ' + g.over.crowded + '건 · 체감 35℃ 이상 시 「기상」 응답 ' + g.over.weather + '건 → ' + (g.s3 ? '기준 초과 상황 불만 ' + OVER_N + '건 이상' : '기준 초과 상황 불만 ' + OVER_N + '건 미만')));
    return L;
  }
  // 판정별로 낼 수 있는 대안: 문제 확인 → A·B·C / 개선 불필요 → 없음 / 그 밖(유보·부족·인식·잠재) → A안 + 추가 조사
  function allowedFor(id) { const k = gradeOf(id).key; return k === 'confirmed' ? ['A', 'B', 'C'] : k === 'ok' ? [] : ['A']; }
  function surveyNeed(id) { const g = gradeOf(id), ci = g.ci; return !ci ? MIN_N : ci.n < MIN_N ? MIN_N - ci.n : Math.max(0, ci.need - ci.n); }
  // 최종 추천: 모형 추천(recAlt)을 객관 근거로 거른다 — '확인된 문제'일 때만 시설안(B·C), 아니면 A안(운영)
  function finalAlt(set, id) { if (!set) return 'C'; if (gainOf(set.C) < REC_MIN) return 'A'; return gradeOf(id).key === 'confirmed' ? recAlt(set) : 'A'; }

  // ---------- 개략 배치 평면도(SVG) — 구청 협의용. 실시설계·측량 도면이 아님 ----------
  function planSVG(pl, meta) {
    const h = pl.h, pts = [[h.x - 90, h.y - 90], [h.x + 90, h.y + 90]];
    pl.G.forEach(g => g.items.forEach(t => pts.push([t.x, t.y]))); if (pl.shift) pl.shift.pts.forEach(q => pts.push(q));
    const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]), PAD = 18;
    let x0 = Math.min(...xs) - PAD, x1 = Math.max(...xs) + PAD, y0 = Math.min(...ys) - PAD, y1 = Math.max(...ys) + PAD;
    if ((x1 - x0) / (y1 - y0) < 1.35) { const c = (x0 + x1) / 2, w = (y1 - y0) * 1.35; x0 = c - w / 2; x1 = c + w / 2; }
    const VW = 1000, S = VW / (x1 - x0), VH = Math.round((y1 - y0) * S), X = x => ((x - x0) * S).toFixed(1), Y = y => ((y1 - y) * S).toFixed(1);
    const inB = (x, y, m) => x > x0 - m && x < x1 + m && y > y0 - m && y < y1 + m, poly = r => r.map(q => X(q[0]) + ',' + Y(q[1])).join(' ');
    const out = [];
    out.push('<defs><pattern id="pdk" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#efe2cf"/><line x1="0" y1="0" x2="0" y2="6" stroke="#a7825a" stroke-width="1.4"/></pattern>' +
      '<pattern id="plw" width="7" height="7" patternUnits="userSpaceOnUse"><rect width="7" height="7" fill="#dff0d3"/><circle cx="3.5" cy="3.5" r="1" fill="#5f9a48"/></pattern>' +
      '<marker id="par" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0L10,5L0,10z" fill="#1f7a5a"/></marker></defs>');
    out.push('<rect width="' + VW + '" height="' + VH + '" fill="#fbfaf6"/>');
    // 기존: 수관 피복(위성 20m 칸) · 숲·잔디·물·건물(OSM) · 길
    const cs = []; for (let i = 0; i < N; i++) if (TR[i] > .05 && inB(CX[i], CY[i], 20)) cs.push('<polygon points="' + poly(Q[i]) + '" fill="#4e8a4a" fill-opacity="' + (TR[i] * .42).toFixed(2) + '"/>');
    out.push('<g>' + cs.join('') + '</g>');
    FE.forEach(f => { if (!f.ring.some(q => inB(q[0], q[1], 60))) return; const st = f.k === 'water' ? 'fill="#cfe3ec" stroke="#7fa8b8"' : f.k === 'building' ? 'fill="#d9d6cf" stroke="#8f8a80"' : f.k === 'lawn' ? 'fill="none" stroke="#9cc58a" stroke-dasharray="4 3"' : 'fill="none" stroke="#7aa874" stroke-dasharray="2 3"'; out.push('<polygon points="' + poly(f.ring) + '" ' + st + ' stroke-width="1"/>'); });
    CWATER.forEach(r => { if (r.some(q => inB(q[0], q[1], 60))) out.push('<polygon points="' + poly(r) + '" fill="#cfe3ec" stroke="#7fa8b8" stroke-width="1"/>'); });
    out.push('<g stroke="#c4b79c" stroke-width="' + Math.max(2, 2.6 * S).toFixed(1) + '" stroke-linecap="round">' + NE.filter(e => inB(NX[e[0]][0], NX[e[0]][1], 30) || inB(NX[e[1]][0], NX[e[1]][1], 30)).map(e => '<line x1="' + X(NX[e[0]][0]) + '" y1="' + Y(NX[e[0]][1]) + '" x2="' + X(NX[e[1]][0]) + '" y2="' + Y(NX[e[1]][1]) + '"/>').join('') + '</g>');
    // 범위: 체류공간 40m · 환경 80m
    out.push('<circle cx="' + X(h.x) + '" cy="' + Y(h.y) + '" r="' + (ENV_R * S).toFixed(1) + '" fill="none" stroke="#6b7a73" stroke-width="1" stroke-dasharray="2 4"/>');
    out.push('<circle cx="' + X(h.x) + '" cy="' + Y(h.y) + '" r="' + (STAY_R * S).toFixed(1) + '" fill="none" stroke="#0b7a45" stroke-width="1.4" stroke-dasharray="7 4"/>');
    // 제안 시설
    if (pl.shift && pl.shift.to) { const s = pl.shift; out.push('<polyline points="' + s.pts.map(q => X(q[0]) + ',' + Y(q[1])).join(' ') + '" fill="none" stroke="#1f7a5a" stroke-width="2.6" stroke-dasharray="9 5" marker-end="url(#par)"/>'); const e = s.pts[s.pts.length - 1]; out.push('<text x="' + X(e[0]) + '" y="' + (+Y(e[1]) - 10) + '" class="pl" text-anchor="middle">→ ' + esc(s.to.name) + ' (' + Math.round(s.len) + 'm)</text>'); }
    pl.yards.forEach(y => out.push('<polygon points="' + poly(Q[y.cell]) + '" fill="url(#' + (y.surf === 'deck' ? 'pdk' : 'plw') + ')" stroke="#7a5a3a" stroke-width="1.6"/>'));
    const rot = (t, w, hh, inner) => '<g transform="translate(' + X(t.x) + ',' + Y(t.y) + ') rotate(' + (-(t.rot || 0) * 180 / Math.PI).toFixed(1) + ')">' + inner((w * S).toFixed(1), (hh * S).toFixed(1)) + '</g>';
    pl.shade.forEach(t => {
      if (t.k === 'sail') out.push(rot(t, 8, 8, (w, hh) => '<rect x="' + (-w / 2) + '" y="' + (-hh / 2) + '" width="' + w + '" height="' + hh + '" fill="#f6efe0" fill-opacity=".85" stroke="#b5651d" stroke-width="1.6"/><path d="M' + (-w / 2) + ',' + (-hh / 2) + 'L' + (w / 2) + ',' + (hh / 2) + 'M' + (w / 2) + ',' + (-hh / 2) + 'L' + (-w / 2) + ',' + (hh / 2) + '" stroke="#b5651d" stroke-width="1"/>'));
      else out.push('<circle cx="' + X(t.x) + '" cy="' + Y(t.y) + '" r="' + (4.5 * S).toFixed(1) + '" fill="#9ccc7a" fill-opacity=".55" stroke="#2f6b2a" stroke-width="1.4"/><circle cx="' + X(t.x) + '" cy="' + Y(t.y) + '" r="1.8" fill="#2f6b2a"/>');
    });
    pl.benches.forEach(t => out.push(rot(t, 3, 1, (w, hh) => '<rect x="' + (-w / 2) + '" y="' + (-hh / 2) + '" width="' + w + '" height="' + Math.max(3, hh) + '" fill="#8a5a33"/>')));
    if (pl.shift && pl.shift.sign) { const t = pl.shift.sign; out.push('<g transform="translate(' + X(t.x) + ',' + Y(t.y) + ')"><rect x="-7" y="-7" width="14" height="14" rx="2" fill="#1f7a5a"/><text y="4.5" text-anchor="middle" class="sy">i</text></g>'); }
    pl.extra.forEach(t => {
      if (t.k === 'garden') out.push('<circle cx="' + X(t.x) + '" cy="' + Y(t.y) + '" r="' + (Math.sqrt(GARDEN_M2 / Math.PI) * S).toFixed(1) + '" fill="#f7d6e6" stroke="#c0568a" stroke-width="1.4" stroke-dasharray="3 2"/>');
      else if (t.k === 'toilet') out.push(rot(t, 5, 4, (w, hh) => '<rect x="' + (-w / 2) + '" y="' + (-hh / 2) + '" width="' + w + '" height="' + hh + '" fill="#e8eef5" stroke="#4a6a8a" stroke-width="1.4"/><text y="4" text-anchor="middle" class="sm">WC</text>'));
      else out.push('<g transform="translate(' + X(t.x) + ',' + Y(t.y) + ')"><path d="M0,-8L2.4,-2.5L8,-2.5L3.5,1L5.3,7L0,3.5L-5.3,7L-3.5,1L-8,-2.5L-2.4,-2.5Z" fill="#f2b632" stroke="#9a6b00" stroke-width="1"/></g>');
    });
    // 단면선 A–A′(동서, 거점 ±70m)
    out.push('<line x1="' + X(h.x - 70) + '" y1="' + Y(h.y) + '" x2="' + X(h.x + 70) + '" y2="' + Y(h.y) + '" stroke="#b4541a" stroke-width="2" stroke-dasharray="14 4 3 4"/><text x="' + X(h.x - 70) + '" y="' + (+Y(h.y) - 6) + '" class="ab2">A</text><text x="' + X(h.x + 70) + '" y="' + (+Y(h.y) - 6) + '" class="ab2" text-anchor="end">A′</text>');
    // 거점 · 번호
    out.push('<g transform="translate(' + X(h.x) + ',' + Y(h.y) + ')"><circle r="6" fill="#fff" stroke="#0d1a14" stroke-width="2"/><circle r="2.2" fill="#0d1a14"/><text x="10" y="-8" class="hn">' + esc(h.name) + '</text></g>');
    pl.G.forEach((g, i) => out.push('<g transform="translate(' + X(g.at[0]) + ',' + Y(g.at[1]) + ')"><circle r="10" fill="#0d1a14"/><text y="4.5" text-anchor="middle" class="nb">' + (i + 1) + '</text></g>'));
    // 방위 · 축척 막대
    const sb = [10, 20, 50, 100].filter(m => m * S <= 190).pop() || 10, bx = 24, by = VH - 26;
    out.push('<g transform="translate(' + (VW - 40) + ',44)"><circle r="17" fill="#fff" stroke="#0d1a14"/><path d="M0,-14L6,6L0,2L-6,6Z" fill="#0d1a14"/><text y="-21" text-anchor="middle" class="sm">N</text></g>');
    out.push('<g><rect x="' + (bx - 8) + '" y="' + (by - 22) + '" width="' + (sb * S + 60) + '" height="34" fill="#fff" fill-opacity=".9"/><rect x="' + bx + '" y="' + by + '" width="' + (sb * S / 2).toFixed(1) + '" height="5" fill="#0d1a14"/><rect x="' + (bx + sb * S / 2).toFixed(1) + '" y="' + by + '" width="' + (sb * S / 2).toFixed(1) + '" height="5" fill="#fff" stroke="#0d1a14"/><text x="' + bx + '" y="' + (by - 6) + '" class="sm">0</text><text x="' + (bx + sb * S).toFixed(1) + '" y="' + (by - 6) + '" class="sm" text-anchor="middle">' + sb + 'm</text></g>');
    const span = x1 - x0, sc = [500, 1000, 1500, 2000, 2500, 3000, 4000, 5000].find(v => v >= span * 1000 / 270) || 6000;
    const css = '<style>.pl{font:700 13px Pretendard,sans-serif;fill:#1f7a5a;paint-order:stroke;stroke:#fff;stroke-width:3px}.hn{font:800 14px Pretendard,sans-serif;fill:#0d1a14;paint-order:stroke;stroke:#fff;stroke-width:4px}.nb{font:800 12px Pretendard,sans-serif;fill:#fff}.sy{font:800 11px Pretendard,sans-serif;fill:#fff}.sm{font:700 11px Pretendard,sans-serif;fill:#0d1a14}.ab2{font:900 16px Pretendard,sans-serif;fill:#b4541a;paint-order:stroke;stroke:#fff;stroke-width:3px}</style>';
    return { svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + VW + ' ' + VH + '" width="' + VW + '" height="' + VH + '" font-family="Pretendard, sans-serif">' + css + out.join('') + '</svg>', scale: sc, span: Math.round(span) };
  }
  // ---------- 기본설계(기본구상) 도면: A3 가로 한 장에 도곽·표제란·범례·수량표·비고 — 흑백 선 굵기·해치로 구분 ----------
  //   위치도(공원 전체) · 현황평면도 · 시설배치평면도. 1u = 1/3mm(A3 420×297mm = 1260×891u), 축척은 표준 축척 중 들어가는 가장 큰 것
  let BPN = 0, PEDGE = null;
  const BP_SC = [200, 250, 300, 400, 500, 600, 800, 1000, 1200, 1500, 2000, 2500, 3000, 4000, 5000, 6000];
  const bpEdge = () => { if (PEDGE) return PEDGE; const m = new Map(), f = q => q[0].toFixed(1) + ',' + q[1].toFixed(1);
    for (let i = 0; i < N; i++) { const r = Q[i]; for (let j = 0; j < r.length; j++) { const a = r[j], b = r[(j + 1) % r.length], p = f(a), q = f(b); if (p === q) continue; const k = p < q ? p + '|' + q : q + '|' + p; if (m.has(k)) m.delete(k); else m.set(k, [a, b]); } }
    return (PEDGE = [...m.values()]); };
  const bpWrap = (t, n) => { const out = []; let cur = ''; String(t).split(/(\s+)/).forEach(w => { if ((cur + w).length > n && cur.trim()) { out.push(cur.trim()); cur = w.trimStart(); while (cur.length > n) { out.push(cur.slice(0, n)); cur = cur.slice(n); } } else cur += w; }); if (cur.trim()) out.push(cur.trim()); return out; };
  const bpRnd = (i, t, s) => { const v = Math.sin(i * 127.1 + t * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); };
  function bpSheet(o) {
    const pl = o.pl, h = pl.h, id = 'bp' + (++BPN), mode = o.mode, out = [];
    const W = 1260, H = 891, FL = 60, FT = 30, FR = 30, FB = 30, TBW = 250, TX = W - FR - TBW;
    const DX0 = FL + 6, DX1 = TX - 6, DY0 = FT + 6, DY1 = H - FB - 6, DW = DX1 - DX0, DH = DY1 - DY0;
    let pts = [];
    if (mode === 'loc') { for (let i = 0; i < N; i++) pts.push([CX[i], CY[i]]); }
    else { pts = [[h.x - 48, h.y - 48], [h.x + 48, h.y + 48]]; if (mode === 'pl') pl.G.forEach(g => g.items.forEach(t => pts.push([t.x, t.y]))); }
    let ex0 = 1e9, ex1 = -1e9, ey0 = 1e9, ey1 = -1e9; pts.forEach(q => { ex0 = Math.min(ex0, q[0]); ex1 = Math.max(ex1, q[0]); ey0 = Math.min(ey0, q[1]); ey1 = Math.max(ey1, q[1]); });
    const pad = mode === 'loc' ? 30 : 10; ex0 -= pad; ex1 += pad; ey0 -= pad; ey1 += pad;
    const sc = BP_SC.find(s => (mode !== 'ex' || s >= 600) && (ex1 - ex0) * 3000 / s <= DW - 20 && (ey1 - ey0) * 3000 / s <= DH - 90) || 8000;
    const S = 3000 / sc, cx = (ex0 + ex1) / 2, cy = (ey0 + ey1) / 2 - 30 / S;   // 아래쪽 도면명 자리 확보
    const X = x => (DX0 + DW / 2 + (x - cx) * S).toFixed(1), Y = y => (DY0 + DH / 2 - (y - cy) * S).toFixed(1);
    const vx0 = cx - DW / 2 / S, vx1 = cx + DW / 2 / S, vy0 = cy - DH / 2 / S, vy1 = cy + DH / 2 / S, inV = (x, y, m) => x > vx0 - m && x < vx1 + m && y > vy0 - m && y < vy1 + m;
    const poly = r => r.map(q => X(q[0]) + ',' + Y(q[1])).join(' '), L = mm => (mm * 3).toFixed(2);
    const rotG = (t, inner) => '<g transform="translate(' + X(t.x) + ',' + Y(t.y) + ') rotate(' + (-(t.rot || 0) * 180 / Math.PI).toFixed(1) + ')">' + inner + '</g>';
    const R = (w, hh, a) => '<rect x="' + (-w * S / 2).toFixed(1) + '" y="' + (-hh * S / 2).toFixed(1) + '" width="' + (w * S).toFixed(1) + '" height="' + (hh * S).toFixed(1) + '" ' + a + '/>';
    // 치수선(종이 좌표): a→b 선분과 나란히 off만큼 띄워 그림, 끝은 사선 틱, 글자는 mm
    const dim = (a, b, off, txt) => { const ax = +X(a[0]), ay = +Y(a[1]), bx = +X(b[0]), by = +Y(b[1]), dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1, nx = -dy / l * off, ny = dx / l * off;
      const p = [ax + nx, ay + ny], q = [bx + nx, by + ny]; let ang = Math.atan2(dy, dx) * 180 / Math.PI; if (ang > 90) ang -= 180; if (ang <= -90) ang += 180;
      const tk = (u, v) => '<line x1="' + (u - 3).toFixed(1) + '" y1="' + (v + 3).toFixed(1) + '" x2="' + (u + 3).toFixed(1) + '" y2="' + (v - 3).toFixed(1) + '"/>';
      return '<g stroke="#000" stroke-width="' + L(.13) + '"><line x1="' + ax + '" y1="' + ay + '" x2="' + (p[0] + nx * .15).toFixed(1) + '" y2="' + (p[1] + ny * .15).toFixed(1) + '"/><line x1="' + bx + '" y1="' + by + '" x2="' + (q[0] + nx * .15).toFixed(1) + '" y2="' + (q[1] + ny * .15).toFixed(1) + '"/><line x1="' + p[0].toFixed(1) + '" y1="' + p[1].toFixed(1) + '" x2="' + q[0].toFixed(1) + '" y2="' + q[1].toFixed(1) + '"/>' + tk(p[0], p[1]) + tk(q[0], q[1]) + '</g><text class="bp-d" text-anchor="middle" transform="translate(' + ((p[0] + q[0]) / 2 + nx * .35).toFixed(1) + ',' + ((p[1] + q[1]) / 2 + ny * .35 + 3).toFixed(1) + ') rotate(' + ang.toFixed(1) + ')">' + txt + '</text>'; };
    out.push('<defs><clipPath id="' + id + 'c"><rect x="' + DX0 + '" y="' + DY0 + '" width="' + DW + '" height="' + DH + '"/></clipPath>' +
      '<pattern id="bpo" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#f1f1f1"/><circle cx="1.5" cy="1.5" r=".55" fill="#9a9a9a"/></pattern>' +
      '<pattern id="bpl" width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r=".6" fill="#555"/><circle cx="6.5" cy="5.5" r=".6" fill="#555"/><circle cx="3" cy="7.6" r=".45" fill="#777"/></pattern>' +
      '<pattern id="bpw" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#fff"/><line x1="0" y1="4" x2="5" y2="4" stroke="#444" stroke-width=".45"/></pattern>' +
      '<pattern id="bpb" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="#fff"/><line x1="0" y1="0" x2="0" y2="5" stroke="#000" stroke-width=".5"/></pattern>' +
      '<pattern id="bpk" width="' + Math.max(3, S * .9).toFixed(1) + '" height="40" patternUnits="userSpaceOnUse"><rect width="40" height="40" fill="#fff"/><line x1="0" y1="0" x2="0" y2="40" stroke="#000" stroke-width=".55"/></pattern>' +
      '<pattern id="bpg" width="5" height="5" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill="#fff"/><circle cx="2.5" cy="2.5" r=".75" fill="#000"/></pattern>' +
      '<pattern id="bpf" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#fff"/><circle cx="4" cy="4" r="1.7" fill="none" stroke="#000" stroke-width=".5"/></pattern>' +
      '<marker id="bpa" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0,1L10,5L0,9z" fill="#000"/></marker></defs>');
    out.push('<rect width="' + W + '" height="' + H + '" fill="#fff"/>');
    // ── 도면 내용(도곽 안으로 자름)
    const g = ['<g clip-path="url(#' + id + 'c)"><rect x="' + DX0 + '" y="' + DY0 + '" width="' + DW + '" height="' + DH + '" fill="url(#bpo)"/>'];
    const cl = []; for (let i = 0; i < N; i++) if (inV(CX[i], CY[i], 20)) cl.push('<polygon points="' + poly(Q[i]) + '"/>');
    g.push('<g fill="#fff" stroke="#fff" stroke-width=".8">' + (PARKB.length ? PARKB.map(r => '<polygon points="' + poly(r) + '"/>').join('') : cl.join('')) + '</g>');
    CWATER.forEach(r => { if (r.some(q => inV(q[0], q[1], 200))) g.push('<polygon points="' + poly(r) + '" fill="url(#bpw)" stroke="#000" stroke-width="' + L(.18) + '"/>'); });
    FE.forEach(f => { if (!f.ring.some(q => inV(q[0], q[1], 80))) return;
      g.push('<polygon points="' + poly(f.ring) + '" ' + (f.k === 'water' ? 'fill="url(#bpw)" stroke="#000" stroke-width="' + L(.25) + '"' : f.k === 'building' ? 'fill="url(#bpb)" stroke="#000" stroke-width="' + L(.3) + '"' : f.k === 'lawn' ? 'fill="url(#bpl)" stroke="#555" stroke-width="' + L(.1) + '" stroke-dasharray="4 3"' : 'fill="none" stroke="#555" stroke-width="' + L(.1) + '" stroke-dasharray="1.5 3"') + '/>'); });
    const es = NE.filter(e => inV(NX[e[0]][0], NX[e[0]][1], 40) || inV(NX[e[1]][0], NX[e[1]][1], 40)).map(e => '<line x1="' + X(NX[e[0]][0]) + '" y1="' + Y(NX[e[0]][1]) + '" x2="' + X(NX[e[1]][0]) + '" y2="' + Y(NX[e[1]][1]) + '"/>').join('');
    if (mode === 'loc') g.push('<g stroke="#000" stroke-width="' + L(.18) + '" stroke-linecap="round">' + es + '</g>');
    else if (PATHW.length) { const vis = PATHW.filter(w => w.pts.some(q => inV(q[0], q[1], 40))).sort((u, v) => v.w - u.w), pl2 = w => w.pts.map(q => X(q[0]) + ',' + Y(q[1])).join(' ');
      g.push('<g fill="none" stroke="#000" stroke-linecap="butt" stroke-linejoin="round">' + vis.map(w => '<polyline points="' + pl2(w) + '" stroke-width="' + (w.w * S + 1.4).toFixed(1) + '"' + (w.tag ? '' : ' stroke-dasharray="none"') + '/>').join('') + '</g><g fill="none" stroke="#fff" stroke-linecap="butt" stroke-linejoin="round">' + vis.map(w => '<polyline points="' + pl2(w) + '" stroke-width="' + Math.max(.5, w.w * S - .4).toFixed(1) + '"/>').join('') + '</g>');
      if (mode !== 'loc') g.push(vis.filter(w => w.tag && w.w * S > 9).map(w => { const k = Math.floor(w.pts.length / 2), a = w.pts[Math.max(0, k - 1)], b = w.pts[Math.min(w.pts.length - 1, k)], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2; if (!inV(mx, my, -10)) return ''; let an = -Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI; if (an > 90) an -= 180; if (an < -90) an += 180; return '<text class="bp-d" text-anchor="middle" transform="translate(' + X(mx) + ',' + (+Y(my) + 3) + ') rotate(' + an.toFixed(1) + ')">B=' + (w.w * 1000).toLocaleString() + '</text>'; }).join('')); }
    else g.push('<g stroke="#000" stroke-width="' + (4 * S + 1.4).toFixed(1) + '" stroke-linecap="round" stroke-linejoin="round">' + es + '</g><g stroke="#fff" stroke-width="' + (4 * S - .4).toFixed(1) + '" stroke-linecap="round" stroke-linejoin="round">' + es + '</g>');
    // 기존 수목(위성 수관 피복으로 추정한 위치 — 실측 아님)
    if (mode !== 'loc') { const tr = []; for (let i = 0; i < N; i++) { if (TR[i] < .05 || !inV(CX[i], CY[i], 15)) continue; const n = Math.max(1, Math.round(TR[i] * CELL_M2 / CANOPY_M2));
      for (let t = 0; t < n; t++) { const px = CX[i] + (bpRnd(i, t, 1) - .5) * 15, py = CY[i] + (bpRnd(i, t, 2) - .5) * 15, r = (2.6 + bpRnd(i, t, 3) * 1.4) * S; tr.push('<circle cx="' + X(px) + '" cy="' + Y(py) + '" r="' + r.toFixed(1) + '"/><path d="M' + (+X(px) - 1.6) + ',' + Y(py) + 'h3.2M' + X(px) + ',' + (+Y(py) - 1.6) + 'v3.2"/>'); } }
      g.push('<g fill="#fff" fill-opacity=".35" stroke="#6a6a6a" stroke-width="' + L(.1) + '">' + tr.join('') + '</g>'); }
    // 공원 경계(1점 쇄선)
    g.push('<g stroke="#000" stroke-width="' + L(mode === 'loc' ? .5 : .6) + '" stroke-dasharray="18 4 3 4" fill="none">' + (PARKB.length ? PARKB.map(r => '<polygon points="' + poly(r) + '"/>').join('') : bpEdge().filter(e => inV(e[0][0], e[0][1], 30)).map(e => '<line x1="' + X(e[0][0]) + '" y1="' + Y(e[0][1]) + '" x2="' + X(e[1][0]) + '" y2="' + Y(e[1][1]) + '"/>').join('')) + '</g>');
    // 체류공간 범위
    if (mode !== 'loc') g.push('<circle cx="' + X(h.x) + '" cy="' + Y(h.y) + '" r="' + (STAY_R * S).toFixed(1) + '" fill="none" stroke="#000" stroke-width="' + L(.18) + '" stroke-dasharray="6 4"/><text class="bp-s" x="' + X(h.x) + '" y="' + (+Y(h.y + STAY_R) - 4) + '" text-anchor="middle">체류공간 범위 R=40m</text>');
    // ── 계획 시설(굵은 선)
    const lg = [], tags = [];
    if (mode === 'pl') {
      if (pl.shift && pl.shift.to) { const s = pl.shift; g.push('<polyline points="' + s.pts.map(q => X(q[0]) + ',' + Y(q[1])).join(' ') + '" fill="none" stroke="#000" stroke-width="' + L(.35) + '" stroke-dasharray="10 4 2 4" marker-end="url(#bpa)"/>'); }
      pl.yards.forEach((y, k) => { g.push('<polygon points="' + poly(Q[y.cell]) + '" fill="url(#' + (y.surf === 'deck' ? 'bpk' : 'bpl') + ')" stroke="#000" stroke-width="' + L(.5) + '"/>'); if (!k) { const r = Q[y.cell]; g.push(dim(r[0], r[1], 16, '20,000')); } });
      pl.shade.forEach((t, k) => {
        if (t.k === 'sail') { g.push(rotG(t, R(8, 8, 'fill="#fff" fill-opacity=".55" stroke="#000" stroke-width="' + L(.5) + '"') + '<path d="M' + (-4 * S) + ',' + (-4 * S) + 'L' + (4 * S) + ',' + (4 * S) + 'M' + (4 * S) + ',' + (-4 * S) + 'L' + (-4 * S) + ',' + (4 * S) + '" stroke="#000" stroke-width="' + L(.13) + '" stroke-dasharray="4 3"/>' + [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(c => '<circle cx="' + (c[0] * 4 * S).toFixed(1) + '" cy="' + (c[1] * 4 * S).toFixed(1) + '" r="' + Math.max(1.6, .2 * S).toFixed(1) + '" fill="#000"/>').join('')));
          if (!pl.shade.slice(0, k).some(u => u.k === 'sail')) { const c = Math.cos(t.rot || 0), s2 = Math.sin(t.rot || 0), P = (u, v) => [t.x + u * c - v * s2, t.y + u * s2 + v * c]; g.push(dim(P(-4, -4), P(4, -4), -14, '8,000')); } }
        else g.push('<g stroke="#000"><circle cx="' + X(t.x) + '" cy="' + Y(t.y) + '" r="' + (4.5 * S).toFixed(1) + '" fill="#fff" fill-opacity=".6" stroke-width="' + L(.4) + '"/>' + Array.from({ length: 10 }, (_, j) => { const a = j * Math.PI / 5, r1 = 4.5 * S, r2 = 3.3 * S; return '<line x1="' + (+X(t.x) + Math.cos(a) * r1).toFixed(1) + '" y1="' + (+Y(t.y) + Math.sin(a) * r1).toFixed(1) + '" x2="' + (+X(t.x) + Math.cos(a) * r2).toFixed(1) + '" y2="' + (+Y(t.y) + Math.sin(a) * r2).toFixed(1) + '" stroke-width="' + L(.13) + '"/>'; }).join('') + '<circle cx="' + X(t.x) + '" cy="' + Y(t.y) + '" r="1.6" fill="#000"/></g>');
      });
      pl.benches.forEach(t => g.push(rotG(t, '<g fill="#000"><rect x="' + (-2.1 * S).toFixed(1) + '" y="' + (-Math.max(1.2, .3 * S)).toFixed(1) + '" width="' + (1.8 * S).toFixed(1) + '" height="' + Math.max(2.4, .6 * S).toFixed(1) + '"/><rect x="' + (.3 * S).toFixed(1) + '" y="' + (-Math.max(1.2, .3 * S)).toFixed(1) + '" width="' + (1.8 * S).toFixed(1) + '" height="' + Math.max(2.4, .6 * S).toFixed(1) + '"/></g>')));
      if (pl.shift && pl.shift.sign) { const t = pl.shift.sign; g.push('<g transform="translate(' + X(t.x) + ',' + Y(t.y) + ')"><rect x="-6" y="-6" width="12" height="12" fill="#000"/><text class="bp-i" y="3.6" text-anchor="middle">S</text></g>'); }
      pl.extra.forEach(t => {
        if (t.k === 'garden') g.push(rotG(t, R(7, 3.4, 'fill="url(#bpf)" stroke="#000" stroke-width="' + L(.4) + '"')));
        else if (t.k === 'toilet') g.push(rotG(t, R(4, 2.6, 'fill="url(#bpb)" stroke="#000" stroke-width="' + L(.5) + '"') + '<text class="bp-i2" y="3" text-anchor="middle">WC</text>'));
        else g.push('<g transform="translate(' + X(t.x) + ',' + Y(t.y) + ')"><circle r="' + Math.max(5, 1.2 * S).toFixed(1) + '" fill="#fff" stroke="#000" stroke-width="' + L(.4) + '"/><text class="bp-i2" y="3" text-anchor="middle">P</text></g>');
      });
      // 단면 지시선 A–A′
      const ax = +X(h.x - 70), bx = +X(h.x + 70), yy = +Y(h.y);
      g.push('<line x1="' + ax + '" y1="' + yy + '" x2="' + bx + '" y2="' + yy + '" stroke="#000" stroke-width="' + L(.25) + '" stroke-dasharray="16 4 3 4"/>' + [[ax, 'A'], [bx, 'A′']].map(q => '<path d="M' + q[0] + ',' + yy + 'v-14" stroke="#000" stroke-width="' + L(.5) + '" marker-end="url(#bpa)"/><circle cx="' + q[0] + '" cy="' + (yy + 13) + '" r="9" fill="#fff" stroke="#000" stroke-width="' + L(.25) + '"/><text class="bp-n" x="' + q[0] + '" y="' + (yy + 17) + '" text-anchor="middle">' + q[1] + '</text>').join(''));
      // 번호 꼬리표(수량표 번호)
      pl.G.forEach((gr, i) => { const ox = +X(gr.at[0]), oy = +Y(gr.at[1]), tx = ox + 26, ty = oy - 26; tags.push('<line x1="' + ox + '" y1="' + oy + '" x2="' + (tx - 7) + '" y2="' + (ty + 7) + '" stroke="#000" stroke-width="' + L(.13) + '"/><circle cx="' + ox + '" cy="' + oy + '" r="1.5" fill="#000"/><circle cx="' + tx + '" cy="' + ty + '" r="10" fill="#fff" stroke="#000" stroke-width="' + L(.3) + '"/><text class="bp-n" x="' + tx + '" y="' + (ty + 4.5) + '" text-anchor="middle">' + (i + 1) + '</text>'); });
    }
    // 거점 표시
    if (mode === 'loc') g.push('<circle cx="' + X(h.x) + '" cy="' + Y(h.y) + '" r="' + Math.max(9, STAY_R * S).toFixed(1) + '" fill="none" stroke="#000" stroke-width="' + L(.7) + '"/><line x1="' + (+X(h.x) + Math.max(9, STAY_R * S) * .7).toFixed(1) + '" y1="' + (+Y(h.y) - Math.max(9, STAY_R * S) * .7).toFixed(1) + '" x2="' + (+X(h.x) + 70) + '" y2="' + (+Y(h.y) - 60) + '" stroke="#000" stroke-width="' + L(.18) + '"/><text class="bp-h" x="' + (+X(h.x) + 74) + '" y="' + (+Y(h.y) - 62) + '">대상지: ' + esc(h.name) + '</text>');
    else g.push('<g transform="translate(' + X(h.x) + ',' + Y(h.y) + ')"><circle r="4.5" fill="#fff" stroke="#000" stroke-width="' + L(.3) + '"/><path d="M-8,0h16M0,-8v16" stroke="#000" stroke-width="' + L(.13) + '"/></g><text class="bp-h" x="' + (+X(h.x) + 10) + '" y="' + (+Y(h.y) + 16) + '">' + esc(h.name) + '</text>');
    g.push(tags.join('') + '</g>');
    out.push(g.join(''));
    // ── 방위표 · 도면명 · 축척 막대
    out.push('<g transform="translate(' + (DX1 - 34) + ',' + (DY0 + 40) + ')"><circle r="20" fill="#fff" stroke="#000" stroke-width="' + L(.25) + '"/><path d="M0,-18L7,8L0,3L-7,8Z" fill="#000"/><text class="bp-n" y="-24" text-anchor="middle">N</text></g>');
    const sbm = [5, 10, 20, 50, 100, 200, 500].filter(m => m * S <= 150).pop() || 5, sbx = DX0 + 16, sby = DY1 - 18;
    out.push('<rect x="' + DX0 + '" y="' + (DY1 - 70) + '" width="430" height="70" fill="#fff"/><line x1="' + DX0 + '" y1="' + (DY1 - 70) + '" x2="' + (DX0 + 430) + '" y2="' + (DY1 - 70) + '" stroke="#000" stroke-width="' + L(.13) + '"/><line x1="' + (DX0 + 430) + '" y1="' + (DY1 - 70) + '" x2="' + (DX0 + 430) + '" y2="' + DY1 + '" stroke="#000" stroke-width="' + L(.13) + '"/>' +
      '<text class="bp-t" x="' + (DX0 + 16) + '" y="' + (DY1 - 42) + '">' + esc(o.title) + '</text><line x1="' + (DX0 + 16) + '" y1="' + (DY1 - 35) + '" x2="' + (DX0 + 250) + '" y2="' + (DY1 - 35) + '" stroke="#000" stroke-width="' + L(.5) + '"/><text class="bp-s" x="' + (DX0 + 260) + '" y="' + (DY1 - 42) + '">SCALE : A3 1/' + sc.toLocaleString() + '</text>' +
      '<g><rect x="' + sbx + '" y="' + sby + '" width="' + (sbm * S / 2).toFixed(1) + '" height="4" fill="#000"/><rect x="' + (sbx + sbm * S / 2).toFixed(1) + '" y="' + sby + '" width="' + (sbm * S / 2).toFixed(1) + '" height="4" fill="#fff" stroke="#000" stroke-width=".6"/><text class="bp-s" x="' + sbx + '" y="' + (sby - 3) + '">0</text><text class="bp-s" x="' + (sbx + sbm * S).toFixed(1) + '" y="' + (sby - 3) + '" text-anchor="middle">' + sbm + 'm</text></g>');
    // ── 도곽 · 표제란(오른쪽 세로 띠)
    out.push('<rect x="' + FL + '" y="' + FT + '" width="' + (W - FL - FR) + '" height="' + (H - FT - FB) + '" fill="none" stroke="#000" stroke-width="' + L(.7) + '"/><rect x="' + (FL - 6) + '" y="' + (FT - 6) + '" width="' + (W - FL - FR + 12) + '" height="' + (H - FT - FB + 12) + '" fill="none" stroke="#000" stroke-width="' + L(.13) + '"/><line x1="' + TX + '" y1="' + FT + '" x2="' + TX + '" y2="' + (H - FB) + '" stroke="#000" stroke-width="' + L(.5) + '"/>');
    let ty = FT; const tb = [], hd = t => { tb.push('<rect x="' + TX + '" y="' + ty + '" width="' + TBW + '" height="20" fill="#eee" stroke="#000" stroke-width="' + L(.18) + '"/><text class="bp-th" x="' + (TX + TBW / 2) + '" y="' + (ty + 14) + '" text-anchor="middle">' + t + '</text>'); ty += 20; };
    // 범례
    const LEG = { bd: ['공원 경계', s => '<line x1="2" y1="7" x2="34" y2="7" stroke="#000" stroke-width="1.5" stroke-dasharray="9 2 2 2"/>'], rd: [PATHW.length ? '원로·도로(OSM 중심선)' : '원로(폭 4m 가정)', s => '<rect x="2" y="3" width="32" height="8" fill="#fff" stroke="#000" stroke-width=".9"/>'],
      et: ['기존 수목(위성 추정)', s => '<circle cx="18" cy="7" r="6" fill="#fff" stroke="#6a6a6a" stroke-width=".4"/><path d="M16.4,7h3.2M18,5.4v3.2" stroke="#6a6a6a" stroke-width=".4"/>'], lw0: ['잔디·초지', s => '<rect x="2" y="2" width="32" height="10" fill="url(#bpl)" stroke="#555" stroke-width=".4" stroke-dasharray="3 2"/>'],
      wt: ['수면', s => '<rect x="2" y="2" width="32" height="10" fill="url(#bpw)" stroke="#000" stroke-width=".6"/>'], bl: ['건축물', s => '<rect x="2" y="2" width="32" height="10" fill="url(#bpb)" stroke="#000" stroke-width=".8"/>'],
      st: ['체류공간 범위(R40m)', s => '<line x1="2" y1="7" x2="34" y2="7" stroke="#000" stroke-width=".6" stroke-dasharray="5 3"/>'], hb: ['대상지', s => '<circle cx="18" cy="7" r="6" fill="none" stroke="#000" stroke-width="2"/>'],
      dk: ['(계획) 데크 쉼터', s => '<rect x="2" y="2" width="32" height="10" fill="url(#bpk)" stroke="#000" stroke-width="1.5"/>'], lw: ['(계획) 잔디 쉼터', s => '<rect x="2" y="2" width="32" height="10" fill="url(#bpl)" stroke="#000" stroke-width="1.5"/>'],
      sl: ['(계획) 그늘막 8×8m', s => '<rect x="12" y="1" width="12" height="12" fill="#fff" stroke="#000" stroke-width="1.5"/><path d="M12,1L24,13M24,1L12,13" stroke="#000" stroke-width=".4" stroke-dasharray="2 1.5"/>'],
      tr: ['(계획) 녹음수', s => '<circle cx="18" cy="7" r="6" fill="#fff" stroke="#000" stroke-width="1.2"/><circle cx="18" cy="7" r="1.3" fill="#000"/>' + Array.from({ length: 8 }, (_, j) => { const a = j * Math.PI / 4; return '<line x1="' + (18 + Math.cos(a) * 6).toFixed(1) + '" y1="' + (7 + Math.sin(a) * 6).toFixed(1) + '" x2="' + (18 + Math.cos(a) * 4.3).toFixed(1) + '" y2="' + (7 + Math.sin(a) * 4.3).toFixed(1) + '" stroke="#000" stroke-width=".4"/>'; }).join('')],
      bn: ['(계획) 벤치 2개 1조', s => '<rect x="8" y="5" width="9" height="4" fill="#000"/><rect x="19" y="5" width="9" height="4" fill="#000"/>'], sg: ['(계획) 분산 유도 안내판', s => '<rect x="12" y="1" width="12" height="12" fill="#000"/><text class="bp-i" x="18" y="10.6" text-anchor="middle">S</text>'],
      rt: ['(계획) 분산 유도 동선', s => '<line x1="2" y1="7" x2="32" y2="7" stroke="#000" stroke-width="1" stroke-dasharray="8 3 2 3" marker-end="url(#bpa)"/>'], gd: ['(계획) 계절 정원', s => '<rect x="2" y="2" width="32" height="10" fill="url(#bpf)" stroke="#000" stroke-width="1.2"/>'],
      wc: ['(계획) 모듈형 화장실', s => '<rect x="6" y="1" width="24" height="12" fill="url(#bpb)" stroke="#000" stroke-width="1.5"/>'], ph: ['(계획) 포토존', s => '<circle cx="18" cy="7" r="6" fill="#fff" stroke="#000" stroke-width="1.2"/><text class="bp-i2" x="18" y="10" text-anchor="middle">P</text>'],
      sc: ['단면 위치', s => '<line x1="2" y1="7" x2="34" y2="7" stroke="#000" stroke-width=".8" stroke-dasharray="9 2 2 2"/>'] };
    const ks = mode === 'loc' ? ['bd', 'rd', 'wt', 'bl', 'hb'] : ['bd', 'rd', 'et', 'lw0', 'wt', 'bl', 'st'].concat(mode === 'pl' ? [].concat(pl.yards.some(y => y.surf === 'deck') ? ['dk'] : [], pl.yards.some(y => y.surf !== 'deck') ? ['lw'] : [], pl.shade.some(t => t.k === 'sail') ? ['sl'] : [], pl.shade.some(t => t.k === 'tree') ? ['tr'] : [], pl.benches.length ? ['bn'] : [], pl.shift && pl.shift.sign ? ['sg'] : [], pl.shift && pl.shift.to ? ['rt'] : [], pl.extra.some(t => t.k === 'garden') ? ['gd'] : [], pl.extra.some(t => t.k === 'toilet') ? ['wc'] : [], pl.extra.some(t => t.k === 'photo') ? ['ph'] : [], ['sc']) : []);
    hd('범 례'); ks.forEach(k => { tb.push('<g transform="translate(' + (TX + 10) + ',' + (ty + 3) + ')">' + LEG[k][1]() + '</g><text class="bp-s" x="' + (TX + 54) + '" y="' + (ty + 13) + '">' + LEG[k][0] + '</text>'); ty += 15; }); ty += 4;
    tb.push('<line x1="' + TX + '" y1="' + ty + '" x2="' + (W - FR) + '" y2="' + ty + '" stroke="#000" stroke-width="' + L(.18) + '"/>');
    // 수량표
    if (mode === 'pl' && pl.G.length) { hd('시설물 수량표'); const rows = planRows(pl);
      tb.push('<text class="bp-th2" x="' + (TX + 13) + '" y="' + (ty + 12) + '" text-anchor="middle">번호</text><text class="bp-th2" x="' + (TX + 110) + '" y="' + (ty + 12) + '" text-anchor="middle">시설 · 규격</text><text class="bp-th2" x="' + (TX + 226) + '" y="' + (ty + 12) + '" text-anchor="middle">수량</text>'); ty += 17;
      tb.push('<line x1="' + TX + '" y1="' + ty + '" x2="' + (W - FR) + '" y2="' + ty + '" stroke="#000" stroke-width="' + L(.13) + '"/>');
      rows.forEach(rw => { const ls = bpWrap(rw[1] + ' (' + rw[2] + ')', 18), y0 = ty; ls.forEach((l, j) => tb.push('<text class="bp-s" x="' + (TX + 30) + '" y="' + (ty + 12 + j * 12) + '">' + esc(l) + '</text>')); ty += ls.length * 12 + 6;
        tb.push('<text class="bp-s" x="' + (TX + 13) + '" y="' + (y0 + 12) + '" text-anchor="middle">' + rw[0] + '</text><text class="bp-s" x="' + (TX + 226) + '" y="' + (y0 + 12) + '" text-anchor="middle">' + esc(rw[3]) + '</text><line x1="' + TX + '" y1="' + ty + '" x2="' + (W - FR) + '" y2="' + ty + '" stroke="#999" stroke-width=".4"/>'); });
      tb.push('<line x1="' + (TX + 26) + '" y1="' + (ty - 0) + '" x2="' + (TX + 26) + '" y2="' + (ty - 0) + '"/>'); ty += 4; }
    // 비고
    const TBH = 238, notes = (o.notes || []).map((t, i) => (i + 1) + '. ' + t);
    hd('비 고'); notes.forEach(t => bpWrap(t, 23).forEach((l, j) => { if (ty + 14 > H - FB - TBH - 10) return; tb.push('<text class="bp-s" x="' + (TX + (j ? 18 : 8)) + '" y="' + (ty + 12) + '">' + esc(l) + '</text>'); ty += 12.5; }));
    // 표제란(아래 고정)
    const pn = bpWrap('서울숲 「' + h.name + '」 거점 휴게환경 개선 기본구상', 14); let by = H - FB - TBH - (pn.length * 14 + 8 - 44); const row = (lab, val, hh, cls) => { tb.push('<rect x="' + TX + '" y="' + by + '" width="' + TBW + '" height="' + hh + '" fill="none" stroke="#000" stroke-width="' + L(.18) + '"/><rect x="' + TX + '" y="' + by + '" width="58" height="' + hh + '" fill="#eee" stroke="#000" stroke-width="' + L(.18) + '"/><text class="bp-th2" x="' + (TX + 29) + '" y="' + (by + hh / 2 + 4) + '" text-anchor="middle">' + lab + '</text>');
      const ls = Array.isArray(val) ? val : [val]; ls.forEach((l, j) => tb.push('<text class="' + (cls || 'bp-s') + '" x="' + (TX + 66) + '" y="' + (by + hh / 2 + 4 - (ls.length - 1) * 7 + j * 14) + '">' + esc(l) + '</text>')); by += hh; };
    tb.push('<line x1="' + TX + '" y1="' + by + '" x2="' + (W - FR) + '" y2="' + by + '" stroke="#000" stroke-width="' + L(.5) + '"/>');
    row('사 업 명', pn, pn.length * 14 + 8, 'bp-v');
    row('작    성', DOC.from, 24); row('작성·검토', '작성 ○○○ / 검토 ○○○ / 책임 ○○○', 24); row('관련도면', o.rel || '—', 24); row('일    자', o.date, 24);
    row('도 면 명', bpWrap(o.title, 13), 40, 'bp-v'); row('축    척', 'A3 1/' + sc.toLocaleString() + '  (A4 출력 시 1/' + (sc * 1.414).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ')', 24);
    row('도면번호', o.no, 34, 'bp-no');
    out.push(tb.join(''));
    const css = '<style>.bp-s{font:400 10px "Malgun Gothic","맑은 고딕",sans-serif;fill:#000}.bp-d{font:400 9px "Malgun Gothic",sans-serif;fill:#000}.bp-h{font:700 12px "Malgun Gothic",sans-serif;fill:#000;paint-order:stroke;stroke:#fff;stroke-width:3px}.bp-n{font:700 11px "Malgun Gothic",sans-serif;fill:#000}.bp-i{font:700 9px Arial,sans-serif;fill:#fff}.bp-i2{font:700 8px Arial,sans-serif;fill:#000}.bp-t{font:700 19px "Malgun Gothic",sans-serif;fill:#000;letter-spacing:.12em}.bp-th{font:700 11px "Malgun Gothic",sans-serif;fill:#000;letter-spacing:.3em}.bp-th2{font:700 10px "Malgun Gothic",sans-serif;fill:#000}.bp-v{font:700 11px "Malgun Gothic",sans-serif;fill:#000}.bp-no{font:800 17px Arial,"Malgun Gothic",sans-serif;fill:#000}</style>';
    return { svg: '<svg xmlns="http://www.w3.org/2000/svg" class="bp-sheet" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '">' + css + out.join('') + '</svg>', scale: sc };
  }
  function planRows(pl) {
    const h = pl.h, spec = { yard: k => '20×20m 칸 · ' + k.items.map(y => y.surf === 'deck' ? '데크' : '잔디').join('/'), sign: () => '안내판 1 · 앱 알림', sail: () => '8×8m · 높이 4m', tree: () => '수관 지름 9m(성목 기준) · ' + (shadeSpecies() || '활엽 교목'), bench: () => '등의자 2개 1조', garden: () => GARDEN_M2 + '㎡(가정)', photo: () => '1식', toilet: () => '모듈형 1동' };
    return pl.G.map((g, i) => [String(i + 1), groupText(g, pl).t, (spec[g.k] || (() => ''))(g), String(g.k === 'bench' ? g.items.length * 2 : g.k === 'yard' ? g.items.length + '칸' : g.items.length), dirOf(h, g.at[0], g.at[1])]);
  }

  // ---------- 세 안 한눈에: 데이터로 매긴 강점 배지 + 장단점(숫자) + 이럴 때 고르세요 ----------
  function glanceData(set) {
    const v = {}; KS0.forEach(k => { const pl = set[k], c = pl.d14.crowd, hh = pl.d14.heat, sv = sensOf(pl), co = costOf(pl); v[k] = { pl, dc: c.a.raw - c.b.raw, dh: hh.a.raw - hh.b.raw, g: sv.g0, lo: sv.lo, hi: sv.hi, w: sv.hi - sv.lo, co }; });
    const best = (f, want) => { const vals = KS0.map(k => f(v[k])), m = want === 'max' ? Math.max(...vals) : Math.min(...vals); return KS0.filter((k, i) => Math.abs(vals[i] - m) < .05); };
    const badge = {}; KS0.forEach(k => badge[k] = []);
    const give = (ks, t) => { if (ks.length < 3) ks.forEach(k => badge[k].push(t)); };
    give(best(x => x.g, 'max'), '평균 효과 최대'); give(best(x => x.dc, 'max'), '붐빔 효과 최대'); give(best(x => x.dh, 'max'), '더위 효과 최대'); give(best(x => x.w, 'min'), '불확실성 최소');
    KS0.forEach(k => { const u = ALT[k].use; if (!u.sail && !u.tree && !u.yard && !u.extra) badge[k].unshift('공사 없음'); if (ALT[k].edited) badge[k].push('팀 수정'); });
    const out = {};
    KS0.forEach(k => {
      const x = v[k], pl = x.pl, c = pl.d14.crowd, hh = pl.d14.heat, h = pl.h, pros = [], cons = [];
      if (c.b.ratio > CROWD_CUT) { if (c.a.ratio <= CROWD_CUT) pros.push('혼잡 시나리오 혼잡률 ' + pc(c.b.ratio) + ' → ' + pc(c.a.ratio) + ' (기준 ' + pc(CROWD_CUT) + ' 아래로)'); else cons.push('혼잡 시나리오 혼잡률 ' + pc(c.a.ratio) + ' — 기준 ' + pc(CROWD_CUT) + ' 위에 남음'); }
      if (pl.added > 0) pros.push('수용 인원 +' + Math.round(pl.added).toLocaleString() + '명 (쉼터 ' + pl.yards.length + '칸)');
      if (pl.shift) pros.push(pl.shift.to ? pl.shift.to.name + '로 ' + pc(pl.shift.share) + ' 분산 유도' : '피크 방문 ' + pc(pl.shift.share) + ' 시간대 분산(가정)' + (pl.sign === 'digital' ? ' — 디지털 안내판' : ' — 안내판·앱 알림'));
      if (h.type === 'outdoor') { if (hh.a.s - hh.b.s > .02) pros.push('폭염 시나리오 체류공간 그늘 비율 ' + pc(hh.b.s) + ' → ' + pc(hh.a.s)); else if (hh.b.s < SHADE_TARGET) cons.push('폭염 시나리오 그늘 ' + pc(hh.a.s) + ' — 목표 ' + pc(SHADE_TARGET) + ' 미달 그대로'); }
      if (pl.env1 - pl.env0 > .5) pros.push('주변 환경 점수 ' + pl.env0.toFixed(0) + ' → ' + pl.env1.toFixed(0) + ' (휴게시설까지 ' + Math.round(pl.cmp.b.rest) + ' → ' + Math.round(pl.cmp.a.rest) + 'm)');
      if (x.co.unknown) cons.push('단가 확인 안 된 항목 ' + x.co.unknown + '개(견적 필요)');
      if (x.w > 4) cons.push('가정에 따라 효과가 ' + f1(x.lo) + ' ~ ' + f1(x.hi) + '점으로 크게 달라짐');
      if (k !== 'A') { const prev = k === 'B' ? 'A' : 'B'; if (doesTxt(pl) === doesTxt(set[prev].pl || set[prev])) cons.unshift('이 거점에서는 ' + prev + '안과 결과가 같음 — ' + (k === 'B' ? (h.type !== 'outdoor' ? '야외 거점이 아니라 그늘막을 넣지 않음' : '그늘이 이미 목표(' + pc(SHADE_TARGET) + ') 이상이거나 그늘막 놓을 자리가 없음') : '더 넣을 수단이 없음')); }
      out[k] = { badges: badge[k], pros: pros.concat(ALT[k].pros), cons: cons.concat(ALT[k].cons), pick: ALT[k].pick, g: x.g, lo: x.lo, hi: x.hi, dc: x.dc, dh: x.dh, cost: costTxt(x.co), period: ALT[k].period, does: doesTxt(pl) };
    });
    return out;
  }
  function glanceHTML(set, mode, keys) {
    keys = keys || KS0; const G = glanceData(set), mx = Math.max(1, ...KS0.map(k => Math.max(Math.abs(G[k].dc), Math.abs(G[k].dh))));
    const bar = (lab, v) => '<div class="gl-b"><span>' + lab + '</span><i><b style="width:' + Math.max(0, v / mx * 100).toFixed(0) + '%"></b></i><em>' + f1(v) + '</em></div>';
    return '<div class="gl-g ' + (mode || '') + ' n' + keys.length + '">' + keys.map(k => { const g = G[k];
      return '<div class="gl-c gl-' + k + '"><div class="gl-h"><span class="k">' + k + '</span><b>' + ALT[k].short + '</b></div>' +
        '<div class="gl-bd">' + g.badges.map(t => '<em>' + esc(t) + '</em>').join('') + '</div>' +
        '<div class="gl-n"><b>' + f1(g.lo) + ' ~ ' + f1(g.hi) + '점</b><small>예측 만족도 변화(가정에 따른 범위) · 기준 가정 ' + f1(g.g) + '점 · 실측 아닌 모형값</small></div>' +
        bar('혼잡 시나리오', g.dc) + bar('폭염 시나리오', g.dh) +
        '<div class="gl-m"><span>사업비 ' + esc(g.cost) + '</span><span>기간 ' + esc(g.period) + '</span></div>' +
        '<p class="gl-d">' + esc(g.does) + '</p>' +
        '<ul class="gl-p">' + g.pros.slice(0, 4).map(t => '<li>' + esc(t) + '</li>').join('') + '</ul>' +
        '<ul class="gl-x">' + g.cons.slice(0, 4).map(t => '<li>' + esc(t) + '</li>').join('') + '</ul>' +
        '<p class="gl-w"><b>적용 조건</b>' + esc(g.pick) + '</p></div>'; }).join('') + '</div>';
  }

  // 패널용: 한 안 = 한 줄(폭 전체). 핵심 ✔ 2개 · ✖ 2개만, 나머지는 제안서에
  function rowsHTML(set, mode, id, on, keys) {
    const G = glanceData(set), mx = Math.max(1, ...KS0.map(k => Math.max(Math.abs(G[k].dc), Math.abs(G[k].dh))));
    const bar = (lab, v) => '<span class="ro-b"><i>' + lab + '</i><s><b style="width:' + Math.max(0, v / mx * 100).toFixed(0) + '%"></b></s><em>' + f1(v) + '</em></span>';
    return '<div class="ro">' + (keys || KS0).map(k => { const g = G[k], at = mode === '2d' ? 'data-tw="' + id + '" data-alt="' + k + '"' : 'data-t="alt" data-a="' + k + '"';
      return '<button type="button" class="ro-r ro-' + k + (on === k ? ' on' : '') + '" ' + at + ' aria-pressed="' + (on === k) + '">' +
        '<span class="ro-k">' + k + '</span><span class="ro-t"><b>' + ALT[k].short + '</b>' + g.badges.slice(0, 2).map(t => '<em>' + esc(t) + '</em>').join('') + '</span><span class="ro-n" title="예측 만족도 변화 · 가정에 따른 범위(기준 가정 ' + f1(g.g) + '점)">' + f1(g.lo) + '~' + f1(g.hi).replace('+', '') + '<small>점</small></span>' +
        '<span class="ro-bs">' + bar('혼잡 시나리오', g.dc) + bar('폭염 시나리오', g.dh) + '</span>' +
        '<span class="ro-m">' + esc(g.cost) + ' · ' + esc(g.period) + '</span>' +
        '<span class="ro-p">' + g.pros.slice(0, 2).map(t => '<span>✔ ' + esc(t) + '</span>').join('') + '</span>' +
        '<span class="ro-x">' + g.cons.slice(0, 2).map(t => '<span>✖ ' + esc(t) + '</span>').join('') + '</span>' +
        '<span class="ro-w">적용 조건 → ' + esc(g.pick) + '</span></button>'; }).join('') + '</div>';
  }
  function gradeShort(g) {
    const ci = g.ci;
    if (g.key === 'few') return '평가 ' + (ci ? ci.n : 0) + '건 — ' + MIN_N + '건 이상 확보 시 판정';
    if (g.key === 'suspect') return '만족 ' + Math.round(ci.m) + '점(' + ci.n + '건) — 신뢰구간이 60점 포함' + (ci.need > ci.n ? ' · 평가 약 ' + (ci.need - ci.n) + '건 더 필요' : '');
    if (g.key === 'confirmed') return '만족 ' + Math.round(ci.m) + '점(' + ci.n + '건) — 측정치가 불만을 뒷받침';
    if (g.key === 'perception') return '만족 ' + Math.round(ci.m) + '점(' + ci.n + '건) — 측정치 정상 범위';
    if (g.key === 'latent') return '만족도 양호, 기준 초과 상황 존재';
    return '만족 ' + Math.round(ci.m) + '점(' + ci.n + '건) — 신뢰구간 하한 ' + Math.round(ci.lo) + '점, 만족 확인';
  }
  function gradeBox(g, cls) {
    return '<details class="' + cls + ' ' + g.cls + '"><summary><b>근거 판정 · ' + g.label + '</b><span>' + esc(gradeShort(g)) + '</span></summary><p>' + esc(g.act) + ' (구청 검토 참고)</p><ul>' + gradeLines(g).map(x => '<li>' + esc(x) + '</li>').join('') + '</ul></details>';
  }

  // ---------- 계산만 쓰기(2D 만족도 화면): 3D 장면을 만들기 전에 돌려준다 ----------
  if (o.headless) return { hubs, ALT, SCN, setOf: id => { const h = hubs.find(x => x.id === id); if (!h) return null; planFor(h); return SETS[id]; }, recAlt, finalAlt, allowedFor, surveyNeed, gradeOf, gradeLines, GRADE, gainOf, glanceData, glanceHTML, rowsHTML, reset: () => { Object.keys(SETS).forEach(k => delete SETS[k]); applyAltEdits(loadAltEdits()); }, gradeBox, gradeShort, sensOf, basisRows, needN, poolSD, costOf, costTxt, doesTxt, groupText, treeInfo, shadeSpecies, PET, TREE_NOTE, parkTrees, demo: !!rat.demo, places: P };

  // ---------- 렌더러 · 하늘 · 빛 ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, low ? 1 : 1.25));
  renderer.setScissorTest(true);   // 한 프레임에 왼쪽(지금)·오른쪽(개선 후)을 시저로 나눠 그림
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = low ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .5;
  const FOG = 0xc7d3dc; renderer.setClearColor(FOG);
  const cvs = renderer.domElement; cvs.className = 'tw-cv'; root.prepend(cvs);
  const scene = new THREE.Scene(); scene.fog = new THREE.Fog(FOG, 1500, 6800); scene.environmentIntensity = .25;
  // 레이어: 0 공통 · 1 개선안(오른쪽만) · 2 지금 해 · 3 개선 후 해 · 4 지금 사람 · 5 개선 후 사람
  const camera = new THREE.PerspectiveCamera(38, 1, 1.5, 9500); [1, 3, 5].forEach(l => camera.layers.enable(l));
  const camL = new THREE.PerspectiveCamera(38, 1, 1.5, 9500); camL.layers.set(0); camL.layers.enable(2); camL.layers.enable(4);
  const disp = [], add = d => { disp.push(d); return d; };
  const std = (c, ex) => add(new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: .85, metalness: 0 }, ex || {})));
  const sky = new Sky(); sky.scale.setScalar(7000); const SU = sky.material.uniforms; SU.turbidity.value = 4.5; SU.rayleigh.value = 1.1; SU.mieCoefficient.value = .004; SU.mieDirectionalG.value = .8; sky.renderOrder = -10; scene.add(sky); add(sky.geometry); add(sky.material);
  const pmrem = new THREE.PMREMGenerator(renderer), envScene = new THREE.Scene(), envSky = new Sky(); envSky.scale.setScalar(900); envScene.add(envSky); let envRT = null;
  function updateEnv() { const eu = envSky.material.uniforms; ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG'].forEach(k => { eu[k].value = SU[k].value; }); eu.sunPosition.value.copy(SU.sunPosition.value); if (envRT) envRT.dispose(); envRT = pmrem.fromScene(envScene, 0, 1, 2000); scene.environment = envRT.texture; }
  scene.add(new THREE.HemisphereLight(0xdfe9f5, 0x55633f, .25));
  const SM = (low || o.mobile) ? 1024 : 2048, SPAN = 280;
  function mkSun(layer) {
    const l = new THREE.DirectionalLight(0xfff1dc, 3); l.castShadow = true; l.shadow.mapSize.set(SM, SM);
    const c = l.shadow.camera; c.left = c.bottom = -SPAN; c.right = c.top = SPAN; c.near = 10; c.far = 2400; c.updateProjectionMatrix();
    l.shadow.bias = -.0003; l.shadow.normalBias = .35; l.shadow.radius = 3; l.layers.set(layer); scene.add(l); scene.add(l.target); return l;
  }
  // 해를 둘로: 지금 해는 새 시설을 못 봄(그림자 없음), 개선 후 해만 새 시설 그림자(새 그늘)를 드리움. 그림자 지도는 바뀔 때만 다시 그림
  const sunL = mkSun(2), sun = mkSun(3); sun.shadow.camera.layers.enable(1);

  // ---------- 바닥: 자료로 그린 평면(숲·잔디·포장·길·물) + 나무 아래 그늘 + 잔결(디테일 텍스처) ----------
  const MG = 160, gx0 = bx0 - MG, gx1 = bx1 + MG, gy0 = by0 - MG, gy1 = by1 + MG, GW = gx1 - gx0, GH = gy1 - gy0;
  const TS = low ? 2048 : 3072, cw = GW >= GH ? TS : Math.round(TS * GW / GH), ch = GW >= GH ? Math.round(TS * GH / GW) : TS, K = cw / GW;
  function planTex() {
    const c = document.createElement('canvas'); c.width = cw; c.height = ch; const x = c.getContext('2d');
    const px = p => [(p[0] - gx0) * K, (gy1 - p[1]) * K], path = ring => { ring.forEach((q, k) => { const p = px(q); k ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]); }); x.closePath(); };
    const fillRing = (ring, col) => { x.beginPath(); path(ring); x.fillStyle = col; x.fill(); };
    let s = 9; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    x.fillStyle = '#8d8b86'; x.fillRect(0, 0, cw, ch);
    for (let k = 0; k < cw * ch / 1400; k++) { x.fillStyle = rnd() > .5 ? 'rgba(60,60,58,.06)' : 'rgba(200,198,190,.05)'; const r = (2 + rnd() * 6) * K; x.fillRect(rnd() * cw, rnd() * ch, r, r); }
    x.save(); x.beginPath(); (o.rings || []).forEach(path); x.clip();
    x.fillStyle = '#6c8a45'; x.fillRect(0, 0, cw, ch);
    for (let k = 0; k < cw * ch / 500; k++) { const v = rnd(); x.fillStyle = v < .4 ? 'rgba(48,78,30,.10)' : v < .75 ? 'rgba(150,168,82,.09)' : 'rgba(120,110,62,.07)'; const r = (1.5 + rnd() * 8) * K; x.beginPath(); x.arc(rnd() * cw, rnd() * ch, r, 0, 7); x.fill(); }
    FE.filter(f => f.k === 'forest').forEach(f => fillRing(f.ring, 'rgba(70,96,46,.85)'));
    FE.filter(f => f.k === 'lawn').forEach(f => {
      fillRing(f.ring, '#7da44c');
      x.save(); x.beginPath(); path(f.ring); x.clip(); x.globalAlpha = .07; x.fillStyle = '#e8f0c0'; x.translate(cw / 2, ch / 2); x.rotate(.5); for (let k = -cw; k < cw; k += 8 * K) x.fillRect(k, -ch * 1.5, 4 * K, ch * 3); x.restore();
    });
    {   // 포장: 칸 포장비율을 작은 캔버스(1px=2m)에 그린 뒤 한 번만 부드럽게
      const sc = 2, pcv = document.createElement('canvas'); pcv.width = Math.ceil(GW / sc); pcv.height = Math.ceil(GH / sc); const y = pcv.getContext('2d');
      for (let i = 0; i < N; i++) if (B[i] > .2) { y.globalAlpha = Math.min(1, B[i] * 1.1); y.fillStyle = '#cbc4b4'; y.beginPath(); Q[i].forEach((p, k) => { const a = (CX[i] + (p[0] - CX[i]) * 1.15 - gx0) / sc, b = (gy1 - (CY[i] + (p[1] - CY[i]) * 1.15)) / sc; k ? y.lineTo(a, b) : y.moveTo(a, b); }); y.closePath(); y.fill(); }
      x.save(); x.filter = 'blur(' + Math.round(4 * K) + 'px)'; x.imageSmoothingEnabled = true; x.drawImage(pcv, 0, 0, cw, ch); x.restore();
    }
    // 나무 아래 그늘(빛이 덜 닿는 땅)
    const ao = document.createElement('canvas'); ao.width = ao.height = 64; { const a = ao.getContext('2d'), g = a.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(24,34,14,.5)'); g.addColorStop(.6, 'rgba(24,34,14,.22)'); g.addColorStop(1, 'rgba(24,34,14,0)'); a.fillStyle = g; a.fillRect(0, 0, 64, 64); }
    TL.forEach(t => { const p = px(t), r = t[2] * 1.35 * K; x.drawImage(ao, p[0] - r, p[1] - r, 2 * r, 2 * r); });
    x.lineCap = x.lineJoin = 'round';
    [[4.8, '#8f8470'], [3.6, '#d3c8ae']].forEach(([w, col]) => { x.strokeStyle = col; x.lineWidth = w * K; x.beginPath(); NE.forEach(e => { const a = px(NX[e[0]]), b = px(NX[e[1]]); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); }); x.stroke(); });
    FE.filter(f => f.k === 'building').forEach(f => fillRing(f.ring, '#a9a398'));
    x.restore();
    x.strokeStyle = '#4f6a39'; x.lineWidth = 1.6 * K; x.beginPath(); (o.rings || []).forEach(path); x.stroke();
    FE.filter(f => f.k === 'water').concat(CWATER.map(r => ({ ring: r }))).forEach(f => fillRing(f.ring, '#34596a'));
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); return add(t);
  }
  // 잔결: r = 고운 결(5m 반복), g = 큰 얼룩
  const detail = add(canvasTex(256, 256, (x, w, h) => {
    const img = x.createImageData(w, h); let s = 3; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647, G = []; for (let k = 0; k < 81; k++) G.push(rnd());
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const u = i / w * 8, v = j / h * 8, a = Math.floor(u), b = Math.floor(v), fu = u - a, fv = v - b, g = (q, r) => G[(r % 8) * 9 + (q % 8)];
      const c2 = g(a, b) * (1 - fu) * (1 - fv) + g(a + 1, b) * fu * (1 - fv) + g(a, b + 1) * (1 - fu) * fv + g(a + 1, b + 1) * fu * fv, k = (j * w + i) * 4;
      img.data[k] = 120 + rnd() * 110; img.data[k + 1] = 110 + c2 * 120; img.data[k + 2] = 160; img.data[k + 3] = 255; }
    x.putImageData(img, 0, 0);
  }, false));
  const layer = (mesh, ord) => { mesh.renderOrder = ord; mesh.material.depthWrite = false; mesh.receiveShadow = true; scene.add(mesh); return mesh; };
  const outer = layer(new THREE.Mesh(add(new THREE.PlaneGeometry(20000, 20000)), std(0x8d8b86, { roughness: 1 })), -3); outer.rotation.x = -Math.PI / 2; outer.position.set((gx0 + gx1) / 2, 0, -(gy0 + gy1) / 2);
  const gmat = std(0xffffff, { map: planTex(), roughness: 1 });
  gmat.onBeforeCompile = sh => {
    sh.uniforms.uDetail = { value: detail }; sh.uniforms.uRep = { value: new THREE.Vector2(GW / 5, GH / 5) };
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'uniform sampler2D uDetail; uniform vec2 uRep;\nvoid main() {')
      .replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.rgb *= mix(1.0, texture2D(uDetail, vMapUv * uRep).r * 1.55, .32) * mix(1.0, texture2D(uDetail, vMapUv * uRep / 11.0).g * 1.55, .28);');
  };
  const ground = layer(new THREE.Mesh(add(new THREE.PlaneGeometry(GW, GH)), gmat), -2); ground.rotation.x = -Math.PI / 2; ground.position.set(gx0 + GW / 2, 0, -(gy0 + GH / 2));
  const waterMat = std(0x2b5362, { roughness: .07, metalness: 0, envMapIntensity: 1.3 });
  FE.filter(f => f.k === 'water').map(f => f.ring).concat(CWATER).forEach(r => { const m = layer(new THREE.Mesh(add(new THREE.ShapeGeometry(new THREE.Shape(r.map(p => new THREE.Vector2(p[0], p[1]))))), waterMat), -1); m.rotation.x = -Math.PI / 2; m.position.y = .02; });

  // ---------- 건물: 창이 있는 벽 + 지붕(한 덩어리로 합침) ----------
  if (city && city.buildings) {
    const facade = add(canvasTex(128, 128, (x, w, h) => {
      x.fillStyle = '#d6d2ca'; x.fillRect(0, 0, w, h); const g = x.createLinearGradient(0, 22, 0, 104); g.addColorStop(0, '#6f8494'); g.addColorStop(1, '#3c4a55');
      x.fillStyle = g; x.fillRect(14, 22, 100, 82); x.fillStyle = 'rgba(255,255,255,.18)'; x.fillRect(14, 22, 100, 10); x.fillStyle = '#9a968e'; x.fillRect(62, 22, 4, 82); x.fillRect(0, 118, w, 10);
    }));
    facade.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const RP = [], RC = [], WP = [], WU = [], WC = []; let s = 11; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    city.buildings.forEach(b => {
      const h = b[0]; let p = pairs(b, 1); if (p.length < 3) return;
      if (p[0][0] === p[p.length - 1][0] && p[0][1] === p[p.length - 1][1]) p.pop();
      const v2 = p.map(q => new THREE.Vector2(q[0], q[1])); if (THREE.ShapeUtils.isClockWise(v2)) { v2.reverse(); p = p.slice().reverse(); }
      const t = .8 + rnd() * .22, tw = [t, t * (.97 + rnd() * .05), t * (.94 + rnd() * .06)];
      THREE.ShapeUtils.triangulateShape(v2, []).forEach(tr => [tr[0], tr[2], tr[1]].forEach(k => { RP.push(p[k][0], h, -p[k][1]); RC.push(tw[0], tw[1], tw[2]); }));
      let u0 = 0;
      for (let i = 0; i < p.length; i++) {
        const a = p[i], c = p[(i + 1) % p.length], L = Math.hypot(c[0] - a[0], c[1] - a[1]), u1 = u0 + L / 3, vh = h / 3.4;
        WP.push(a[0], 0, -a[1], c[0], 0, -c[1], c[0], h, -c[1], a[0], 0, -a[1], c[0], h, -c[1], a[0], h, -a[1]);
        WU.push(u0, 0, u1, 0, u1, vh, u0, 0, u1, vh, u0, vh); for (let k = 0; k < 6; k++) WC.push(tw[0], tw[1], tw[2]); u0 = u1;
      }
    });
    const g = add(new THREE.BufferGeometry()), nR = RP.length / 3, nW = WP.length / 3;
    g.setAttribute('position', new THREE.Float32BufferAttribute(RP.concat(WP), 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(nR * 2).fill(0).concat(WU), 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(RC.concat(WC), 3));
    g.computeVertexNormals(); g.addGroup(0, nR, 0); g.addGroup(nR, nW, 1);
    const m = new THREE.Mesh(g, [std(0x9c9ea0, { roughness: .9, vertexColors: true, side: THREE.DoubleSide }), std(0xffffff, { map: facade, roughness: .7, metalness: .05, vertexColors: true, side: THREE.DoubleSide })]);
    m.castShadow = m.receiveShadow = true; scene.add(m);
  }

  // ---------- 나무: 종류 3 × (가까움·멂) InstancedMesh, 보는 지점 130m 안은 자세한 모양·그림자, 600m 넘으면 절반만 ----------
  let TREES = [];
  const TM = new Float32Array(Math.max(1, TL.length) * 16), TC = new Float32Array(Math.max(1, TL.length) * 3);
  { const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), c = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
    TL.forEach((t, k) => { qt.setFromAxisAngle(up, t[4]); sc.setScalar(t[2] / 3); ps.set(t[0], 0, -t[1]); m4.compose(ps, qt, sc); m4.toArray(TM, k * 16);
      if (t[5] === 2) c.setHSL(.33 + t[3] * .03, .32, .2 + t[3] * .05); else if (t[5] === 1) c.setHSL(.22 + t[3] * .05, .44, .31 + t[3] * .06); else c.setHSL(.24 + t[3] * .07, .38 + t[3] * .14, .29 + t[3] * .09); c.toArray(TC, k * 3); }); }
  const TMESH = [0, 1, 2].map(kd => [0, 1].map(hi => {
    const cnt = Math.max(1, TL.filter(t => t[5] === kd).length), m = new THREE.InstancedMesh(add(treeGeo(kd, !!hi)), std(0xffffff, { roughness: .92, vertexColors: true }), cnt);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cnt * 3), 3); m.castShadow = !!hi; m.receiveShadow = !!hi; m.frustumCulled = false; m.count = 0; scene.add(m); TREES.push(m); return m;
  }));
  let lodAt = null, lodSig = ''; const lodF = new THREE.Vector3();
  function treeLOD() {
    const p = camera.position, f = controls.target; if (lodAt && lodAt.distanceTo(p) < 40 && lodF.distanceTo(f) < 30) return; lodAt = (lodAt || new THREE.Vector3()).copy(p); lodF.copy(f);
    const cnt = [[0, 0], [0, 0], [0, 0]];
    for (let k = 0; k < TL.length; k++) {
      const dx = TM[k * 16 + 12] - p.x, dz = TM[k * 16 + 14] - p.z, d2 = dx * dx + dz * dz + p.y * p.y; if (d2 > 360000 && (k & 1)) continue;
      const kd = TL[k][5], fx = TM[k * 16 + 12] - f.x, fz = TM[k * 16 + 14] - f.z, hi = fx * fx + fz * fz < 16900 ? 1 : 0, m = TMESH[kd][hi], c = cnt[kd][hi]++;
      m.instanceMatrix.array.set(TM.subarray(k * 16, k * 16 + 16), c * 16); m.instanceColor.array.set(TC.subarray(k * 3, k * 3 + 3), c * 3);
    }
    const sig = cnt.flat().join(','); if (sig === lodSig) return; lodSig = sig;
    TMESH.forEach((pr, kd) => pr.forEach((m, hi) => { m.count = cnt[kd][hi]; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }));
    shadowDirty();
  }

  // 「칸 불편도」 원형 빛(기본 꺼짐)
  const glow = new THREE.InstancedMesh(add(new THREE.PlaneGeometry(34, 34)), add(new THREE.MeshBasicMaterial({ map: add(glowTex()), transparent: true, depthWrite: false, opacity: .85, toneMapped: false })), N);
  { const m4 = new THREE.Matrix4(), rx = new THREE.Matrix4().makeRotationX(-Math.PI / 2); for (let i = 0; i < N; i++) { m4.makeTranslation(CX[i], .4, -CY[i]).multiply(rx); glow.setMatrixAt(i, m4); } }
  glow.visible = false; glow.renderOrder = 2; scene.add(glow);
  function paintGlow(sc) { const c = new THREE.Color(); for (let i = 0; i < N; i++) { const v = ramp(sc[i]); c.setRGB(v[0] / 255, v[1] / 255, v[2] / 255, THREE.SRGBColorSpace); glow.setColorAt(i, c); } glow.instanceColor.needsUpdate = true; }

  // 이용자 평가 기둥(기본 숨김 — 이름표에 평가가 나옴, 눌러서 고르기는 숨겨도 됨)
  const pillarG = new THREE.Group(); scene.add(pillarG); pillarG.visible = false;
  const PCYL = add(new THREE.CylinderGeometry(3, 3, 1, 24, 1)), PRING = add(new THREE.RingGeometry(5.5, 7, 40));
  hubs.forEach(h => {
    const p = P[h.id], pct = satPct(p), col = pct == null ? 0x8a948f : pctColor(pct), Hh = p && p.n ? Math.max(4, p.n * 2.2) : 0;
    const ring = new THREE.Mesh(PRING, add(new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .9, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }))); ring.rotation.x = -Math.PI / 2; ring.position.set(h.x, .5, -h.y); ring.renderOrder = 1; ring.userData.hub = h.id; pillarG.add(ring);
    const m = new THREE.Mesh(PCYL, add(new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: .25, transparent: true, opacity: .55, depthWrite: false, roughness: .4 }))); m.scale.y = Math.max(4, Hh); m.position.set(h.x, Math.max(4, Hh) / 2, -h.y); m.userData.hub = h.id; pillarG.add(m);
    h.top = Hh + 4; h.pct = pct; h.n = p ? p.n : 0;
  });

  // ---------- 사람(혼잡을 눈으로): 왼쪽 = 지금 인원, 오른쪽 = 개선 후 인원 ----------
  const PMAX = 1500, BODY = add(new THREE.CylinderGeometry(.2, .15, 1.3, 7).translate(0, .65, 0)), HEAD = add(new THREE.SphereGeometry(.12, 8, 6).translate(0, 1.47, 0));
  const SKIN = std(0xd7ad8a, { roughness: .7 }), CLOTH = std(0xffffff, { roughness: .8 });
  const mkPeople = lay => { const b = new THREE.InstancedMesh(BODY, CLOTH, PMAX), h = new THREE.InstancedMesh(HEAD, SKIN, PMAX); [b, h].forEach(m => { m.layers.set(lay); m.frustumCulled = false; m.count = 0; scene.add(m); }); b.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(PMAX * 3), 3); return { b, h }; };
  const PPL = { L: mkPeople(4), R: mkPeople(5) };
  const CLOTHES = ['#ece8df', '#2c3646', '#c4503f', '#3d6ea6', '#dcb04c', '#64775a', '#f4f4f2', '#262626', '#8b5c9d', '#d58b5d', '#4e8f8a', '#b9b2a5'].map(c => new THREE.Color(c));
  function scatter(side, cellsW, seed) {   // cellsW: [[cell, 무게]] — 열린 땅 넓이만큼 사람을 뿌림(물·건물 안은 뺌)
    const P2 = PPL[side], m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0); let s = seed;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647, tot = cellsW.reduce((a, c) => a + c[1], 0) || 1; let n = 0;
    for (let tries = 0; n < PMAX && tries < PMAX * 4; tries++) {
      let r = rnd() * tot, ci = cellsW[0][0]; for (const c of cellsW) { r -= c[1]; if (r <= 0) { ci = c[0]; break; } }
      const u = rnd(), v = rnd(), Qc = Q[ci], x = (Qc[0][0] * (1 - u) + Qc[1][0] * u) * (1 - v) + (Qc[3][0] * (1 - u) + Qc[2][0] * u) * v, y = (Qc[0][1] * (1 - u) + Qc[1][1] * u) * (1 - v) + (Qc[3][1] * (1 - u) + Qc[2][1] * u) * v;
      if (!okPt(x, y)) continue;
      q.setFromAxisAngle(up, rnd() * 6.28); sc.setScalar(.9 + rnd() * .2); ps.set(x, .02, -y); m4.compose(ps, q, sc); P2.b.setMatrixAt(n, m4); P2.h.setMatrixAt(n, m4); P2.b.setColorAt(n, CLOTHES[Math.floor(rnd() * CLOTHES.length)]); n++;
    }
    P2.b.instanceMatrix.needsUpdate = P2.h.instanceMatrix.needsUpdate = P2.b.instanceColor.needsUpdate = true; P2.max = n;
  }
  function setCount(side, n) { const P2 = PPL[side]; P2.b.count = P2.h.count = Math.min(P2.max || 0, Math.round(n)); }

  // ---------- 시설 모형 ----------
  const plank = add(canvasTex(128, 128, (x, w, h) => { for (let i = 0; i < 8; i++) { const l = 52 + (i * 37 % 11); x.fillStyle = 'hsl(28,' + (38 + i % 3 * 4) + '%,' + l + '%)'; x.fillRect(0, i * 16, w, 15); x.fillStyle = 'rgba(40,24,10,.5)'; x.fillRect(0, i * 16 + 15, w, 1); x.fillRect((i * 53) % w, i * 16, 1, 15); } }));
  plank.repeat.set(1 / 2.4, 1 / 2.4);
  const MT = { wood: std(0x9b6b43, { roughness: .7 }), metal: std(0x4f5457, { metalness: .6, roughness: .4 }), steel: std(0xc9cdd0, { metalness: .7, roughness: .35 }), fabric: std(0xf3f0e8, { side: THREE.DoubleSide, roughness: .9 }),
    concrete: std(0xbab4a8, { roughness: .95 }), deck: std(0xffffff, { map: plank, roughness: .8 }), lawn: std(0x6e9f45, { roughness: 1 }), white: std(0xeceae4), dark: std(0x3b3f42), soil: std(0x5b4636, { roughness: 1 }),
    red: std(0xd34d4d), yellow: std(0xf0c24b), purple: std(0x9c6ad0), pink: std(0xf08ab4), screen: std(0x111518, { emissive: 0x2fd39a, emissiveIntensity: .9 }) };
  const TREE_HI = add(treeGeo(0, true)), TREE_MAT = std(new THREE.Color().setHSL(.27, .42, .33), { roughness: .92, vertexColors: true });
  const BOX = add(new THREE.BoxGeometry(1, 1, 1)), CYL = add(new THREE.CylinderGeometry(1, 1, 1, 12)), SPH = add(new THREE.SphereGeometry(1, 10, 8)), TOR = add(new THREE.TorusGeometry(1, .07, 8, 32)), SAIL = add(sailGeo());
  function pt(g, m, sx, sy, sz, x, y, zz, ry) { const k = new THREE.Mesh(g, m); k.scale.set(sx, sy, sz); k.position.set(x, y, zz); if (ry) k.rotation.y = ry; k.castShadow = k.receiveShadow = true; return k; }
  function bench(g, x, z, ry) { const b = new THREE.Group(); for (let i = 0; i < 4; i++) b.add(pt(BOX, MT.wood, 1.8, .04, .09, 0, .44, -.17 + i * .11)); for (let i = 0; i < 3; i++) b.add(pt(BOX, MT.wood, 1.8, .08, .03, 0, .58 + i * .11, -.24)); [-.75, .75].forEach(e => b.add(pt(BOX, MT.metal, .06, .44, .46, e, .22, 0), pt(BOX, MT.metal, .06, .36, .04, e, .62, -.25))); b.position.set(x, 0, z); b.rotation.y = ry || 0; g.add(b); }
  function model(k, t) {
    const g = new THREE.Group(), a = (...p) => p.forEach(x => g.add(x));
    if (k === 'bench') { bench(g, -1.2, 0, 0); bench(g, 1.2, 0, 0); }
    if (k === 'sail') { [[-4.15, -4.15, 5], [4.15, -4.15, 3.8], [-4.15, 4.15, 3.8], [4.15, 4.15, 5]].forEach(([x, z, h]) => a(pt(CYL, MT.steel, .09, h, .09, x, h / 2, z))); const m = new THREE.Mesh(SAIL, MT.fabric); m.castShadow = m.receiveShadow = true; a(m); bench(g, -1.6, 1.2, 0); bench(g, 1.6, -1.2, Math.PI); }
    if (k === 'tree') { const m = new THREE.Mesh(TREE_HI, TREE_MAT); m.scale.setScalar(1.08); m.castShadow = m.receiveShadow = true; a(m, pt(BOX, MT.metal, 1.6, .05, 1.6, 0, .03, 0)); }
    if (k === 'sign') { a(pt(BOX, MT.dark, .14, 2.3, .14, 0, 1.15, 0), pt(BOX, MT.dark, 1.5, 1, .14, 0, 2.05, 0)); const sc = new THREE.Mesh(BOX, new THREE.MeshStandardMaterial({ color: 0x0c1012, emissive: 0xffffff, emissiveMap: signTex(t), emissiveIntensity: 1.1 })); sc.scale.set(1.36, .86, .02); sc.position.set(0, 2.05, .08); a(sc); }
    if (k === 'toilet') a(pt(BOX, MT.white, 4, 2.8, 2.6, 0, 1.4, 0), pt(BOX, MT.dark, 4.6, .18, 3.2, 0, 2.9, 0), pt(BOX, MT.wood, .9, 2, .05, -.8, 1, 1.31), pt(BOX, MT.wood, .9, 2, .05, .8, 1, 1.31));
    if (k === 'garden') { a(pt(BOX, MT.concrete, 7, .45, 3.4, 0, .22, 0), pt(BOX, MT.soil, 6.6, .1, 3, 0, .46, 0)); let s = 5; const r = () => (s = (s * 16807) % 2147483647) / 2147483647; for (let i = 0; i < 46; i++) a(pt(SPH, [MT.red, MT.yellow, MT.purple, MT.pink, MT.white][i % 5], .2, .2, .2, (r() - .5) * 6.2, .6 + r() * .15, (r() - .5) * 2.7)); }
    if (k === 'photo') { const t2 = new THREE.Mesh(TOR, MT.yellow); t2.scale.setScalar(1.3); t2.position.y = 1.5; t2.castShadow = true; a(t2, pt(BOX, MT.concrete, 2.4, .12, 1.4, 0, .06, 0)); }
    return g;
  }
  function signTex(t) { return add(canvasTex(256, 160, (x, w, h) => { x.fillStyle = '#0c1714'; x.fillRect(0, 0, w, h); x.fillStyle = '#6af5b0'; x.font = '700 26px Pretendard Variable, sans-serif'; x.fillText('실시간 혼잡 안내', 16, 42); x.fillStyle = '#f1f7f3'; x.font = '600 22px Pretendard Variable, sans-serif'; x.fillText('여기 붐빔 → ', 16, 86); x.fillStyle = '#6af5b0'; x.fillText((t && t.to ? t.to.name : '').slice(0, 9), 16, 122); x.fillStyle = '#f1f7f3'; x.font = '500 18px Pretendard Variable, sans-serif'; x.fillText(t && t.to ? '여유 · 걸어서 ' + Math.max(1, Math.round(t.len / 70)) + '분' : '', 16, 150); })); }
  function yardMesh(y) {
    const i = y.cell, q = Q[i].map(p => [CX[i] + (p[0] - CX[i]) * .97, CY[i] + (p[1] - CY[i]) * .97]), g = new THREE.Group();
    const s = new THREE.Mesh(add(new THREE.ShapeGeometry(new THREE.Shape(q.map(p => new THREE.Vector2(p[0], p[1]))))), y.surf === 'deck' ? MT.deck : MT.lawn); s.rotation.x = -Math.PI / 2; s.position.y = y.surf === 'deck' ? .14 : .05; s.receiveShadow = true; g.add(s);
    // 가장자리 앉음벽 두 변 + 가운데 벤치
    [[0, 1], [1, 2]].forEach(([a2, b2]) => { const A2 = q[a2], B2 = q[b2], L = Math.hypot(B2[0] - A2[0], B2[1] - A2[1]), ang = Math.atan2(B2[1] - A2[1], B2[0] - A2[0]); const w = pt(BOX, MT.concrete, L * .82, .45, .5, (A2[0] + B2[0]) / 2, .22, -(A2[1] + B2[1]) / 2, -ang); w.position.x += Math.sin(ang) * .0; g.add(w); });
    bench(g, CX[i] - 3, -CY[i] + 2, 0); bench(g, CX[i] + 3, -CY[i] - 2, Math.PI);
    return g;
  }
  const HALO_G = add(new THREE.PlaneGeometry(1, 1));
  function haloMesh(x, y, w, h, rot) {
    const K2 = 10, c = document.createElement('canvas'); c.width = Math.round(w * K2); c.height = Math.round(h * K2);
    const AC = { A: '120,200,255', B: '255,196,64', C: '106,245,176' }[alt] || '106,245,176';
    const g = c.getContext('2d'), m = 1.4 * K2; g.fillStyle = 'rgba(' + AC + ',.12)'; g.strokeStyle = 'rgba(' + AC + ',.98)'; g.lineWidth = .55 * K2; g.shadowColor = 'rgba(' + AC + ',.95)'; g.shadowBlur = 1.4 * K2;
    g.beginPath(); g.roundRect(m, m, c.width - 2 * m, c.height - 2 * m, 2 * K2); g.fill(); g.stroke(); g.stroke();
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const me = new THREE.Mesh(HALO_G, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, opacity: .85, toneMapped: false }));
    me.scale.set(w, h, 1); me.rotation.order = 'YXZ'; me.rotation.set(-Math.PI / 2, rot || 0, 0); me.position.set(x, .2, -y); me.renderOrder = 5; me.userData.own = true; return me;
  }
  const itemsG = new THREE.Group(); scene.add(itemsG);

  // ---------- 상태 ----------
  let hour = o.hour >= 7 && o.hour <= 19 ? o.hour : 14, scn = SCN.crowd, items = [], last = null;
  const hubOf = id => hubs.find(h => h.id === id);
  let sel = hubOf(o.hub.id) || hubs[0];
  if (o.auto) { const lo = hubs.filter(h => h.n >= 5).sort((a, b) => a.pct - b.pct)[0]; if (lo) sel = lo; }
  // 구청 검토 화면(?review=거점id): 팀원 화면 틀 — 오른쪽 위 A·B·C, 누르면 왼쪽 자세히 창 + 3D 현황/대안 적용 분할
  const REVIEW = !!o.review; let picked = null;
  // 검토 화면은 상황을 하나로: 「붐비는 여름 주말」 = 사람·혼잡은 혼잡 시나리오, 해·그늘은 폭염 시나리오, 만족도는 두 시나리오 평균(평균 효과와 같은 식)
  const MIX = Object.assign({}, SCN.crowd, { key: 'mix', label: '붐비는 여름 주말', date: '혼잡·폭염 시나리오 평균', doy: SCN.heat.doy });
  if (REVIEW) scn = MIX;
  function evalMix(pl, hr) { const c = evalHub(pl, SCN.crowd, hr), x = evalHub(pl, SCN.heat, hr), m = k => Object.assign({}, c[k], { raw: (c[k].raw + x[k].raw) / 2, s: x[k].s, rawC: c[k].raw, rawH: x[k].raw }); return { b: m('b'), a: m('a') }; }
  const evNow = (pl, hr) => scn === MIX ? evalMix(pl, hr) : evalHub(pl, scn, hr);
  const PRINT_ICO = '<svg class="ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 9V3h10v6M7 17H4v-7a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v7h-3M7 14h10v7H7z"/></svg>';
  if (REVIEW && o.onHub) o.onHub(sel.id);

  // ---------- 해 ----------
  const ctr = new THREE.Vector3();
  function placeSun(env) {
    const sd = sunDir(hour, scn.doy), v = new THREE.Vector3(sd.x, Math.max(.02, sd.z), -sd.y).normalize(), k = clamp01(sd.alt / 25);
    SU.sunPosition.value.copy(v);
    [sunL, sun].forEach(l => { l.target.position.copy(ctr); l.position.copy(ctr).addScaledVector(v, 1200); l.target.updateMatrixWorld(); l.intensity = sd.alt <= 0 ? 0 : .9 + 1.7 * k; l.color.setHSL(.09, .6 - .45 * k, .62 + .3 * k); });
    if (env) updateEnv();
    shadowDirty();
  }

  // ---------- 카메라 ----------
  const controls = new OrbitControls(camera, cvs);
  controls.maxPolarAngle = 1.4; controls.minDistance = 18; controls.maxDistance = 2600; controls.screenSpacePanning = false; controls.enableDamping = true; controls.dampingFactor = .12;
  let dirty = true, fly = null, labDirty = true, shL = true, shR = true;
  function shadowDirty() { shL = shR = true; dirty = true; }
  controls.addEventListener('end', () => treeLOD());
  controls.addEventListener('change', () => { dirty = labDirty = true; if (controls.target.distanceTo(ctr) > 140) { ctr.copy(controls.target); placeSun(false); } });
  const above = h => ({ t: new THREE.Vector3(h.x, 0, -h.y), p: new THREE.Vector3(h.x, 1300, -h.y + 1) });
  function planView(h) {
    const pl = plans[h.id], pts = [[h.x, h.y]]; if (pl) pl.G.forEach(g => g.items.forEach(t => pts.push([t.x, t.y])));
    const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const VP = { A: { dir: [-80, 55, 160], k: .72, min: 110 }, B: { dir: [165, 120, 95], k: 1, min: 170 }, C: { dir: [-35, 280, 80], k: 1.3, min: 240 } }[alt] || { dir: [-110, 105, 170], k: 1, min: 200 };
    const Rr = Math.max(30, ...pts.map(q => Math.hypot(q[0] - cx, q[1] - cy))) + 10, v = views[views.length - 1], dir = new THREE.Vector3(...VP.dir).normalize();
    let d = VP.min;
    if (v) { const fh = v.cam.view ? v.cam.view.fullHeight : v.h, f = fh / 2 / Math.tan(v.cam.fov * Math.PI / 360), wv = v.vis.x1 - v.vis.x0, hv = v.vis.y1 - v.vis.y0; d = Math.min(850, Math.max(d, VP.k * Rr * f / (.5 * Math.min(wv, hv * 1.25)))); }
    return { t: new THREE.Vector3(cx, 0, -cy), p: new THREE.Vector3(cx, 0, -cy).addScaledVector(dir, d) };
  }
  function flyTo(to, dur, done) { fly = { a: { t: controls.target.clone(), p: camera.position.clone() }, b: to, t0: performance.now(), dur, done }; controls.enabled = false; }
  { const s = above(sel); camera.position.copy(s.p); controls.target.copy(s.t); camera.lookAt(s.t); ctr.copy(s.t); }

  // ---------- 덧씌운 화면 ----------
  const ui = document.createElement('div'); ui.className = 'tw-ui'; root.appendChild(ui);
  if (REVIEW) root.classList.add('tw-review');
  ui.innerHTML = REVIEW ?
    '<header class="tw-top tw-g"><button type="button" class="tw-home" data-t="exit">← 만족도 화면</button><b>디지털트윈 개선안</b><span class="tw-tag gov">구청 검토용</span><span class="tw-hubchip"></span>' + (rat.demo ? '<span class="tw-demo">시연용 가상 평가</span>' : '') +
    '<span class="tw-sp"></span><span class="tw-vsw" role="group" aria-label="대안 선택"></span>' +
    '<button type="button" data-t="hq" aria-pressed="false" title="카메라 정지 시 GTAO 적용 재렌더링">고품질</button><span class="tw-q" hidden></span>' +
    '<button type="button" class="tw-exit tw-prt" data-t="report" hidden>' + PRINT_ICO + '<span>검토 자료 인쇄</span></button></header>' +
    '<aside class="tw-pop tw-g" role="dialog" aria-label="대안 자세히" hidden></aside>' +
    '<div class="tw-hid" hidden><aside class="tw-left"><div class="tw-abcl"></div><div class="tw-lowl"></div><div class="tw-livebox"></div></aside><aside class="tw-right"><div class="tw-pred"></div><div class="tw-rate"></div></aside></div>' +
    '<div class="tw-time tw-g"><div class="t"><span class="tw-day"></span><b class="tw-hr">—</b><small class="tw-sun"></small></div><input class="tw-range" type="range" min="7" max="19" step="0.25" aria-label="시각"><div class="tw-ticks">' + [7, 10, 13, 16, 19].map(h => '<span>' + h + '시</span>').join('') + '</div></div>' +
    '<div class="tw-split"><i class="tw-div"></i><b class="tw-vl" data-s="L">현황</b><b class="tw-vl" data-s="R">대안 적용</b><div class="tw-vs" data-s="L"></div><div class="tw-vs" data-s="R"></div></div>' +
    '<div class="tw-labs"></div><div class="tw-nums"></div><div class="tw-fps" hidden></div><div class="tw-report" hidden></div>'
    :
    '<header class="tw-top tw-g"><b>디지털트윈 개선 시뮬레이션</b><span class="tw-tag">관리자</span>' + (rat.demo ? '<span class="tw-demo">시연용 가상 평가</span>' : '') +
    '<span class="tw-sp"></span><span class="tw-seg tw-scn" role="group" aria-label="상황"><button type="button" data-t="crowd" aria-pressed="true">혼잡 시나리오</button><button type="button" data-t="heat" aria-pressed="false">폭염 시나리오</button></span>' +
    '<span class="tw-seg tw-abc" role="group" aria-label="대안"><button type="button" data-t="alt" data-a="A" aria-pressed="false">A안</button><button type="button" data-t="alt" data-a="B" aria-pressed="false">B안</button><button type="button" data-t="alt" data-a="C" aria-pressed="false">C안</button></span><span class="tw-seg" role="group" aria-label="보기 방식"><button type="button" data-t="one" aria-pressed="false">단일 뷰</button><button type="button" data-t="split" aria-pressed="true">비교 뷰</button></span>' +
    '<button type="button" data-t="glow" aria-pressed="false">격자 취약도</button><button type="button" data-t="hq" aria-pressed="false" title="카메라 정지 시 GTAO 적용 재렌더링">고품질 렌더링</button><span class="tw-q" hidden></span>' +
    '<button type="button" class="tw-exit" data-t="exit">2D 지도로 복귀</button></header>' +
    '<aside class="tw-left tw-g"><div class="tw-abcl"></div><h3>만족도 하위 거점 <small>선택 시 해당 거점 대안 표시</small></h3><div class="tw-lowl"></div><div class="tw-livebox"></div></aside>' +
    '<aside class="tw-right tw-g"><div class="tw-pred"></div><div class="tw-rate"></div></aside>' +
    '<div class="tw-time tw-g"><div class="t"><span class="tw-day"></span><b class="tw-hr">—</b><small class="tw-sun"></small></div><input class="tw-range" type="range" min="7" max="19" step="0.25" aria-label="시각"><div class="tw-ticks">' + [7, 10, 13, 16, 19].map(h => '<span>' + h + '시</span>').join('') + '</div></div>' +
    '<div class="tw-split"><i class="tw-div"></i><b class="tw-vl" data-s="L">현황</b><b class="tw-vl" data-s="R">대안 적용</b><div class="tw-vs" data-s="L"></div><div class="tw-vs" data-s="R"></div></div>' +
    '<div class="tw-labs"></div><div class="tw-nums"></div><div class="tw-fps" hidden></div><div class="tw-report" hidden></div>';
  const $ = s => ui.querySelector(s), range = $('.tw-range'), labs = $('.tw-labs'), nums = $('.tw-nums');
  range.value = hour;
  function lowList() { return hubs.filter(h => h.n >= 5).sort((a, b) => a.pct - b.pct).slice(0, 5); }
  function lowHTML() {
    const L = lowList(); if (!L.includes(sel)) L.push(sel);
    $('.tw-lowl').innerHTML = L.map(h => { const tb = topBad(P[h.id]), set = SETS[h.id], pl = set === undefined ? undefined : set ? set.C : null;
      const best = set ? ['A', 'B', 'C'].map(k => [k, gainOf(set[k])]).sort((x, y) => y[1] - x[1])[0] : null, g = best ? (best[1] < .5 ? '대안 3건 수립 · 개선 효과 미미' : '대안 3건 수립 · 최대 개선 ' + f1(best[1]) + '점(' + best[0] + '안)') : '';
      return '<button type="button" class="tw-lo' + (h.id === sel.id ? ' on' : '') + '" data-h="' + h.id + '"><span class="nm"><b>' + esc(h.name) + '</b>' + (h.pct == null ? '<em class="na">평가 없음</em>' : '<em style="color:' + pctCss(h.pct) + '">😊 ' + Math.round(h.pct) + '%</em>') + '</span>' +
        '<small>' + (h.n ? '응답 ' + h.n + '건' + (tb ? ' · ' + BAD[tb[0]] + ' ' + tb[1] : '') : '') + '</small>' +
        '<span class="pl">' + (pl === undefined ? '대안 산정 중…' : !pl ? '분석 범위 밖' : g) + '</span></button>'; }).join('');
  }
  function evHub(id) {
    const L = hubEv(id); if (!L.length) return '';
    return '<h4 class="tw-evh">불만 요인 검증 <small>평가 시점 서울시 실시간 도시데이터 대조</small></h4><ul class="tw-ev">' + L.map(e => {
      const c = COND[e.key], ok = e.park.v === 'yes';
      return '<li class="v-' + e.park.v + '"><b>「' + BAD[e.key] + '」 ' + e.n + '건 · ' + (e.inCond != null ? c.inLabel + ' 때 ' + e.inCond + '건' : '') + '</b><small>공원 전체: ' + VTXT[e.park.v] + ' (' + esc(evLine(e.key)) + ')' +
        (e.key === 'crowded' ? (ok ? ' → 혼잡률 55% 초과 시 혼잡 대응 적용' : ' → 혼잡률 70% 기준 적용') : (ok ? ' → 차양 대응 적용' : ' → 하절기 표본 확보 후 재검증')) +
        (e.key === 'crowded' && e.inCond != null && e.n >= 2 && e.inCond / e.n < .5 ? '. 단, ' + (e.n - e.inCond) + '/' + e.n + '건이 「여유」 시간대 응답 — 공간 협소·동선 병목 가능성, 현장 확인 필요' : '') + '</small></li>';
    }).join('') + '</ul>';
  }
  // 갈래별 설명: 문제 → 처방 → 효과
  function groupText(g, pl) {
    const h = pl.h, n = g.items.length;
    if (g.k === 'yard') { const nd = g.items.filter(y => y.surf === 'deck').length, nl = n - nd; return { t: '체류공간 확충 ' + n + '칸(' + (n * CELL_M2).toLocaleString() + '㎡)', d: '거점에 붙은 ' + [nd ? '포장 광장 ' + nd + '칸 → 그늘 데크' : '', nl ? '빈 땅 ' + nl + '칸 → 잔디 쉼터' : ''].filter(Boolean).join(', ') + ' · 앉음벽·벤치 · 수용 +' + Math.round(pl.added) + '명' }; }
    if (g.k === 'sign') { const s = pl.shift, how = pl.sign === 'digital' ? '디지털 혼잡 안내판' : '안내판·앱 알림'; if (!s.to) return { t: '혼잡 시간대 분산 안내(' + how + ')', d: '450m 안 여유 거점 없음 → 혼잡 예보로 피크(14시 전후) 방문 ' + pc(s.share) + '를 다른 시간대로 분산(가정) · 약 ' + Math.round(s.n) + '명' }; return { t: '혼잡 분산 유도 안내(' + how + ')', d: '붐빌 때 ' + s.to.name + '(같은 시각 ' + pc(s.rTo) + ', 길 따라 ' + Math.round(s.len) + 'm)에 ' + pc(s.share) + ' 안내 → ' + Math.round(s.n) + '명 이동 · 그곳은 ' + pc(s.rTo) + ' → ' + pc(s.rTo1) }; }
    if (g.k === 'sail') return { t: '대형 차양(그늘막) ' + n + '개', d: '8×8m · ' + g.items.map(t => dirOf(h, t.x, t.y)).slice(0, 3).join(', ') + ' · 아래 벤치' };
    if (g.k === 'tree') return { t: '녹음수 ' + n + '그루', d: '수관 지름 9m로 자랐을 때 · ' + g.items.map(t => dirOf(h, t.x, t.y)).slice(0, 3).join(', ') };
    if (g.k === 'bench') return { t: '쉼터 벤치 ' + n * 2 + '개', d: '휴게시설 원거리 격자(평균 ' + Math.round(pl.stay0.reduce((s, i) => s + R[i], 0) / pl.stay0.length) + 'm)에' };
    const t = g.items[0]; return { t: FAC[g.k].label, d: t.why + ' · 점수 밖' };
  }
  // ---------- A/B/C안 고르기 · 특징 비교 ----------
  function costTxt(c) {
    if (!c.lines.length) return '0원(설치 없음)';
    if (c.unknown === c.lines.length) return '견적 필요';
    return wonR(c.lo, c.hi) + (c.unknown ? ' + 견적 ' + c.unknown + '건' : '');
  }
  function doesTxt(pl) { return pl.G.length ? pl.G.map(g => groupText(g, pl).t).join(' · ') : '바꾸지 않음(기준을 넘지 않음)'; }
  function altRows(set) {
    const K = ['A', 'B', 'C'], cell = f => K.map(k => f(set[k], ALT[k], k));
    return [
      ['하는 일', cell(pl => doesTxt(pl))],
      ['개략 비용', cell(pl => costTxt(costOf(pl)))],
      ['기간', cell((pl, a) => a.period)],
      ['절차', cell((pl, a) => a.proc)],
      ['혼잡 시나리오 14시', cell(pl => pl.d14.crowd.b.raw.toFixed(0) + '→' + pl.d14.crowd.a.raw.toFixed(0) + '점 · 혼잡률 ' + pc(pl.d14.crowd.a.ratio))],
      ['폭염 시나리오 14시', cell(pl => pl.d14.heat.b.raw.toFixed(0) + '→' + pl.d14.heat.a.raw.toFixed(0) + '점 · 그늘 ' + pc(pl.d14.heat.a.s))],
      ['비용 근거', cell(pl => { const c = costOf(pl); return c.lines.length ? (c.lines.length - c.unknown) + '/' + c.lines.length + '개 항목 단가 확인' : '설치 없음'; })],
      ['장점', cell((pl, a) => a.pros.join(' / '))],
      ['단점', cell((pl, a) => a.cons.join(' / '))]
    ];
  }
  function altHTML() {
    const set = SETS[sel.id]; if (!set) return '';
    const gr = gradeOf(sel.id);
    const sig = pl => pl.G.map(g => g.k + g.items.length).join() + (pl.sign || '');
    const why = k => k === 'B' ? (sel.type !== 'outdoor' ? '비야외 거점 — 차양 미적용' : pc(set.A.d14.heat.b.s) + ' 그늘이 이미 목표(' + pc(SHADE_TARGET) + ') 이상 또는 설치 가능 위치 없음') : '추가 적용 수단 없음';
    const card = k => { const pl = set[k], g = gainOf(pl), pk = k === 'B' ? 'A' : k === 'C' ? 'B' : null, same = pk && sig(set[pk]) === sig(pl);
      return '<button type="button" class="tw-alt' + (alt === k ? ' on' : '') + '" data-t="alt" data-a="' + k + '" aria-pressed="' + (alt === k) + '"><span class="k">' + k + '</span><b>' + ALT[k].short + '</b>' + 
        '<small>' + esc(costTxt(costOf(pl))) + '</small><small>' + esc(ALT[k].period) + '</small><span class="g' + (g > .5 ? ' up' : '') + '">만족도 ' + f1(g) + '점</span>' + (same ? '<small class="same">' + pk + '안과 같음 — ' + esc(why(k)) + '</small>' : '') + '</button>'; };
    const rows = altRows(set);
    const gbox = gradeBox(gr, 'tw-grade');
    return gbox + '<section class="tw-alts"><h4>대안 비교(A·B·C) — 선택 주체: 구청 <button type="button" class="tw-edbtn" data-t="ed-open">✎ 대안 구성 편집</button><small>항목 선택 시 우측 3D에 해당 대안 표시 · 14시 모형 예측치</small></h4>' +
      rowsHTML(set, 'twin', sel.id, alt) +
      '<details class="tw-cmpd"><summary>대안 비교표(상세)</summary><div class="tw-cmpw"><table class="tw-cmp"><thead><tr><th></th>' + ['A', 'B', 'C'].map(k => '<th' + (alt === k ? ' class="on"' : '') + '>' + ALT[k].name + '</th>').join('') + '</tr></thead><tbody>' +
      rows.map(r => '<tr><th>' + r[0] + '</th>' + r[1].map((v, j) => '<td' + (alt === 'ABC'[j] ? ' class="on"' : '') + '>' + esc(v) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div></details></section>';
  }
  // ---------- 나무 현황(유추) 카드 ----------
  function treeHTML() {
    const ti = treeInfo(sel); if (!ti) return '';
    const pl = plans[sel.id], nt = pl ? pl.shade.filter(t => t.k === 'tree').length : 0, sp = shadeSpecies(), cnt = (TREES_DB && TREES_DB.count) || {};
    return '<section class="tw-lv tw-tree"><h5><span>수목</span>반경 ' + ENV_R + 'm 수목 현황(추정)</h5>' +
      '<p class="pb">수관 비율 <b>' + pc(ti.cover) + '</b> · 수관 면적 환산 교목 <b>' + ti.est.toLocaleString() + '주</b>(수관폭 9m 기준) <small>(공원 격자 전체 ' + parkTrees.toLocaleString() + '주 환산 · 실제 본수는 소경목 포함 시 증가)</small></p>' +
      (ti.top.length ? '<ol class="tw-sp">' + ti.top.map(t => '<li><b>' + esc(t.name) + '</b><span>추정 비율 ' + pc(t.share) + (t.h ? ' · 최대 수고 ' + t.h + 'm' : '') + (t.spot ? ' · 「' + esc(t.spot.name) + '」(' + esc(t.spot.where) + ')' : '') + (PET.has(t.name) ? ' · 반려동물 유의 수종' : '') + '</span></li>').join('') + '</ol>' : '') +
      (nt && sp ? '<p class="ef">녹음수 ' + nt + '주 권장 수종: <b>' + sp + '</b> — 서울숲 기존 식재 ' + (cnt[sp] || 0).toLocaleString() + '주(2020 집계)로 생육 검증, 반려동물 유의 수종 아님</p>' : '') +
      '<p class="tw-warn">⚠ ' + TREE_NOTE + '</p>' +
      '<small class="tw-src">추정 방법: 본수 = 격자 수관 비율(ESA WorldCover 10m 수목 피복, 팀 20m 격자) × 400㎡ ÷ 주당 수관 ' + CANOPY_M2 + '㎡(수관폭 9m 가정). 수종 = 서울숲 수종 집계 비율(서울시 「시민의 숲을 기록하다, 서울숲」 2020) + 인근 명소 기록 4배 가중. 위성 자료로 수종 직접 판별 불가.</small></section>';
  }
  function basisHTML(pl) {
    const sv = sensOf(pl), bc = basisRows(pl, SCN.crowd), bh = basisRows(pl, SCN.heat), nn = needN(sv.g0), sd = poolSD();
    const tbl = (B, t) => '<table class="tw-bs"><caption>' + t + ' 14시 · 합계 ' + f1(B.total) + '점</caption><tr><th>요인</th><th>바뀌는 것</th><th>요인 점수</th><th>종합 기여</th></tr>' + B.rows.map(r => '<tr><td>' + r[0] + '</td><td>' + esc(r[1]) + '</td><td>' + r[2] + '</td><td><b>' + r[3] + '</b></td></tr><tr class="ev"><td></td><td colspan="3">' + esc(r[4]) + '</td></tr>').join('') + '</table>';
    return '<details class="tw-basis"><summary>점수 상승 근거 <b>' + f1(sv.g0) + '점</b> <span>가정 변경 시 ' + f1(sv.lo) + ' ~ ' + f1(sv.hi) + '점</span></summary>' +
      '<p class="tw-n2">종합 만족도 = .75 × (붐빔 .35 + 날씨 .30 + 환경 .35) + .25 × 가장 낮은 요인. 아래는 단계별 분해값과 근거 등급(모형 예측치).</p>' + tbl(bc, SCN.crowd.label) + tbl(bh, SCN.heat.label) +
      '<h6>가정 민감도(영향 순)</h6><ul class="tw-sens">' + sv.rows.map(r => '<li><b>' + r.f.label + '</b> (지금 ' + esc(r.f.base) + ') → ' + esc(r.lo.n) + ' ' + f1(r.lo.g) + ' ~ ' + esc(r.hi.n) + ' ' + f1(r.hi.g) + '점<small>' + esc(r.f.why) + '</small></li>').join('') + '</ul>' +
      '<h6>사후 검증 기준</h6><p class="tw-n2">설치 전후 동일 거점 이용자 평가로 ' + f1(sv.g0) + '점 상승 확인에 전·후 각 약 <b>' + (nn ? nn.toLocaleString() + '건' : '—') + '</b> 필요(양측 5%, 검정력 80%, 평가 표준편차 ' + Math.round(sd.sd) + '점' + (sd.est ? ' 가정' : ' — 실측 ' + sd.n + '건') + '). 현재 실측 평가는 전부 「여유·보통」 혼잡·체감 30℃ 미만 조건 — 혼잡·폭염 계수 보정 불가.</p></details>';
  }
  // ---------- 대안 구성 비교(무엇이 들어가나) ----------
  function measOf(pl) {
    const nS = pl.shade.filter(t => t.k === 'sail').length, nT = pl.shade.filter(t => t.k === 'tree').length, nB = pl.benches.length * 2 + pl.yards.length * 2;
    const ex = pl.extra.map(t => ({ garden: '계절정원', photo: '포토존', toilet: '화장실' })[t.k]);
    return [
      ['분산 유도 안내', pl.shift ? (pl.sign === 'digital' ? '디지털 안내판' : '안내판·앱 알림') + (pl.shift.to ? '(인근 거점)' : '(시간대)') : '', pl.shift ? (pl.sign === 'digital' ? 2 : 1) : 0],
      ['벤치', nB ? nB + '개' : '', nB],
      ['대형 차양', nS ? nS + '개' : '', nS],
      ['녹음수', nT ? nT + '주' : '', nT],
      ['체류공간 확충', pl.yards.length ? pl.yards.length + '칸(' + (pl.yards.length * CELL_M2).toLocaleString() + '㎡)' : '', pl.yards.length],
      ['경관·편의', ex.join('·'), ex.length]
    ];
  }
  function diffTxt(set, k) {
    if (k === 'A') return '운영 중심(시설 공사 최소)';
    const pk = k === 'B' ? 'A' : 'B', a = measOf(set[pk]), b = measOf(set[k]), add = [];
    b.forEach((r, i) => { if (r[1] !== a[i][1]) add.push(a[i][1] && r[1] ? r[0] + ' ' + a[i][1] + '→' + r[1] : r[1] ? '+' + r[0] + ' ' + r[1] : r[0] + ' 제외'); });
    if (!add.length) return pk + '안과 동일 — ' + (k === 'B' ? (sel.type !== 'outdoor' ? '비야외 거점, 차양 미적용' : '그늘 비율 목표(' + pc(SHADE_TARGET) + ') 기충족 또는 설치 위치 없음') : '추가 적용 수단 없음');
    return pk + '안 ' + add.join(' · ');
  }
  function compHTML() {
    const set = SETS[sel.id]; if (!set) return '';
    const M = KS0.map(k => measOf(set[k])), G = glanceData(set);
    const seg = '<div class="tw-abs" role="group" aria-label="대안 선택">' + KS0.map(k => '<button type="button" data-t="alt" data-a="' + k + '" aria-pressed="' + (alt === k) + '" class="' + (alt === k ? 'on' : '') + '"><b>' + k + '안</b><span>' + esc(ALT[k].short) + '</span><em>' + f1(G[k].g) + '점</em></button>').join('') + '</div>';
    const mx = '<table class="tw-mx"><thead><tr><th>구성 수단</th>' + KS0.map(k => '<th class="' + (alt === k ? 'on' : '') + '">' + k + '안</th>').join('') + '</tr></thead><tbody>' +
      M[0].map((r, i) => M.some(m => m[i][1]) ? '<tr><th>' + r[0].replace(' 안내', '') + '</th>' + KS0.map((k, j) => '<td class="' + (alt === k ? 'on' : '') + (M[j][i][1] ? ' y' : '') + '">' + (M[j][i][1] ? esc(M[j][i][1].replace(/\(.*?\)/g, '')) : '—') + '</td>').join('') + '</tr>' : '').join('') +
      '<tr class="sum"><th>평균 효과</th>' + KS0.map(k => '<td class="' + (alt === k ? 'on' : '') + '"><b>' + f1(G[k].g) + '</b></td>').join('') + '</tr>' +
      '<tr class="sum"><th>개략 비용</th>' + KS0.map(k => '<td class="' + (alt === k ? 'on' : '') + '">' + esc(String(G[k].cost).split(' + ')[0]) + '</td>').join('') + '</tr>' +
      '<tr class="sum"><th>기간</th>' + KS0.map(k => '<td class="' + (alt === k ? 'on' : '') + '">' + esc(G[k].period.replace('(가정)', '')) + '</td>').join('') + '</tr></tbody></table>';
    const g = G[alt], pl = set[alt], mxv = Math.max(1, Math.abs(g.dc), Math.abs(g.dh));
    const bar = (lab, v) => '<span class="ro-b"><i>' + lab + '</i><s><b style="width:' + Math.max(0, v / mxv * 100).toFixed(0) + '%"></b></s><em>' + f1(v) + '</em></span>';
    const card = '<div class="tw-sel ro-' + alt + '"><div class="h"><b>' + ALT[alt].name + '</b>' + g.badges.slice(0, 2).map(t => '<em>' + esc(t) + '</em>').join('') + '<span class="n">' + f1(g.g) + '<small>점</small></span></div>' +
      '<span class="ro-bs">' + bar('혼잡', g.dc) + bar('폭염', g.dh) + '</span>' +
      '<div class="ro-p">' + g.pros.slice(0, 1).map(t => '<span>✔ ' + esc(t) + '</span>').join('') + '</div>' +
      '<div class="ro-x">' + g.cons.slice(0, 1).map(t => '<span>✖ ' + esc(t) + '</span>').join('') + '</div></div>';
    return '<h4 class="tw-st">구성 비교 <small>14시 모형 예측</small></h4>' + mx + card;
  }
  // 왼쪽 대안 카드(거점 카드와 같은 모양)
  function abcListHTML() {
    const el = $('.tw-abcl'); if (!el) return;
    const set = SETS[sel.id];
    if (!set) { el.innerHTML = '<h3>대안 A·B·C <small>' + esc(sel.name) + '</small></h3><p class="tw-note">' + (set === null ? '분석 범위 밖' : '대안 산정 중…') + '</p>'; return; }
    const G = glanceData(set), V = { A: '눈높이 시점', B: '측면 시점', C: '조감 시점' };
    el.innerHTML = '<h3>대안 A·B·C <small>구청 선택</small></h3><div class="tw-abcc">' + KS0.map(k => {
      const g = G[k], c = String(g.cost).split(' + ')[0];
      return '<button type="button" class="tw-ac ac-' + k + (alt === k ? ' on' : '') + '" data-t="alt" data-a="' + k + '" title="' + esc(V[k]) + '"><span class="nm"><b>' + k + '안 · ' + esc(ALT[k].short) + '</b><em>' + f1(g.g) + '점</em></span>' +
        '<small>' + esc(c) + ' · ' + esc(g.period.replace('(가정)', '').trim()) + '</small></button>';
    }).join('') + '</div>';
  }
  function syncAltSeg() { ui.querySelectorAll('.tw-abc button').forEach(b => b.setAttribute('aria-pressed', b.dataset.a === alt)); abcListHTML(); }
  function evalNow(pl) { return { crowd: evalHub(pl, SCN.crowd, hour), heat: evalHub(pl, SCN.heat, hour) }; }
  const SHORT = { shift: '분산 안내', bench: '벤치', sail: '차양', tree: '녹음수', yard: '쉼터 확충', extra: '편의' };
  const hintOf = k => ['yard', 'tree', 'sail', 'bench', 'shift', 'extra'].filter(m => ALT[k].use[m]).slice(0, 3).map(m => SHORT[m]).join(' + ') || '추가 수단 없음';
  // ---------- 왜 만족도가 오르나 · 대상지 의도 점검 ----------
  const evS = k => CITE[k] ? CITE[k].s : k;
  function whyHTML(pl) {
    const bc = basisRows(pl, SCN.crowd), bh = basisRows(pl, SCN.heat), avg = i => ((parseFloat(bc.rows[i][3].replace('−', '-')) || 0) + (parseFloat(bh.rows[i][3].replace('−', '-')) || 0)) / 2;
    const parts = [['붐빔', avg(0)], ['날씨', avg(1)], ['환경', avg(2)], ['가장 낮은 요인 보정', avg(3)]];
    const ks = [...new Set(pl.G.map(g => g.k))];
    return '<h4 class="tw-h4">왜 만족도가 오르나 <small>수단 → 바뀌는 것 → 만족도, 그리고 근거</small></h4>' +
      '<div class="tw-parts">' + parts.map(([n, v]) => '<span class="' + (v > .05 ? 'up' : '') + '"><small>' + n + '</small><b>' + f1(v) + '</b></span>').join('') + '</div>' +
      '<p class="tw-fx">만족도 = .75 × (붐빔 .35 + 날씨 .30 + 환경 .35) + .25 × 가장 낮은 요인 · 두 상황(붐빌 때·더울 때) 평균</p>' +
      '<ul class="tw-mech">' + ks.map(k => { const w = WHY[k]; if (!w) return ''; const g = pl.G.find(x => x.k === k), i = pl.G.indexOf(g);
        return '<li><b><span class="no">' + NUM[i] + '</span>' + esc(groupText(g, pl).t) + '</b><p class="ch">' + esc(w.chain) + '</p>' +
          (w.ev.length ? '<ul class="ev">' + w.ev.map(([t, c]) => '<li>' + esc(t) + ' <cite title="' + esc(CITE[c] ? CITE[c].f : '') + '">' + esc(evS(c)) + '</cite></li>').join('') + '</ul>' : '') +
          (w.lim ? '<p class="lim">한계: ' + esc(w.lim[0]) + ' <cite title="' + esc(CITE[w.lim[1]].f) + '">' + esc(evS(w.lim[1])) + '</cite></p>' : '') + '</li>'; }).join('') + '</ul>';
  }
  function intentOf(h) {
    const z = INTENT_ZONE[h.zone] || null, me = INTENT[h.id] || null;
    return { t: me ? me.t : z ? z.t : '이 장소의 설계 의도 자료를 찾지 못함(검증 필요) — 설계도서 열람으로 확인', src: me ? me.src : z ? [z.src] : [], zone: z, rule: Object.assign({}, z && z.rule, me && me.rule) };
  }
  function intentRows(pl) {
    const it = intentOf(pl.h), ks = [...new Set(pl.G.map(g => g.k))];
    const def = { sail: ['warn', '고정 구조물 — 경관·동선 확인 후 탈착식 우선'], tree: ['ok', '서울숲 기존 수종으로'], yard: ['warn', '공원 면적 구성(포장·잔디) 변화 — 조성계획 변경 해당 여부 확인'], bench: ['ok', ''], sign: ['ok', ''], garden: ['ok', ''], photo: ['ok', ''], toilet: ['warn', '건축물 — 조성계획 변경 확인'] };
    return { it, rows: ks.map(k => { const r = it.rule[k] || def[k] || ['ok', '']; const g = pl.G.find(x => x.k === k); return { k, i: pl.G.indexOf(g), name: groupText(g, pl).t, st: r[0], t: r[1] }; }) };
  }
  function intentHTML(pl) {
    const { it, rows } = intentRows(pl), bad = rows.filter(r => r.st === 'no').length, warn = rows.filter(r => r.st === 'warn').length;
    const lab = { ok: '맞음', warn: '조건부', no: '충돌' };
    return '<h4 class="tw-h4">대상지 의도를 해치지 않나 <small>원래 용도·경관과 맞는지</small></h4>' +
      '<div class="tw-int"><p class="it"><b>이곳의 원래 의도</b>' + esc(it.t) + (it.src.length ? ' <cite title="' + esc(it.src.map(c => CITE[c].f).join(' / ')) + '">' + esc(it.src.map(evS).join(' · ')) + '</cite>' : '') + '</p>' +
      '<p class="all">' + esc(INTENT_ALL.t) + ' <cite title="' + esc(CITE.dsw.f) + '">' + esc(evS('dsw')) + '</cite></p>' +
      (rows.length ? '<ul>' + rows.map(r => '<li class="' + r.st + '"><span class="no">' + NUM[r.i] + '</span><span class="n">' + esc(r.name) + (r.t ? '<small>' + esc(r.t) + '</small>' : '') + '</span><span class="s">' + lab[r.st] + '</span></li>').join('') + '</ul>' : '') +
      '<p class="sum ' + (bad ? 'no' : warn ? 'warn' : 'ok') + '">' + (bad ? '⚠ 원래 의도와 부딪히는 수단 ' + bad + '개 — 위치를 옮기거나 탈착식으로 바꿔야 함' : warn ? '조건을 지키면 원래 의도를 유지할 수 있음(조건부 ' + warn + '개)' : '원래 의도와 맞음') + '</p>' +
      '<p class="law">원래 주제·특색을 바꾸지 않는 소규모 시설이면 공원조성계획 변경 절차를 간단히 할 수 있음 <cite title="' + esc(CITE.law.f) + '">' + esc(evS('law')) + '</cite></p></div>';
  }
  // ---------- 왜 이 안을 냈나: 거점 진단 기준(지금 값 vs 기준) → 그래서 넣은 수단 ----------
  function critRows(pl) {
    const h = pl.h, p = P[h.id], pct = satPct(p), rs = (p && p.reasons) || {}, c14 = pl.d14.crowd.b, h14 = pl.d14.heat.b, rest = pl.cmp.b.rest;
    const evC = hubEv(h.id).find(e => e.key === 'crowded'), proven = !!(evC && evC.park.v === 'yes' && evC.n >= 2), cut = proven ? NB_FREE : CROWD_CUT;
    const has = k => pl.G.some(g => g.k === k), names = ks => ks.filter(has).map(k => ({ sign: '분산 안내', yard: '쉼터 확충', sail: '그늘막', tree: '녹음수', bench: '벤치', garden: '계절 정원', photo: '포토존', toilet: '화장실' })[k]).join(' · ');
    const R = [];
    R.push({ k: '혼잡', now: '14시 혼잡률 ' + pc(c14.ratio), cut: pc(cut) + ' 넘으면' + (proven ? ' (「혼잡」 불만이 실시간 측정과 일치해 55%로 낮춤)' : ''), over: c14.ratio > cut, put: names(['sign', 'yard']), src: '혼잡률 = 예상 인원 ÷ 수용 인원(수용은 대시보드 가정값) · 기준 70%는 팀 가정, 55%는 이웃 거점 「여유」 기준' });
    if (h.type === 'outdoor') R.push({ k: '더위', now: '폭염일 14시 그늘 ' + pc(h14.s), cut: pc(SHADE_TARGET) + ' 안 되면', over: h14.s < SHADE_TARGET, put: names(['sail', 'tree']), src: '그늘 비율 = 체류공간(거점 40m) 중 그늘 진 비율, 태양 위치(NOAA 식)로 계산 · 목표 50%는 팀 가정' });
    R.push({ k: '쉴 곳', now: '쉼터까지 평균 ' + Math.round(rest) + 'm', cut: '60m 넘으면', over: rest > 60, put: names(['bench']), src: '휴게시설 위치: OpenStreetMap(벤치·쉼터) · 60m는 팀 가정' });
    if (p && p.n) R.push({ k: '이용자 평가', now: '만족 ' + Math.round(pct) + '% (' + p.n + '건)', cut: SAT_CUT + '% 안 되면 개선 대상', over: pct < SAT_CUT, put: '', src: (rat.demo ? '시연용 가상 평가' : '대시보드 도착 평가, 최근 90일') + (Object.keys(rs).length ? ' · 아쉬운 이유: ' + Object.keys(BAD).filter(k => rs[k]).map(k => BAD[k] + ' ' + rs[k]).join(', ') : '') });
    if (rs.boring) R.push({ k: '볼거리', now: '「' + BAD.boring + '」 ' + rs.boring + '건', cut: '불만이 있으면', over: true, put: names(['garden', 'photo']), src: '이용자 선택 응답 · 점수 계산에는 넣지 않음' });
    if (rs.far || rs.facility) R.push({ k: '편의', now: '「' + (rs.facility ? BAD.facility : BAD.far) + '」 ' + (rs.facility || rs.far) + '건', cut: '화장실 250m 밖이면', over: has('toilet'), put: names(['toilet']), src: '화장실 위치: OSM·서울시 공중화장실 위치정보' });
    return R;
  }
  function critHTML(pl) {
    const R = critRows(pl);
    return '<h4 class="tw-h4">왜 이 안을 냈나 <small>이 장소를 기준과 비교한 결과</small></h4><ul class="tw-crit">' + R.map(r => '<li class="' + (r.over ? 'over' : 'ok') + '"><span class="k">' + r.k + '</span><span class="v"><b>' + esc(r.now) + '</b><small>기준: ' + esc(r.cut) + '</small></span><span class="j">' + (r.over ? '기준 넘음' : '괜찮음') + '</span>' +
      (r.k === '이용자 평가' ? '' : r.over && r.put ? '<span class="put">→ 넣은 것: ' + esc(r.put) + '</span>' : r.over ? '<span class="put none">→ 이 안에는 대응 수단 없음' + (picked !== 'C' ? ' (더 큰 안에서 다룸)' : '') + '</span>' : r.put ? '<span class="put extra">→ ' + esc(r.put) + ': 기준은 괜찮지만 이 안의 기본 구성이라 넣음 — 효과 작음</span>' : '') + '<small class="src">' + esc(r.src) + '</small></li>').join('') + '</ul>';
  }
  function reviewHTML() {
    const set = SETS[sel.id], pop = $('.tw-pop'), chip = $('.tw-hubchip'); if (chip) chip.textContent = sel.name;
    $('.tw-vsw').innerHTML = '<span class="lb">' + (picked ? '대안' : '대안을<br>선택하세요') + '</span>' + ['A', 'B', 'C'].map(k => '<button type="button" data-t="pick" data-v="' + k + '" aria-pressed="' + (k === picked) + '"' + (set ? '' : ' disabled') + '><b>' + k + '안</b><small>' + esc(hintOf(k)) + '</small></button>').join('');
    const prt = $('.tw-prt'); if (prt) { prt.hidden = !picked || !set; prt.querySelector('span').textContent = (picked || '') + '안 검토 자료 인쇄'; }
    if (!picked) { pop.hidden = true; pop.innerHTML = ''; return; }
    const first = pop.hidden; pop.hidden = false; if (first) { pop.classList.remove('in'); void pop.offsetWidth; pop.classList.add('in'); }
    const A = ALT[picked], bar = '<div class="tw-popbar"><span class="k">' + picked + '안</span><b>' + esc(A.short) + '</b><button type="button" class="tw-x" data-t="unpick" aria-label="닫기" title="닫기">✕</button></div>';
    if (!set) { pop.innerHTML = bar + '<div class="tw-popb"><p class="tw-note">' + (set === null ? '분석 범위 밖' : '대안 산정 중…') + '</p></div>'; return; }
    const pl = set[picked], E = evalNow(pl), c = costOf(pl), sv = sensOf(pl), tb = t => '<table class="tw-ct"><tr>' + t.head.map(x => '<th>' + esc(x) + '</th>').join('') + '</tr>' + t.rows.map(r => '<tr>' + r.map(x => '<td>' + esc(x) + '</td>').join('') + '</tr>').join('') + '</table>';
    const sat = (lbl, e) => '<div class="tw-kp"><small>' + lbl + '</small><span>' + e.b.raw.toFixed(0) + '<i>→</i><b class="' + (e.a.raw - e.b.raw > .5 ? 'up' : '') + '">' + e.a.raw.toFixed(0) + '</b><em>점</em></span></div>';
    const M = evalMix(pl, hour), dC = E.crowd.a.raw - E.crowd.b.raw, dH = E.heat.a.raw - E.heat.b.raw, dM = M.a.raw - M.b.raw, sg = v => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1);
    const verdict = dC > .5 && dC > dH * 2 ? '붐빌 때 효과가 크고, 더위에는 효과가 작아요' : dH > .5 && dH > dC * 2 ? '더울 때 효과가 크고, 붐빌 때는 효과가 작아요' : dM > .5 ? '붐빌 때도, 더울 때도 좋아져요' : '눈에 띄는 개선은 없어요';
    const gl = glanceData(set)[picked];
    // 이야기 순서: 결론 → 이곳의 문제 → 수단마다 [왜 → 효과 → 근거 → 비용 → 원래 의도] → 남는 문제 → (자세히)
    const R = critRows(pl), PROB = { '혼잡': ['sign', 'yard'], '더위': ['sail', 'tree'], '쉴 곳': ['bench', 'yard'], '볼거리': ['garden', 'photo'], '편의': ['toilet'] };
    const gk = [...new Set(pl.G.map(g => g.k))], probOf = k => Object.keys(PROB).find(q => PROB[q].includes(k)), rowOf = n => R.find(r => r.k === n);
    const costKeys = k => ({ sign: ['signS', 'signD'], yard: ['deck', 'lawn', 'bench'], bench: gk.includes('yard') ? [] : ['bench'], sail: ['sail'], tree: ['tree'], garden: ['garden'], photo: ['photo'], toilet: ['toilet'] })[k] || [];
    const costG = k => { const ls = c.lines.filter(l => costKeys(k).includes(l.k) && l.lo != null); return ls.length ? wonR(ls.reduce((a, l) => a + l.lo, 0), ls.reduce((a, l) => a + l.hi, 0)) : '0원'; };
    const ec = pl.d14.crowd, eh = pl.d14.heat, both = (a, b) => gk.includes(a) && gk.includes(b);
    const effOf = k => k === 'sign' || k === 'yard' ? '14시 혼잡률 <b>' + pc(ec.b.ratio) + ' → ' + pc(ec.a.ratio) + '</b>' + (both('sign', 'yard') ? ' (분산 안내·쉼터 확충 합친 효과)' : '') : k === 'sail' || k === 'tree' ? '폭염일 14시 그늘 <b>' + pc(eh.b.s) + ' → ' + pc(eh.a.s) + '</b>' + (both('sail', 'tree') ? ' (그늘막·녹음수 합친 효과)' : '') : k === 'bench' ? '쉼터까지 평균 <b>' + Math.round(pl.cmp.b.rest) + ' → ' + Math.round(pl.cmp.a.rest) + 'm</b>' : '점수 계산 밖 — 불만 대응';
    const IR = intentRows(pl), irOf = k => IR.rows.find(r => r.k === k), ST = { ok: '맞음', warn: '조건부', no: '충돌' };
    const cite = k => '<cite title="' + esc(CITE[k] ? CITE[k].f : '') + '">' + esc(CITE[k] ? CITE[k].s : k) + '</cite>';
    const probs = R.filter(r => r.over && r.k !== '이용자 평가'), rate = rowOf('이용자 평가');
    const left = probs.filter(r => !(PROB[r.k] || []).some(k => gk.includes(k)));
    const tot = c.lines.length ? wonR(c.lo, c.hi) : '0원';
    pop.innerHTML = bar + '<div class="tw-popb">' +
      // ① 결론
      '<section class="tw-hero"><small>예측 만족도 · 붐비는 여름 주말 ' + hm(hour) + '</small><div class="n"><span>' + M.b.raw.toFixed(0) + '</span><i>→</i><b>' + M.a.raw.toFixed(0) + '</b><em>점</em><u class="' + (dM > .5 ? 'up' : '') + '">' + sg(dM) + '</u></div>' +
      '<p>' + verdict + '</p><div class="two"><span>붐빌 때 <b class="' + (dC > .5 ? 'up' : '') + '">' + sg(dC) + '</b></span><span>더울 때 <b class="' + (dH > .5 ? 'up' : '') + '">' + sg(dH) + '</b></span></div>' +
      '<div class="meta"><span>비용 <b>' + esc(tot) + '</b></span><span>기간 <b>' + esc(A.period.replace('(가정)', '').trim()) + '</b></span></div></section>' +
      // ② 이곳의 문제
      '<h4 class="tw-h4">이곳의 문제</h4><ul class="tw-prob">' + (rate ? '<li><b>이용자 만족 ' + esc(rate.now.replace('만족 ', '')) + '</b><small>기준 ' + SAT_CUT + '% · ' + esc(rate.src.split(' · ').slice(1).join(' · ') || rate.src) + '</small></li>' : '') +
      (probs.length ? probs.map(r => '<li><b>' + r.k + ' — ' + esc(r.now) + '</b><small>기준: ' + esc(r.cut) + '</small></li>').join('') : '<li><b>기준을 넘는 문제 없음</b></li>') + '</ul>' +
      // ③ 그래서 이렇게 — 수단마다 한 덩어리
      '<h4 class="tw-h4">그래서 이렇게 고칩니다 <small>번호 = 오른쪽 화면 번호</small></h4>' +
      (pl.G.length ? '<ol class="tw-steps">' + gk.map(k => { const g = pl.G.find(x => x.k === k), n = pl.G.indexOf(g), pr = rowOf(probOf(k)), w = WHY[k], ir = irOf(k) || { st: 'ok', t: '' };
        const why = pr && pr.over ? esc(pr.now + ' — 기준 ' + pr.cut) : pr ? '<span class="weak">' + esc(pr.k) + '는 기준 안 — 이 안의 기본 구성이라 넣음, 효과 작음</span>' : '불만 응답 대응';
        return '<li><div class="hd"><span class="no">' + NUM[n] + '</span><b>' + esc(groupText(g, pl).t) + '</b><em>' + esc(costG(k)) + '</em></div><dl>' +
          '<dt>왜</dt><dd>' + why + '</dd>' +
          '<dt>효과</dt><dd>' + effOf(k) + '</dd>' +
          (w && w.ev.length ? '<dt>근거</dt><dd>' + esc(w.ev[0][0]) + ' ' + cite(w.ev[0][1]) + '</dd>' : '') +
          '<dt>원래 의도</dt><dd><span class="st ' + ir.st + '">' + ST[ir.st] + '</span>' + (ir.t ? ' ' + esc(ir.t) : '') + '</dd></dl></li>'; }).join('') + '</ol>' : '<p class="tw-note">바꾸지 않음</p>') +
      // ④ 같은 안 범위의 보완 수단(계산 수단이 못 다룬 문제) — 다른 안으로 넘기지 않음
      (left.length ? '<h4 class="tw-h4">함께 하는 보완 수단 <small>' + ({ A: '운영으로', B: '작은 시설로', C: '공간으로' })[picked] + ' 남은 문제까지 · 점수 계산 밖, 설치 후 평가로 확인</small></h4><ol class="tw-steps supp">' + left.map(r => { const sp = (SUPP[picked] || {})[r.k]; if (!sp) return '<li><div class="hd"><span class="no">+</span><b>' + esc(r.k) + ' — 이 안의 수단으로는 기준 아래로 못 내림</b></div><dl><dt>왜</dt><dd>' + esc(r.now + ' — 기준 ' + r.cut) + '</dd><dt>다음</dt><dd>현장 조사로 원인 확인 후 별도 검토</dd></dl></li>';
        const cst = sp.cost === 0 ? sp.costT : sp.cost === 'garden20' ? wonR(COST.garden.lo * 20, COST.garden.hi * 20) : sp.cost === 'bench2' ? wonR(COST.bench.lo * 2, COST.bench.hi * 2) : sp.cost === 'tree3' ? wonR(COST.tree.lo * 3, COST.tree.hi * 3) : sp.costT;
        return '<li><div class="hd"><span class="no">+</span><b>' + esc(sp.t) + '</b><em>' + esc(cst.split(' — ')[0]) + '</em></div><dl><dt>왜</dt><dd>' + esc(r.k + ' — ' + r.now + ' (기준 ' + r.cut + ')') + '</dd><dt>하는 일</dt><dd>' + esc(sp.d) + (cst.includes(' — ') ? ' <span class="weak">(' + esc(cst.split(' — ')[1]) + ')</span>' : '') + '</dd>' +
          (sp.ev ? '<dt>근거</dt><dd>' + esc(sp.ev[0]) + ' ' + cite(sp.ev[1]) + '</dd>' : '') + '<dt>원래 의도</dt><dd><span class="st ' + sp.intent[0] + '">' + ST[sp.intent[0]] + '</span>' + (sp.intent[1] ? ' ' + esc(sp.intent[1]) : '') + '</dd></dl></li>'; }).join('') + '</ol>' : '') +
      // ⑤ 자세히
      '<details class="tw-deep"><summary>자세히 보기<small>장점·단점 · 점수 계산 · 근거 전체 · 단가 출처 · 대상지 의도 · 왜 이곳인가</small></summary>' +
      '<p class="tw-why2"><b>이럴 때 고르세요</b>' + esc(A.pick) + '</p>' +
      '<div class="tw-pc2 tw-pc3"><section class="pro"><h5>장점</h5><ul>' + gl.pros.slice(0, 4).map(x => '<li>' + esc(x) + '</li>').join('') + '</ul></section><section class="con"><h5>단점</h5><ul>' + gl.cons.slice(0, 4).map(x => '<li>' + esc(x) + '</li>').join('') + '</ul></section></div>' +
      whyHTML(pl) +
      '<p class="tw-rng">가정을 바꿔 보면 <b>' + sg(sv.lo) + ' ~ ' + sg(sv.hi) + '점</b><small>14시 두 시나리오 평균 · 기준 가정 ' + sg(sv.g0) + '점 · 실측 아닌 모형값</small></p>' +
      '<details class="tw-more"><summary>단가와 출처</summary>' + tb(budTable(pl)) + '</details>' +
      '<details class="tw-more"><summary>대상지 의도 점검 전체</summary>' + intentHTML(pl) + '</details>' +
      '<details class="tw-more"><summary>점수 상승 근거 표</summary>' + tb(basisTable(pl)) + '<h6 class="tw-h6">가정을 바꾸면 (영향 큰 순)</h6><ul class="tw-sens">' + sv.rows.map(r => '<li><b>' + esc(r.f.label) + '</b> (지금 ' + esc(r.f.base) + ') → ' + esc(r.lo.n) + ' ' + f1(r.lo.g) + ' ~ ' + esc(r.hi.n) + ' ' + f1(r.hi.g) + '점<small>' + esc(r.f.why) + '</small></li>').join('') + '</ul></details>' +
      '<details class="tw-more"><summary>왜 이곳인가</summary>' + gradeBox(gradeOf(sel.id), 'tw-grade') + evHub(sel.id) + '</details>' +
      '<p class="tw-rvn">그림·점수·수목 현황은 알고리즘 추정치 — 실측 필요. 단가는 지자체 예산·계약 사례 범위(설계·견적으로 확정). <button type="button" class="tw-edbtn" data-t="ed-open">✎ 대안 구성 편집</button></p></details></div>' +
      '<div class="tw-popcta"><button type="button" class="tw-cta" data-t="report">' + PRINT_ICO + '<span><b>' + picked + '안 검토 자료 인쇄</b><small>보고 공문 · 검토 보고서 · 설계도 · 의견서 — ' + picked + '안만 담김</small></span><i aria-hidden="true">→</i></button></div>';
  }
  function pickAlt(k) {
    picked = k && ALT[k] ? k : null; if (picked) alt = picked; split = !!picked; root.classList.toggle('tw-picked', !!picked);
    showPlan(); layoutBlocks(); if (!fly) flyTo(picked ? planView(sel) : { t: controls.target.clone(), p: controls.target.clone().add(new THREE.Vector3(-260, 300, 420)) }, .9);
  }
  function panelHTML() {
    if (REVIEW) { reviewHTML(); return; }
    const p = P[sel.id], pct = satPct(p);
    let h = '<h2>' + esc(sel.name) + '<small>' + esc(sel.zone || '') + ' · 수용 ' + sel.cap.toLocaleString() + '명(가정값) · ' + ({ outdoor: '야외', shade: '그늘', indoor: '실내' }[sel.type] || '') + ' 거점</small></h2>';
    if (p && p.n) {
      const reasons = Object.keys(BAD).filter(k => (p.reasons || {})[k]).sort((a, b) => p.reasons[b] - p.reasons[a]);
      h += '<div class="tw-rt"><div class="tw-face"><span>😊 ' + p.good + '</span><span>😐 ' + p.mid + '</span><span>😞 ' + p.bad + '</span><b style="color:' + pctCss(pct) + '">만족도 ' + Math.round(pct) + '%</b></div>' +
        '<div class="tw-sbar"><i class="g" style="width:' + p.good / p.n * 100 + '%"></i><i class="m" style="width:' + p.mid / p.n * 100 + '%"></i><i class="b" style="width:' + p.bad / p.n * 100 + '%"></i></div>' +
        '<small>이용자 평가 ' + p.n + '건' + (rat.demo ? ' · 시연용 가상 평가' : '(최근 90일)') + ' · 만족도 = (만족×100 + 보통×50) ÷ 응답 수</small>' +
        (reasons.length ? '<ul class="tw-why">' + reasons.map(k => '<li><span>' + BAD[k] + ' <b>' + p.reasons[k] + '</b></span><span>→ ' + REC[k] + '</span></li>').join('') + '</ul>' : '<p class="tw-note">불만 응답 없음.</p>') + evHub(sel.id) + '</div>';
    } else h += '<p class="tw-note">이용자 평가 자료 없음.</p>';
    $('.tw-rate').innerHTML = '<details class="tw-more"><summary>이용자 평가 · 불만 요인 검증 <small>' + (p && p.n ? '만족도 ' + Math.round(pct) + '% · 응답 ' + p.n + '건' : '자료 없음') + '</small></summary>' + h + '</details>';
    const pl = plans[sel.id];
    if (!pl) { $('.tw-pred').innerHTML = '<p class="tw-note">' + (pl === null ? '분석 범위(팀 20m 격자) 밖 — 산정 불가.' : '대안 산정 중…') + '</p>'; return; }
    const E = evalNow(pl), C = E.crowd, Hh = E.heat, e = E[scn.key], rsn = (P[sel.id] || {}).reasons || {};
    const bar = (lbl, b, a) => '<div class="tw-br"><span>' + lbl + '</span><i><b style="width:' + clamp(b, 0, 100) + '%"></b><em style="width:' + clamp(a, 0, 100) + '%"></em></i><span>' + Math.round(b) + ' → <b class="' + (a > b + .5 ? 'up' : '') + '">' + Math.round(a) + '</b></span></div>';
    const head = ['crowd', 'heat'].map(k => { const x = E[k]; return '<button type="button" class="tw-hd' + (scn.key === k ? ' on' : '') + '" data-t="' + k + '"><small>' + SCN[k].label + ' ' + hm(hour) + '</small><span>' + x.b.raw.toFixed(0) + '<i>→</i><b>' + x.a.raw.toFixed(0) + '</b></span><em class="' + (x.a.raw - x.b.raw > .5 ? 'up' : '') + '">' + f1(x.a.raw - x.b.raw) + '점</em></button>'; }).join('');
    const num = k => { const i = pl.G.findIndex(g => g.k === k); return i < 0 ? '' : '<span class="no">' + NUM[i] + '</span>'; };
    const gl = ks => pl.G.map((g, i) => [g, i]).filter(([g]) => ks.includes(g.k)).map(([g, i]) => { const t = groupText(g, pl); return '<li><span class="no">' + NUM[i] + '</span><span><b>' + esc(t.t) + '</b><small>' + esc(t.d) + '</small></span></li>'; }).join('');
    const crowdCard = '<section class="tw-lv"><h5><span>혼잡</span>' + SCN.crowd.label + ' ' + hm(hour) + '</h5>' +
      '<p class="pb">예상 체류 인원 <b>' + Math.round(C.b.ppl).toLocaleString() + '명</b> / 수용 ' + sel.cap.toLocaleString() + '명 → 혼잡률 <b class="' + (C.b.ratio > CROWD_CUT ? 'bad' : '') + '">' + pc(C.b.ratio) + '</b>' + (rsn.crowded ? ' · 「혼잡」 응답 ' + rsn.crowded + '건' + (EV.crowded.v === 'yes' ? '(공원 전체에서 실제 혼잡 때 몰림, ' + pTxt(EV.crowded.p) + ')' : '') : '') + '</p>' +
      (pl.yards.length || pl.shift ? '<ol class="tw-plan">' + gl(['yard', 'sign']) + '</ol><p class="ef">혼잡률 ' + pc(C.b.ratio) + ' → <b>' + pc(C.a.ratio) + '</b> · 붐빔 점수 ' + Math.round(C.b.d) + ' → <b class="up">' + Math.round(C.a.d) + '</b></p>'
        : '<p class="ef mute">' + (sel.cap ? '토요일 14시 혼잡률 ' + pc(pl.r14) + ' — 혼잡 기준(' + pc(CROWD_CUT) + ') 미만, 공간 확충 미적용.' : '수용 인원 자료 없음 — 산정 제외.') + '</p>') + '</section>';
    const heatCard = '<section class="tw-lv"><h5><span>폭염</span>' + SCN.heat.label + '(체감 ' + SCN.heat.w.feels + '℃) ' + hm(hour) + '</h5>' +
      (sel.type === 'outdoor' ? '<p class="pb">체류공간 그늘 비율 <b class="' + (Hh.b.s < SHADE_TARGET ? 'bad' : '') + '">' + pc(Hh.b.s) + '</b> · 기상 점수 ' + Math.round(Hh.b.x) + '</p>' +
        (pl.shade.length ? '<ol class="tw-plan">' + gl(['sail', 'tree']) + '</ol><p class="ef">그늘 비율 ' + pc(Hh.b.s) + ' → <b>' + pc(Hh.a.s) + '</b> · 기상 점수 ' + Math.round(Hh.b.x) + ' → <b class="up">' + Math.round(Hh.a.x) + '</b>' + (Hh.a.ppl > Hh.b.ppl * 1.05 ? ' · 그늘 증가로 폭염 시 이용 인원 ' + Math.round(Hh.b.ppl) + ' → ' + Math.round(Hh.a.ppl) + '명' : '') + '</p>'
          : '<p class="ef mute">14시 그늘 비율 기존 ' + pc(shareAt(pl.stay0, [], sunDir(14, SCN.heat.doy))) + ' — 추가 차양 미적용.</p>')
        : '<p class="ef mute">' + (sel.type === 'indoor' ? '실내 시설 — 차양 대응 해당 없음.' : '수림 내 거점 — 차양 효과 미미, 미적용.') + '</p>') + '</section>';
    const envCard = '<section class="tw-lv"><h5><span>환경</span>반경 80m · 팀 20m 격자 점수</h5><p class="ef">환경 점수 ' + pl.env0.toFixed(1) + ' → <b class="' + (pl.env1 > pl.env0 + .05 ? 'up' : '') + '">' + pl.env1.toFixed(1) + '</b> · 휴게시설까지 평균 ' + Math.round(pl.cmp.b.rest) + ' → ' + Math.round(pl.cmp.a.rest) + 'm' + (pl.cmp.a.dLst < -.005 ? ' · 지표온도 ' + pl.cmp.a.dLst.toFixed(2) + '℃' : '') + '</p>' + (pl.benches.length ? '<ol class="tw-plan">' + gl(['bench']) + '</ol>' : '') + '</section>';
    const exCard = pl.extra.length ? '<section class="tw-lv"><h5><span>경관·편의</span>점수 외 · 이용자 불만 대응</h5><ol class="tw-plan ex">' + gl(['garden', 'photo', 'toilet']) + '</ol></section>' : '';
    const asm = ['수용 인원·끌림은 대시보드 가정값(현장 계수로 보정 예정)', '새 쉼터 수용 = 지금 이곳 수용 밀도(' + (pl.open0 / Math.max(1, sel.cap)).toFixed(1) + '㎡/명, 나무 그늘 아닌 열린 땅 기준) × 칸의 ' + pc(YARD_USE), '분산 유도 안내로 옮겨 가는 비율 ' + pc(SHIFT) + ' · 옮겨 갈 곳은 ' + NB_R + 'm 안 혼잡률 ' + pc(NB_FREE) + ' 이하', '그늘 목표 = 체류공간(거점 ' + STAY_R + 'm 안) 14시 그늘 ' + pc(SHADE_TARGET), '그늘 비율만큼 야외 거점의 날씨 영향을 대시보드의 「그늘 거점」 계수 쪽으로 섞음', '혼잡 70% = 대시보드 「혼잡」 기준 · 혼잡 시나리오 날씨는 가정, 폭염 시나리오은 재분석 모델값(' + SCN.heat.wTxt.split('— ')[1] + ')'];
    syncAltSeg(); const moreOpen = !!ui.querySelector('.tw-pred .tw-more[open]');
    $('.tw-pred').innerHTML = '<h3>' + esc(sel.name) + ' 개선 대안 <small>좌: 현황 / 우: ' + ALT[alt].name + ' · ' + esc(sel.zone || '') + '</small></h3>' +
      gradeBox(gradeOf(sel.id), 'tw-grade') + compHTML() +
      '<div class="tw-act2"><button type="button" class="tw-main" data-t="report">제안서 생성</button><button type="button" class="tw-sub" data-t="ed-open">✎ 대안 구성 편집</button></div>' +
      '<details class="tw-more"><summary>상세 분석 <small>시점별 점수 · 요인 · 산정 근거 · 수목 · 가정</small></summary>' +
      '<div class="tw-heads">' + head + '</div>' +
      '<div class="tw-bars"><small>' + scn.label + ' ' + hm(hour) + ' 만족도 구성 요인(현황 → 대안 적용)</small>' + bar('혼잡 .35', e.b.d, e.a.d) + bar('기상 .30', e.b.x, e.a.x) + bar('환경 .35', e.b.e, e.a.e) + '</div>' +
      basisHTML(pl) + crowdCard + heatCard + envCard + exCard + treeHTML() +
      '<details class="tw-asm"><summary>산정 가정 ' + asm.length + '항목</summary><ul>' + asm.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul></details></details>';
    if (moreOpen) { const d = ui.querySelector('.tw-pred .tw-more'); if (d) d.open = true; }
  }
  function labelsHTML() { labs.innerHTML = hubs.map(h => '<button type="button" class="tw-lab' + (h.id === sel.id ? ' on' : '') + '" data-h="' + h.id + '">' + esc(h.name) + ' <em style="color:' + (h.pct == null ? '#aab' : pctCss(h.pct)) + '">' + (h.pct == null ? '평가 없음' : '😊' + Math.round(h.pct) + '%') + '</em> <b></b></button>').join(''); }
  function labelScores() { [...labs.children].forEach((el, k) => { const h = hubs[k], pl = plans[h.id]; let t = ''; if (h.id === sel.id && pl && !bare()) { const e = evNow(pl, hour); t = e.b.raw.toFixed(0) + '→' + e.a.raw.toFixed(0) + '점'; } else t = (scn === MIX ? (baseSat(h, SCN.crowd, hour) + baseSat(h, SCN.heat, hour)) / 2 : baseSat(h, scn, hour)).toFixed(0) + '점'; el.querySelector('b').textContent = t; el._w = 0; }); }
  function numsHTML() { const pl = plans[sel.id]; nums.innerHTML = pl && !bare() ? pl.G.map((g, k) => '<span class="tw-num' + (['garden', 'photo', 'toilet'].includes(g.k) ? ' ex' : '') + '">' + NUM[k] + '</span>').join('') : ''; }
  let blocks = [];
  function layoutBlocks() { blocks = (REVIEW ? ['.tw-pop:not([hidden])', '.tw-top', '.tw-time'] : ['.tw-left', '.tw-right', '.tw-top', '.tw-time']).map(s => ui.querySelector(s)).filter(Boolean).map(e => e.getBoundingClientRect()); layoutViews(); }
  const v3 = new THREE.Vector3();
  function project(x, y, z, el) {
    const v = views[views.length - 1]; v3.set(x, z, -y).project(v.cam); const px = v.x + (v3.x + 1) / 2 * v.w, py = v.y + (1 - v3.y) / 2 * v.h;
    const hide = v3.z > 1 || px < v.x || px > v.x + v.w || py < v.y || py > v.y + v.h || blocks.some(b => { const hw = (el._w || (el._w = el.offsetWidth || 40)) / 2 + 6; return px + hw > b.left && px - hw < b.right && py > b.top - 8 && py - 30 < b.bottom; });
    el.style.display = hide ? 'none' : ''; if (!hide) el.style.transform = 'translate(' + px.toFixed(1) + 'px,' + py.toFixed(1) + 'px) translate(-50%,-100%)';
  }
  function placeLabels() {
    const only = split && W <= 800, pl = plans[sel.id];
    [...labs.children].forEach((el, k) => { const h = hubs[k]; if (only && h.id !== sel.id) { el.style.display = 'none'; return; } project(h.x, h.y, pillarG.visible ? h.top : 9, el); });
    [...nums.children].forEach((el, k) => { const g = pl && !bare() && pl.G[k]; if (g) project(g.at[0], g.at[1], g.z, el); });
  }
  // 개선안을 장면에 놓기(오른쪽만: 레이어 1)
  function clearItems() { itemsG.traverse(m => { if (m.userData.own) { m.material.map && m.material.map.dispose(); m.material.dispose(); } }); itemsG.clear(); }
  const bare = () => REVIEW && !picked;   // 검토 화면에서 안을 고르기 전: 현황만 보여 줌
  function showPlan() {
    clearItems(); const pl = plans[sel.id];
    if (pl && bare()) { scatter('L', pl.stay0.map(i => [i, Math.max(40, (1 - TR[i]) * CELL_M2)]), 101 + hubs.indexOf(sel)); scatter('R', pl.stay0.map(i => [i, Math.max(40, (1 - TR[i]) * CELL_M2)]), 101 + hubs.indexOf(sel)); shadowDirty(); numsHTML(); refresh(); labDirty = true; return; }
    { const vr = ui.querySelector('.tw-vl[data-s="R"]'); if (vr) { vr.textContent = ALT[alt].name + ' · ' + ({ A: '눈높이 시점', B: '측면 시점', C: '조감 시점' })[alt]; vr.style.background = { A: '#78c8ff', B: '#ffc440', C: '#6af5b0' }[alt]; vr.style.color = '#0c1714'; } }
    if (pl) {
      pl.yards.forEach(y => { itemsG.add(yardMesh(y)); itemsG.add(haloMesh(y.x, y.y, 21, 21, 0)); });
      pl.shade.concat(pl.benches, pl.extra).forEach(t => { const m = model(t.k, t); m.position.set(t.x, 0, -t.y); m.rotation.y = t.rot; itemsG.add(m); if (t.k === 'tree') return; const s = t.k === 'sail' ? 11 : t.k === 'garden' ? 10 : 7; itemsG.add(haloMesh(t.x, t.y, s, s, t.rot)); });
      if (pl.shift) {
        const s = pl.shift, m = model('sign', s.sign);
        if (pl.sign !== 'digital') m.traverse(o => { if (o.isMesh && o.material && o.material.emissiveMap) { o.material.emissiveIntensity = .25; o.material.color.set(0xe8eef0); } }); m.position.set(s.sign.x, 0, -s.sign.y); m.rotation.y = -s.sign.rot; itemsG.add(m); itemsG.add(haloMesh(s.sign.x, s.sign.y, 6, 6, 0));
        if (s.pts.length > 1) {
        const curve = new THREE.CatmullRomCurve3(s.pts.map(q => new THREE.Vector3(q[0], .5, -q[1])), false, 'catmullrom', .2);
        const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(8, s.pts.length * 6), .55, 6, false), new THREE.MeshBasicMaterial({ color: 0x3fe6a6, transparent: true, opacity: .85, toneMapped: false })); tube.userData.own = true; tube.renderOrder = 4; itemsG.add(tube);
        const end = s.pts[s.pts.length - 1], cone = new THREE.Mesh(new THREE.ConeGeometry(2.2, 4, 12), tube.material); cone.position.set(end[0], 3, -end[1]); cone.rotation.x = Math.PI; itemsG.add(cone);
        }
      }
      itemsG.traverse(m => { m.layers.set(1); if (m.isMesh && m.userData.own == null && m.material !== MT.lawn) m.castShadow = true; });
      scatter('L', pl.stay0.map(i => [i, Math.max(40, (1 - TR[i]) * CELL_M2)]), 101 + hubs.indexOf(sel));
      scatter('R', pl.stay.map(i => [i, pl.yards.some(y => y.cell === i) ? CELL_M2 * YARD_USE : Math.max(40, (1 - TR[i]) * CELL_M2)]), 202 + hubs.indexOf(sel));
    } else { setCount('L', 0); setCount('R', 0); }
    shadowDirty(); numsHTML(); refresh(); labDirty = true;
  }
  // 시각·상황이 바뀌면: 사람 수 · 패널 · 숫자 · 칸 불편도
  function refresh() {
    const pl = plans[sel.id];
    if (pl) { const e = evNow(pl, hour); setCount('L', e.b.ppl); setCount('R', bare() ? e.b.ppl : e.a.ppl); }
    panelHTML(); updStats(); labelScores(); if (glow.visible) paintGlow(cellScores()); dirty = labDirty = true;
  }
  function cellScores() {
    const out = Float64Array.from(S0), pl = plans[sel.id]; if (!pl) return out;
    const sd = sunDir(hour, SCN.heat.doy), r = envEval(pl.cells, pl.md, [sd]), b = envEval(pl.cells, EMPTY, [sd]);
    pl.cells.forEach((i, j) => { out[i] = S0[i] + r.sc[j] - b.sc[j]; }); return out;
  }
  function selectHub(id, flyDur) {
    const h = hubOf(id); if (!h) return; sel = h; labelsHTML(); lowHTML(); labDirty = true; if (REVIEW && o.onHub) o.onHub(h.id);
    if (!(h.id in SETS)) { panelHTML(); setTimeout(() => { planFor(h); if (sel === h) { showPlan(); lowHTML(); if (flyDur) flyTo(planView(h), flyDur); } }, 30); }
    else { showPlan(); lowHTML(); if (flyDur) flyTo(planView(h), flyDur); }
  }
  function timeText() { const sd = sunDir(hour, scn.doy); $('.tw-day').textContent = scn.label + ' · ' + scn.date; $('.tw-hr').textContent = hm(hour); $('.tw-sun').textContent = '태양 고도 ' + Math.round(sd.alt) + '° · 방위 ' + DIR8[Math.round(sd.az / 45) % 8]; }
  function setScn(k) {
    scn = SCN[k]; ui.querySelectorAll('.tw-scn button').forEach(b => b.setAttribute('aria-pressed', b.dataset.t === k));
    timeText(); placeSun(true); refresh();
  }

  let down = null;
  cvs.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  cvs.addEventListener('pointerup', e => {
    if (!down || fly) { down = null; return; } const mv = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t; down = null;
    if (mv > 6 || dt > 650) return;
    const r = cvs.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, v = views.find(w => mx >= w.x && mx < w.x + w.w && my >= w.y && my < w.y + w.h) || views[views.length - 1];
    ndc.set((mx - v.x) / v.w * 2 - 1, -(my - v.y) / v.h * 2 + 1); ray.setFromCamera(ndc, v.cam);
    const ph = ray.intersectObjects(pillarG.children)[0]; if (ph) selectHub(ph.object.userData.hub, 1.4);
  });
  function onKey(e) { if (e.key !== 'Escape') return; if (!$('.tw-report').hidden) $('.tw-report').hidden = true; else if (REVIEW && picked) pickAlt(null); }
  addEventListener('keydown', onKey);
  ui.addEventListener('click', e => {
    const hb = e.target.closest('[data-h]'); if (hb) { selectHub(hb.dataset.h, 1.4); return; }
    const t = e.target.closest('[data-t]'); if (!t) return; const a = t.dataset.t;
    if (a === 'crowd' || a === 'heat') setScn(a);
    if (a === 'glow') { glow.visible = !glow.visible; t.setAttribute('aria-pressed', glow.visible); if (glow.visible) paintGlow(cellScores()); dirty = true; }
    if (a === 'one' || a === 'split') { split = a === 'split'; ui.querySelector('[data-t="one"]').setAttribute('aria-pressed', !split); ui.querySelector('[data-t="split"]').setAttribute('aria-pressed', split); layoutViews(); if (!fly) flyTo(planView(sel), .8); }
    if (a === 'hq') { hqWant = t.getAttribute('aria-pressed') !== 'true'; t.setAttribute('aria-pressed', hqWant); if (hqWant) ensureHQ(); dirty = true; }
    if (a === 'exit') exit();
    if (a === 'alt' && ALT[t.dataset.a]) { alt = t.dataset.a; showPlan(); lowHTML(); if (!fly) flyTo(planView(sel), .8); }
    if (a === 'report') report();
    if (a === 'pick') pickAlt(t.dataset.v === picked ? null : t.dataset.v);
    if (a === 'unpick') pickAlt(null);
    if (a === 'dwg-more') ui.querySelectorAll('.tw-report .tw-dmore').forEach(x => x.hidden = !t.checked);
    if (a === 'ed-open') openEditor();
    if (a === 'rp-edit') rpEdit(!t.classList.contains('on'));
    if (a === 'rp-save') rpSave();
    if (a === 'rp-reset') rpReset();
    if (a === 'rp-doc') rpWord();
    if (a === 'ed-save') saveEditor();
    if (a === 'ed-reset') resetEditor();
    if (a === 'print') window.print();
    if (a === 'png') savePNG();
    if (a === 'svg') { const r = reportData(); if (r.sheets.length) { const u = URL.createObjectURL(new Blob([sheetsSVG(r)], { type: 'image/svg+xml' })), l = document.createElement('a'); l.download = '서울숲_설계도_ABC_' + r.hub.replace(/[^\w가-힣]+/g, '_') + '_' + r.date + '.svg'; l.href = u; l.click(); setTimeout(() => URL.revokeObjectURL(u), 2000); } }
    if (a === 'close-report') $('.tw-report').hidden = true;
  });
  range.addEventListener('input', () => { hour = +range.value; timeText(); placeSun(false); });
  range.addEventListener('change', () => { hour = +range.value; placeSun(true); refresh(); });

  // ---------- A·B·C안 고치기 ----------
  function editorHTML() {
    const col = k => { const a = ALT[k], u = a.use;
      return '<fieldset class="ed-c ed-' + k + '" data-k="' + k + '"><legend>' + k + '안</legend>' +
        '<label class="ed-f">이름<input name="short" value="' + esc(a.short) + '" maxlength="12"></label>' +
        '<div class="ed-g"><b>들어갈 수단</b>' + MEAS.map(([m, t]) => '<label class="ed-ck"><input type="checkbox" name="' + m + '"' + (u[m] ? ' checked' : '') + '> ' + t + '</label>').join('') +
        '<label class="ed-f">분산 유도 안내판<select name="sign"><option value="static"' + (u.sign === 'static' ? ' selected' : '') + '>정적 안내판·앱 알림</option><option value="digital"' + (u.sign === 'digital' ? ' selected' : '') + '>디지털 안내판</option></select></label></div>' +
        '<div class="ed-g"><b>최대 개수</b><label class="ed-f">그늘막·녹음수<input type="number" name="maxShade" min="0" max="20" value="' + (u.maxShade != null ? u.maxShade : MAX_SHADE) + '"></label><label class="ed-f">쉼터 칸(20×20m)<input type="number" name="maxYard" min="0" max="12" value="' + (u.maxYard != null ? u.maxYard : MAX_YARD) + '"></label></div>' +
        '<label class="ed-f">기간<input name="period" value="' + esc(a.period) + '"></label>' +
        '<label class="ed-f">절차<input name="proc" value="' + esc(a.proc) + '"></label>' +
        '<label class="ed-f">장점(한 줄에 하나)<textarea name="pros" rows="3">' + esc(a.pros.join('\n')) + '</textarea></label>' +
        '<label class="ed-f">단점(한 줄에 하나)<textarea name="cons" rows="3">' + esc(a.cons.join('\n')) + '</textarea></label>' +
        '<label class="ed-f">이럴 때 고르세요<textarea name="pick" rows="2">' + esc(a.pick) + '</textarea></label>' +
        (a.edited ? '<p class="ed-n">팀 편집안</p>' : '<p class="ed-n">기본값</p>') + '</fieldset>'; };
    return '<div class="tw-sheet tw-ed"><header><span>대안 구성 편집</span><span>현재 브라우저 저장 · 전 거점 적용</span></header>' +
      '<p class="tw-n">수단 변경 시 동일 산정식으로 3개 대안 재산정. 장단점·기간 문구는 제안서에 그대로 반영되므로 수단 변경 시 함께 수정 필요. 차양·녹음수 개수는 그늘 목표(' + pc(SHADE_TARGET) + ') 도달 시 상한보다 적게 배치.</p>' +
      '<form class="ed-form">' + ['A', 'B', 'C'].map(col).join('') + '</form>' +
      '<div class="tw-ra"><button type="button" data-t="ed-save">저장 및 재산정</button><button type="button" data-t="ed-reset">기본값 복원</button><button type="button" data-t="close-report">닫기</button></div></div>';
  }
  function openEditor() { const el = $('.tw-report'); el.innerHTML = editorHTML(); el.hidden = false; el.scrollTop = 0; }
  function recomputeAll() { Object.keys(SETS).forEach(k => delete SETS[k]); planFor(sel); showPlan(); lowHTML(); labelScores(); idle(); }
  function saveEditor() {
    const out = {};
    ui.querySelectorAll('.ed-c').forEach(fs => {
      const k = fs.dataset.k, v = n => fs.querySelector('[name="' + n + '"]'), lines = n => v(n).value.split('\n').map(x => x.trim()).filter(Boolean);
      const use = { key: k, sign: v('sign').value, maxShade: clamp(Math.round(+v('maxShade').value || 0), 0, 20), maxYard: clamp(Math.round(+v('maxYard').value || 0), 0, 12) };
      MEAS.forEach(([m]) => { use[m] = v(m).checked; });
      out[k] = { short: v('short').value.trim() || ALT_DEF[k].short, period: v('period').value.trim(), proc: v('proc').value.trim(), pros: lines('pros'), cons: lines('cons'), pick: v('pick').value.trim(), use };
    });
    try { localStorage.setItem(ALT_KEY, JSON.stringify(out)); } catch (e) {}
    applyAltEdits(out); $('.tw-report').hidden = true; recomputeAll();
  }
  function resetEditor() { try { localStorage.removeItem(ALT_KEY); } catch (e) {} applyAltEdits(null); $('.tw-report').hidden = true; recomputeAll(); }

  // ---------- 제안서(구청 제출용): 공문 + 사업제안서(A·B·C안 모두) + 개략 설계도 + 선택 회신서 ----------
  // 우리 팀은 안을 고르지 않는다. 같은 자료·같은 식으로 만든 세 안과 근거를 내고, 선택은 구청(관리 주체)이 회신서로 한다.
  const ymd = () => { const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' })); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  let KS = ['A', 'B', 'C'];   // 검토 자료에 담을 안: 검토 화면에서 고른 안 하나, 안 골랐으면 세 안
  const kwon = v => Math.round(v / 1000).toLocaleString();
  const budTxtOf = c => !c.lines.length ? '0천원(설치 없음)' : c.unknown === c.lines.length ? '견적 필요' : kwon(c.lo) + (c.hi > c.lo ? '~' + kwon(c.hi) : '') + '천원' + (c.unknown ? ' + 견적 필요 ' + c.unknown + '건' : '');
  // 단계별 점수 근거(두 상황을 한 표로)
  function basisTable(pl) {
    const bc = basisRows(pl, SCN.crowd), bh = basisRows(pl, SCN.heat);
    return { head: ['요인', '혼잡 시나리오 14시: 바뀌는 것', '기여', '폭염 시나리오 14시: 바뀌는 것', '기여', '근거 등급'],
      rows: bc.rows.map((r, i) => [r[0], r[1] + ' · 요인 ' + r[2], r[3], bh.rows[i][1] + ' · 요인 ' + bh.rows[i][2], bh.rows[i][3], r[4] === bh.rows[i][4] ? r[4] : r[4] + ' / ' + bh.rows[i][4]]).concat([['합계', '', f1(bc.total), '', f1(bh.total), '종합 = .75×(붐빔 .35+날씨 .30+환경 .35) + .25×가장 낮은 요인']]) };
  }
  function budTable(pl) {
    const c = costOf(pl);
    const rows = c.lines.map(l => { const u = COST[l.k] || {}; return [l.label, Math.round(l.q).toLocaleString() + l.unit, u.lo == null ? '견적 필요' : wonR(u.lo, u.hi) + '/' + l.unit, wonR(l.lo, l.hi), l.src]; });
    rows.push(['합계', '', '', c.lo ? wonR(c.lo, c.hi) : '없음', '항목별 사례 단가 범위를 더한 값(설치비 별도 항목은 각 줄 참고)' + (c.unknown ? ' — 견적 필요 ' + c.unknown + '건(그늘막·벤치·안내판 등) 제외' : '')]);
    if (c.refLo) rows.push(['참고 총액(그늘막 참고값 포함)', '', '', wonR(c.lo + c.refLo, c.hi + c.refHi), '그늘막 1개 약 742만~768만원(스마트 그늘막 2026 나라장터 낙찰 기준)을 더한 참고값 — 8×8m 구조물 단가는 견적 필요']);
    return { head: ['항목', '수량', '단가(범위)', '금액(범위)', '단가 출처'], rows };
  }
  function scheduleOf(k) {
    return ['① 관리 주체 협의·현장 확인(매설물·뿌리·배수·행사 동선, 나무 매목조사)', '② ' + (k === 'A' ? '안내 문구·앱 알림·이동식 벤치 준비' : k === 'B' ? '그늘막·안내판 규격 확정과 구매(조달)' : '실시설계·공원조성계획 변경 검토'), '③ 설치·운영 시작 (전체 ' + ALT[k].period + ')', '④ 설치 전후 같은 거점 이용자 평가 비교(사후 평가)'];
  }
  function kindsOf(pl) { return ['cv', 'st'].concat(pl.yards.some(y => y.surf === 'deck') ? ['dk'] : [], pl.yards.some(y => y.surf === 'lawn') ? ['lw'] : [], pl.shade.some(t => t.k === 'sail') ? ['sl'] : [], pl.shade.some(t => t.k === 'tree') ? ['tr'] : [], pl.benches.length || pl.yards.length ? ['bn'] : [], pl.shift ? ['sg', 'rt'] : [], pl.extra.some(t => t.k === 'garden') ? ['gd'] : [], pl.extra.some(t => t.k === 'toilet') ? ['wc'] : [], pl.extra.some(t => t.k === 'photo') ? ['ph'] : []); }

  // ---------- 단면도 A–A′ (거점을 지나는 동서 방향, 가로·세로 같은 축척) ----------
  function sectionSVG(pl) {
    const h = pl.h, HALF = 70, BAND = 12, x0 = h.x - HALF, x1 = h.x + HALF, ZMAX = 14, VW = 1000, S = VW / (x1 - x0), VH = Math.round((ZMAX + 4) * S), gy = VH - 3 * S;
    const X = x => ((x - x0) * S).toFixed(1), Z = z => (gy - z * S).toFixed(1), out = [];
    out.push('<rect width="' + VW + '" height="' + VH + '" fill="#fbfaf6"/>');
    // 기존 수목: 단면 띠(±12m) 안 칸 중 수관 비율 35% 넘는 칸 — 높이는 알 수 없어 10m로 가정(점선 표시)
    for (let i = 0; i < N; i++) if (Math.abs(CY[i] - h.y) < BAND && CX[i] > x0 && CX[i] < x1 && TR[i] > .35) {
      const cx = X(CX[i]); out.push('<line x1="' + cx + '" y1="' + Z(0) + '" x2="' + cx + '" y2="' + Z(5) + '" stroke="#8a7b64" stroke-width="' + (.35 * S).toFixed(1) + '"/><ellipse cx="' + cx + '" cy="' + Z(7.5) + '" rx="' + (4.5 * S * Math.min(1, TR[i] + .2)).toFixed(1) + '" ry="' + (2.8 * S).toFixed(1) + '" fill="#b9d6a8" fill-opacity=".55" stroke="#6f9a5e" stroke-dasharray="4 3"/>');
    }
    // 땅
    out.push('<line x1="0" y1="' + gy + '" x2="' + VW + '" y2="' + gy + '" stroke="#3b3227" stroke-width="2"/><rect x="0" y="' + gy + '" width="' + VW + '" height="' + (3 * S) + '" fill="#e9e1d2"/>');
    const inBand = t => Math.abs(t.y - h.y) < BAND && t.x > x0 && t.x < x1;
    // 쉼터 칸(데크·잔디) + 앉음벽 0.45m
    pl.yards.filter(y => inBand(y)).forEach(y => { const a = X(y.x - 10), w = (20 * S).toFixed(1); out.push(y.surf === 'deck' ? '<rect x="' + a + '" y="' + Z(.14) + '" width="' + w + '" height="' + (.14 * S).toFixed(1) + '" fill="#c79a66" stroke="#7a5a3a"/>' : '<rect x="' + a + '" y="' + Z(.05) + '" width="' + w + '" height="' + (.05 * S + 1).toFixed(1) + '" fill="#7fb36a"/>'); out.push('<rect x="' + a + '" y="' + Z(.45) + '" width="' + (.5 * S).toFixed(1) + '" height="' + (.45 * S).toFixed(1) + '" fill="#bdb8ad" stroke="#77736b"/>'); });
    // 그늘막: 기둥 3.8m·5.0m 쌍곡면 막
    pl.shade.filter(t => t.k === 'sail' && inBand(t)).forEach(t => { const a = t.x - 4.15, b = t.x + 4.15; out.push('<line x1="' + X(a) + '" y1="' + Z(0) + '" x2="' + X(a) + '" y2="' + Z(5) + '" stroke="#555" stroke-width="2.5"/><line x1="' + X(b) + '" y1="' + Z(0) + '" x2="' + X(b) + '" y2="' + Z(3.8) + '" stroke="#555" stroke-width="2.5"/><path d="M' + X(a) + ',' + Z(5) + ' Q' + X(t.x) + ',' + Z(4.0) + ' ' + X(b) + ',' + Z(3.8) + '" fill="none" stroke="#b5651d" stroke-width="3"/>' + dimV(b + .8, 0, 3.8) + dimV(a - .8, 0, 5)); });
    // 녹음수: 심을 때 H4.5m, 자란 뒤 수관 9m(점선)
    pl.shade.filter(t => t.k === 'tree' && inBand(t)).forEach(t => { out.push('<line x1="' + X(t.x) + '" y1="' + Z(0) + '" x2="' + X(t.x) + '" y2="' + Z(3) + '" stroke="#6b4f2f" stroke-width="' + (.25 * S).toFixed(1) + '"/><ellipse cx="' + X(t.x) + '" cy="' + Z(3.4) + '" rx="' + (1.6 * S).toFixed(1) + '" ry="' + (1.2 * S).toFixed(1) + '" fill="#7fbf5a" stroke="#2f6b2a"/><ellipse cx="' + X(t.x) + '" cy="' + Z(6.5) + '" rx="' + (4.5 * S).toFixed(1) + '" ry="' + (3 * S).toFixed(1) + '" fill="none" stroke="#2f6b2a" stroke-dasharray="6 4"/>'); });
    // 벤치·안내판·화장실·정원
    pl.benches.concat(pl.yards.length ? [] : []).filter(inBand).forEach(t => out.push('<rect x="' + X(t.x - .9) + '" y="' + Z(.8) + '" width="' + (1.8 * S).toFixed(1) + '" height="' + (.8 * S).toFixed(1) + '" fill="none" stroke="#8a5a33" stroke-width="2"/>'));
    if (pl.shift && pl.shift.sign && inBand(pl.shift.sign)) { const t = pl.shift.sign; out.push('<line x1="' + X(t.x) + '" y1="' + Z(0) + '" x2="' + X(t.x) + '" y2="' + Z(1.55) + '" stroke="#333" stroke-width="2"/><rect x="' + X(t.x - .75) + '" y="' + Z(2.55) + '" width="' + (1.5 * S).toFixed(1) + '" height="' + (1 * S).toFixed(1) + '" fill="#1f7a5a"/>' + dimV(t.x + 1.2, 0, 2.55)); }
    pl.extra.filter(inBand).forEach(t => { if (t.k === 'toilet') out.push('<rect x="' + X(t.x - 2) + '" y="' + Z(2.8) + '" width="' + (4 * S).toFixed(1) + '" height="' + (2.8 * S).toFixed(1) + '" fill="#e8eef5" stroke="#4a6a8a"/>' + dimV(t.x + 2.6, 0, 2.8)); else if (t.k === 'garden') out.push('<rect x="' + X(t.x - 3.5) + '" y="' + Z(.45) + '" width="' + (7 * S).toFixed(1) + '" height="' + (.45 * S).toFixed(1) + '" fill="#f7d6e6" stroke="#c0568a"/>'); });
    // 사람 1.7m (체류공간에)
    [-14, -5, 9].forEach(dx => { const px = h.x + dx; out.push('<g stroke="#333" stroke-width="2" fill="none"><circle cx="' + X(px) + '" cy="' + Z(1.55) + '" r="' + (.13 * S).toFixed(1) + '" fill="#333"/><line x1="' + X(px) + '" y1="' + Z(1.42) + '" x2="' + X(px) + '" y2="' + Z(.8) + '"/><line x1="' + X(px) + '" y1="' + Z(.8) + '" x2="' + X(px - .2) + '" y2="' + Z(0) + '"/><line x1="' + X(px) + '" y1="' + Z(.8) + '" x2="' + X(px + .2) + '" y2="' + Z(0) + '"/></g>'); });
    out.push(dimV(h.x - 14 - 1, 0, 1.7));
    // 거점·범위 표시, A/A′
    out.push('<line x1="' + X(h.x) + '" y1="' + Z(0) + '" x2="' + X(h.x) + '" y2="' + Z(ZMAX - 1) + '" stroke="#0b7a45" stroke-dasharray="3 4"/><text x="' + X(h.x) + '" y="' + Z(ZMAX - .4) + '" class="hn" text-anchor="middle">' + esc(h.name) + '</text>');
    out.push('<text x="8" y="' + Z(ZMAX - 1) + '" class="ab">A</text><text x="' + (VW - 8) + '" y="' + Z(ZMAX - 1) + '" class="ab" text-anchor="end">A′</text>');
    [-STAY_R, STAY_R].forEach(d => out.push('<line x1="' + X(h.x + d) + '" y1="' + Z(0) + '" x2="' + X(h.x + d) + '" y2="' + Z(1) + '" stroke="#0b7a45" stroke-width="2"/>'));
    out.push('<text x="' + X(h.x - STAY_R) + '" y="' + Z(-1.6) + '" class="sm">체류공간 경계(40m)</text>');
    // 축척 막대 10m
    out.push('<g><rect x="20" y="16" width="' + (5 * S).toFixed(1) + '" height="5" fill="#0d1a14"/><rect x="' + (20 + 5 * S).toFixed(1) + '" y="16" width="' + (5 * S).toFixed(1) + '" height="5" fill="#fff" stroke="#0d1a14"/><text x="20" y="12" class="sm">0</text><text x="' + (20 + 10 * S).toFixed(1) + '" y="12" class="sm" text-anchor="middle">10m</text></g>');
    function dimV(x, za, zb) { const xx = X(x); return '<g stroke="#b4541a" stroke-width="1"><line x1="' + xx + '" y1="' + Z(za) + '" x2="' + xx + '" y2="' + Z(zb) + '"/><line x1="' + (xx - 4) + '" y1="' + Z(zb) + '" x2="' + (+xx + 4) + '" y2="' + Z(zb) + '"/><line x1="' + (xx - 4) + '" y1="' + Z(za) + '" x2="' + (+xx + 4) + '" y2="' + Z(za) + '"/></g><text x="' + (+xx + 5) + '" y="' + Z((za + zb) / 2) + '" class="dm">' + (zb - za).toFixed(2).replace(/0$/, '') + 'm</text>'; }
    const css = '<style>.hn{font:800 13px Pretendard,sans-serif;fill:#0b7a45}.ab{font:900 20px Pretendard,sans-serif;fill:#0d1a14}.sm{font:700 11px Pretendard,sans-serif;fill:#0d1a14}.dm{font:700 11px Pretendard,sans-serif;fill:#b4541a}</style>';
    const sc = [100, 150, 200, 250, 300, 400, 500, 600].find(v => v >= (x1 - x0) * 1000 / 270) || 800;
    return { svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + VW + ' ' + VH + '" width="' + VW + '" height="' + VH + '">' + css + out.join('') + '</svg>', scale: sc, span: x1 - x0 };
  }
  // ---------- 시설 상세도: 디지털트윈 3D 모형 치수(개략) ----------
  const DETAIL = {
    sail: { t: '대형 차양(그늘막)', spec: '평면 8.3×8.3m · 기둥 4개(높이 5.0m 2개·3.8m 2개, 지름 0.18m) · 막은 쌍곡면 · 아래 벤치 2조', draw: () => '<rect x="20" y="30" width="110" height="110" fill="#f6efe0" stroke="#b5651d" stroke-width="2"/><path d="M20,30L130,140M130,30L20,140" stroke="#b5651d"/>' + [[20, 30], [130, 30], [20, 140], [130, 140]].map(q => '<circle cx="' + q[0] + '" cy="' + q[1] + '" r="4" fill="#555"/>').join('') + '<text x="75" y="158" class="dm" text-anchor="middle">8.3m</text><text x="75" y="22" class="sm" text-anchor="middle">평면</text>' +
      '<line x1="170" y1="150" x2="300" y2="150" stroke="#3b3227" stroke-width="2"/><line x1="180" y1="150" x2="180" y2="50" stroke="#555" stroke-width="3"/><line x1="290" y1="150" x2="290" y2="74" stroke="#555" stroke-width="3"/><path d="M180,50 Q235,70 290,74" fill="none" stroke="#b5651d" stroke-width="3"/><text x="172" y="100" class="dm" text-anchor="end">5.0m</text><text x="296" y="114" class="dm">3.8m</text><text x="235" y="22" class="sm" text-anchor="middle">입면</text>' },
    tree: { t: '녹음수 식재', spec: '느티나무 H4.5×R15~R20(단가 조사 규격) · 자란 뒤 수관 지름 9m(그늘 계산 기준) · 뿌리 보호 덮개 1.6×1.6m(모형) · 지주목·식재 구덩이는 현장 표준 적용', draw: () => '<line x1="20" y1="150" x2="300" y2="150" stroke="#3b3227" stroke-width="2"/><rect x="134" y="148" width="52" height="4" fill="#666"/><line x1="160" y1="150" x2="160" y2="95" stroke="#6b4f2f" stroke-width="6"/><ellipse cx="160" cy="82" rx="26" ry="22" fill="#7fbf5a" stroke="#2f6b2a"/><ellipse cx="160" cy="62" rx="120" ry="46" fill="none" stroke="#2f6b2a" stroke-dasharray="6 4"/><path d="M140,150L152,112M180,150L168,112" stroke="#a7825a" stroke-width="2"/><text x="214" y="118" class="dm">H4.5m(심을 때)</text><text x="160" y="12" class="dm" text-anchor="middle">수관 9m(자란 뒤)</text><text x="214" y="140" class="sm">덮개 1.6×1.6m</text>' },
    deck: { t: '데크 쉼터(포장 광장 전환)', spec: '20×20m 칸 · 데크 높이 0.14m · 두 변에 앉음벽(높이 0.45m·폭 0.5m) · 가운데 벤치 2조', draw: () => '<line x1="20" y1="140" x2="300" y2="140" stroke="#3b3227" stroke-width="2"/><rect x="40" y="128" width="240" height="12" fill="#c79a66" stroke="#7a5a3a"/>' + Array.from({ length: 12 }, (_, i) => '<line x1="' + (40 + i * 20) + '" y1="128" x2="' + (40 + i * 20) + '" y2="140" stroke="#7a5a3a"/>').join('') + '<rect x="40" y="100" width="14" height="28" fill="#bdb8ad" stroke="#77736b"/><text x="60" y="112" class="dm">앉음벽 0.45m</text><text x="160" y="160" class="dm" text-anchor="middle">20m</text><text x="286" y="124" class="dm" text-anchor="end">데크 0.14m</text>' },
    lawn: { t: '잔디 쉼터', spec: '20×20m 칸 · 평떼 붙임(단가는 노무비만 확인) · 두 변에 앉음벽(0.45m) · 벤치 2조', draw: () => '<line x1="20" y1="140" x2="300" y2="140" stroke="#3b3227" stroke-width="2"/><rect x="40" y="134" width="240" height="6" fill="#7fb36a"/><rect x="40" y="106" width="14" height="28" fill="#bdb8ad" stroke="#77736b"/><text x="60" y="118" class="dm">앉음벽 0.45m</text><text x="160" y="160" class="dm" text-anchor="middle">20m</text>' },
    bench: { t: '벤치(등의자)', spec: '길이 1.8m · 좌면 높이 0.44m · 등받이 0.58~0.80m · 2개 1조', draw: () => '<line x1="20" y1="140" x2="300" y2="140" stroke="#3b3227" stroke-width="2"/><rect x="70" y="102" width="180" height="6" fill="#8a5a33"/><rect x="70" y="62" width="180" height="22" fill="none" stroke="#8a5a33" stroke-width="3"/><line x1="80" y1="108" x2="80" y2="140" stroke="#555" stroke-width="4"/><line x1="240" y1="108" x2="240" y2="140" stroke="#555" stroke-width="4"/><text x="160" y="160" class="dm" text-anchor="middle">1.8m</text><text x="256" y="110" class="dm">0.44m</text><text x="256" y="72" class="dm">0.80m</text>' },
    sign: { t: '분산 유도 안내판', spec: '기둥 높이 2.3m · 안내판 1.5×1.0m(화면 1.36×0.86m) · 전체 높이 약 2.55m · 실시간 혼잡·우회 안내', draw: () => '<line x1="20" y1="150" x2="300" y2="150" stroke="#3b3227" stroke-width="2"/><rect x="155" y="70" width="10" height="80" fill="#333"/><rect x="110" y="40" width="100" height="62" fill="#1f7a5a"/><rect x="116" y="46" width="88" height="50" fill="#0c1714"/><text x="160" y="76" class="sy" text-anchor="middle">혼잡 안내</text><text x="218" y="74" class="dm">1.5×1.0m</text><text x="172" y="130" class="dm">2.3m</text>' },
    garden: { t: '계절 정원(화단)', spec: '화단 7.0×3.4m(약 24㎡) · 높이 0.45m · 계절 초화', draw: () => '<line x1="20" y1="140" x2="300" y2="140" stroke="#3b3227" stroke-width="2"/><rect x="60" y="112" width="200" height="28" fill="#f7d6e6" stroke="#c0568a"/>' + Array.from({ length: 14 }, (_, i) => '<circle cx="' + (70 + i * 14) + '" cy="108" r="5" fill="' + ['#e0567a', '#f2b632', '#9a6bd1', '#ffffff'][i % 4] + '" stroke="#c0568a"/>').join('') + '<text x="160" y="160" class="dm" text-anchor="middle">7.0m</text><text x="266" y="130" class="dm">0.45m</text>' },
    toilet: { t: '모듈형 화장실', spec: '본체 4.0×2.6m · 높이 2.8m · 지붕 4.6×3.2m · 출입문 2', draw: () => '<line x1="20" y1="150" x2="300" y2="150" stroke="#3b3227" stroke-width="2"/><rect x="90" y="60" width="140" height="90" fill="#e8eef5" stroke="#4a6a8a" stroke-width="2"/><rect x="80" y="54" width="160" height="8" fill="#555"/><rect x="118" y="86" width="28" height="64" fill="#c79a66"/><rect x="174" y="86" width="28" height="64" fill="#c79a66"/><text x="160" y="166" class="dm" text-anchor="middle">4.0m</text><text x="238" y="108" class="dm">2.8m</text>' },
    photo: { t: '포토존', spec: '기단 2.4×1.4m · 원형 조형물(모형 개략) · 규격은 실시설계에서 확정', draw: () => '<line x1="20" y1="150" x2="300" y2="150" stroke="#3b3227" stroke-width="2"/><rect x="118" y="142" width="84" height="8" fill="#bdb8ad"/><circle cx="160" cy="96" r="42" fill="none" stroke="#f2b632" stroke-width="10"/><text x="214" y="146" class="dm">기단 2.4×1.4m</text>' }
  };
  function detailSVG(keys) {
    const n = keys.length, cols = 2, rows = Math.ceil(n / cols), CW = 500, CH = 250, VW = CW * cols, VH = CH * rows;
    const cells = keys.map((k, i) => { const d = DETAIL[k], cx = (i % cols) * CW, cy = Math.floor(i / cols) * CH; return '<g transform="translate(' + cx + ',' + cy + ')"><rect x="6" y="6" width="' + (CW - 12) + '" height="' + (CH - 12) + '" fill="#fff" stroke="#14201a"/><text x="18" y="28" class="tt">D' + String(i + 1).padStart(2, '0') + '  ' + d.t + '</text><g transform="translate(90,34) scale(1)">' + d.draw() + '</g><foreignObject x="16" y="' + (CH - 54) + '" width="' + (CW - 32) + '" height="44"><div xmlns="http://www.w3.org/1999/xhtml" style="font:600 11px Pretendard,sans-serif;color:#3b4a43;line-height:1.35">' + esc(d.spec) + '</div></foreignObject></g>'; });
    const css = '<style>.tt{font:800 14px Pretendard,sans-serif;fill:#0b7a45}.sm{font:700 11px Pretendard,sans-serif;fill:#0d1a14}.dm{font:700 11px Pretendard,sans-serif;fill:#b4541a}.sy{font:800 10px Pretendard,sans-serif;fill:#6af5b0}</style>';
    return { svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + VW + ' ' + VH + '" width="' + VW + '" height="' + VH + '"><rect width="' + VW + '" height="' + VH + '" fill="#fbfaf6"/>' + css + cells.join('') + '</svg>' };
  }
  function detailKeys(set) {
    const ks = new Set(); KS.forEach(k => { const pl = set[k]; pl.yards.forEach(y => ks.add(y.surf === 'deck' ? 'deck' : 'lawn')); pl.shade.forEach(t => ks.add(t.k)); if (pl.benches.length || pl.yards.length) ks.add('bench'); if (pl.shift) ks.add('sign'); pl.extra.forEach(t => ks.add(t.k)); });
    return ['sail', 'tree', 'deck', 'lawn', 'bench', 'sign', 'garden', 'toilet', 'photo'].filter(k => ks.has(k));
  }
  // 도면 묶음: 도면 목록 → 안별 배치도·단면도 → 시설 상세도
  function drawingSet(set, date, keys) {
    keys = keys || KS;
    const sheets = [], dt = date.split('-').map(Number).join('. ') + '.', p0 = set[keys[0]], A3 = v => 'A3 1/' + v.toLocaleString();
    const NOTE0 = ['기본구상(개략) 도면 — 측량·실시설계 도면 아님', '기존 수목: 위성 피복 추정(매목조사 필요)', PATHW.length ? '원로 폭: OSM 태그 ' + PATHT + '곳 외 유형별 추정(실측 필요)' : '원로 폭 4m 가정(실측 필요)'];
    const loc = bpSheet({ mode: 'loc', rel: 'L-002', pl: p0, no: 'L-001', title: '위치도', date: dt, notes: ['서울숲 전체에서 대상지 위치 표시', PARKB.length ? '공원 경계: OpenStreetMap 서울숲 경계(2026-11-09 수집) — 지적 경계는 지적도로 확인' : '공원 경계: 분석 격자(20m) 외곽선 — 지적 경계와 다를 수 있음'] });
    sheets.push({ full: true, no: 'L-001', name: '위치도', svg: loc.svg, scale: A3(loc.scale) });
    const ex = bpSheet({ mode: 'ex', rel: 'L-001, L-101', pl: p0, no: 'L-002', title: '현황도', date: dt, notes: NOTE0.concat(['수면·건축물·잔디: OpenStreetMap', '도면 명칭·축척·서명란: 서울시 건설기술용역 관리편람(조경편, 2014) — 표제란 형식은 발주기관 협의']) });
    sheets.push({ full: true, no: 'L-002', name: '현황도', svg: ex.svg, scale: A3(ex.scale) });
    keys.forEach((k, n) => {
      const pl = set[k], no = 'L-1' + String(n + 1).padStart(2, '0'), b = bpSheet({ mode: 'pl', rel: 'L-002, L-2' + String(n + 1).padStart(2, '0') + ', D-001', pl, no, title: (keys.length > 1 ? k + '안 ' : '') + '시설물배치도', date: dt, notes: NOTE0.concat(['번호 = 수량표 번호', 'A–A′ = 단면도 L-2' + String(n + 1).padStart(2, '0') + ' 위치', '치수 단위 mm']) });
      sheets.push({ full: true, no, name: ALT[k].name + ' 시설물배치도', svg: b.svg, scale: A3(b.scale) });
      const sv = sectionSVG(pl);
      sheets.push({ more: true, no: 'L-2' + String(n + 1).padStart(2, '0'), name: ALT[k].name + ' 단면도 A–A′', svg: sv.svg, scale: 'A4 가로 약 1:' + sv.scale + ' (가로·세로 같은 축척, 폭 ' + sv.span + 'm)', note: '거점을 지나는 동서 단면(앞뒤 12m 안 시설을 투영). 기존 수목 높이는 자료가 없어 10m로 가정한 점선, 녹음수는 심을 때 H4.5m와 자란 뒤 수관 9m(점선).' });
    });
    const ds = detailKeys(set); if (ds.length) sheets.push({ more: true, no: 'D-001', name: KS.length === 1 ? '시설물 상세도' : '시설물 상세도 (세 안 공통)', svg: detailSVG(ds).svg, scale: '축척 없음(치수 표기)', note: '치수는 디지털트윈 3D 모형에 쓴 값과 단가 조사 규격이며, 구조 계산·재료 사양은 실시설계에서 정한다.' });
    return sheets;
  }

  function reportData() {
    const p = P[sel.id], pct = satPct(p), set = SETS[sel.id], date = ymd(), gr = gradeOf(sel.id), base = set && set.C;
    const reasons = p ? Object.keys(BAD).filter(k => (p.reasons || {})[k]).sort((a, b) => p.reasons[b] - p.reasons[a]).map(k => BAD[k] + ' ' + p.reasons[k] + '건') : [];
    const C = base && base.d14.crowd, Hh = base && base.d14.heat, ti = treeInfo(sel);
    const name = '서울숲 ' + sel.name + ' 이용 환경 개선';
    const one = KS.length === 1, K1 = KS[0], lab = one ? '' : '대안별 ';
    const title = '서울숲 「' + sel.name + '」 이용 환경 개선안(' + KS.join('·') + ')';
    const loc = '서울숲 ' + (sel.zone || '') + ' 「' + sel.name + '」 일대 (서울 성동구 뚝섬로 273)';
    // 1. 현황 및 문제점(세 안 공통의 '지금')
    const tech = [];
    const issue = [];
    issue.push(p && p.n ? '이용자 평가 ' + p.n + '건 · 만족 ' + Math.round(pct) + '%' + (rat.demo ? ' (시연용 가상 평가 — 실제 제출 전 실측 평가로 교체)' : ' (대시보드 도착 평가, 최근 90일)') + (reasons.length ? ' · 아쉬운 이유: ' + reasons.join(', ') : '') : '이용자 평가 없음');
    if (C) issue.push('혼잡 시나리오(5월 토요일, 가정) 14시 예상 혼잡률 ' + pc(C.b.ratio) + ' (수용 ' + sel.cap.toLocaleString() + '명, 대시보드 가정값) — 혼잡 기준 ' + pc(CROWD_CUT) + (C.b.ratio > CROWD_CUT ? ' 초과' : ' 이하'));
    if (Hh && sel.type === 'outdoor') issue.push('폭염 시나리오(체감 ' + SCN.heat.w.feels + '℃, 2026-08-07 ERA5 재분석값) 14시 체류공간 그늘 비율 ' + pc(Hh.b.s) + ' — 목표 ' + pc(SHADE_TARGET) + '(팀 가정)' + (Hh.b.s < SHADE_TARGET ? ' 미달' : ' 충족') + ' (햇빛 광선 계산)');
    if (base) issue.push('주변 환경 점수 ' + base.env0.toFixed(1) + '점 · 휴게시설까지 평균 ' + Math.round(base.cmp.b.rest) + 'm (팀 20m 격자: Landsat 지표온도·ESA WorldCover·OSM)');
    if (ti) issue.push('수목 현황(추정): 반경 ' + ENV_R + 'm 수관 비율 ' + pc(ti.cover) + ', 수관 면적 환산 교목 ' + ti.est.toLocaleString() + '주(수관폭 9m 기준), 추정 주요 수종 ' + ti.top.map(t => t.name).join('·') + ' — ' + TREE_NOTE);
    hubEv(sel.id).forEach(e => tech.push('「' + BAD[e.key] + '」 ' + e.n + '건 — 서울시 실시간 도시데이터와 대조: ' + VTXT[e.park.v] + ' (' + evLine(e.key) + ', Fisher 정확검정)'));
    const stat = { head: ['구분', '현황', '기준·비고'], rows: [
      ['대상지', '서울숲 ' + (sel.zone || '') + ' 「' + sel.name + '」(' + ({ outdoor: '야외', shade: '수림', indoor: '실내' }[sel.type] || '') + ' 거점)', '수용 ' + sel.cap.toLocaleString() + '명(가정값)'],
      ['이용자 만족도', p && p.n ? Math.round(pct) + '% (응답 ' + p.n + '건)' : '자료 없음', rat.demo ? '시연용 가상 평가' : '대시보드 도착 평가, 최근 90일'],
      ['주요 불만', reasons.length ? reasons.join(', ') : '없음', '이용자 선택 응답'],
      ['혼잡률(혼잡 시나리오 14시)', C ? pc(C.b.ratio) : '—', '혼잡 기준 ' + pc(CROWD_CUT) + (C && C.b.ratio > CROWD_CUT ? ' 초과' : ' 이하')],
      ['체류공간 그늘 비율(폭염 시나리오 14시)', Hh && sel.type === 'outdoor' ? pc(Hh.b.s) : '해당 없음', '목표 ' + pc(SHADE_TARGET) + '(팀 가정)' + (Hh && sel.type === 'outdoor' ? (Hh.b.s < SHADE_TARGET ? ' 미달' : ' 충족') : '')],
      ['주변 환경 점수', base ? base.env0.toFixed(1) + '점 · 휴게시설 평균 ' + Math.round(base.cmp.b.rest) + 'm' : '—', '팀 20m 격자(위성·지도 자료)'],
      ['수목 현황(추정)', ti ? '수관 비율 ' + pc(ti.cover) + ' · 환산 교목 ' + ti.est.toLocaleString() + '주' : '—', '알고리즘 추정치 — 실측 필요']
    ] };
    const probs = [];
    if (C && C.b.ratio > CROWD_CUT) probs.push('주말 피크 시간 혼잡률 ' + pc(C.b.ratio) + '로 기준(' + pc(CROWD_CUT) + ') 초과 — 체류공간 부족');
    if (Hh && sel.type === 'outdoor' && Hh.b.s < SHADE_TARGET) probs.push('폭염 시 체류공간 그늘 비율 ' + pc(Hh.b.s) + '로 목표(' + pc(SHADE_TARGET) + ') 미달 — 차양·녹음 부족');
    if (base && base.cmp.b.rest > 60) probs.push('휴게시설까지 평균 ' + Math.round(base.cmp.b.rest) + 'm — 휴게 접근성 미흡');
    if (p && p.n && pct < SAT_CUT) probs.push('이용자 만족도 ' + Math.round(pct) + '%로 관리 기준(' + SAT_CUT + '%) 미만' + (reasons.length ? ' — 주요 불만: ' + reasons.slice(0, 2).join(', ') : ''));
    if (!probs.length) probs.push('관리 기준을 넘는 문제 없음 — 예방적 개선 검토');
    const need = [], rsn = (p && p.reasons) || {};
    if ((C && C.b.ratio > CROWD_CUT) || rsn.crowded) NEED.crowd.forEach(x => need.push(x));
    if (sel.type === 'outdoor' && ((Hh && Hh.b.s < SHADE_TARGET) || rsn.weather)) NEED.heat.forEach(x => need.push(x));
    if (base && base.shade.some(t => t.k === 'tree')) NEED.tree.forEach(x => need.push(x));
    NEED.base.forEach(x => need.push(x));
    // 세 안 요약표(효과·범위·비용·기간·사후 검증)
    const sum = set ? { head: ['', ...KS.map(k => ALT[k].name)], rows: [
      ['하는 일', ...KS.map(k => doesTxt(set[k]))],
      ['평균 효과 · 가정 바꾸면', ...KS.map(k => { const sv = sensOf(set[k]); return f1(sv.g0) + '점 · ' + f1(sv.lo) + ' ~ ' + f1(sv.hi) + '점'; })],
      ['개략 비용', ...KS.map(k => costTxt(costOf(set[k])))],
      ['기간', ...KS.map(k => ALT[k].period)],
      ['장점', ...KS.map(k => ALT[k].pros.join(' / '))],
      ['단점', ...KS.map(k => ALT[k].cons.join(' / '))]
    ] } : null;
    // 안별 시설 목록
    const facOf = k => { const pl = set[k], fac = pl.G.map((g, i) => { const t = groupText(g, pl); return NUM[i] + ' ' + t.t + ' — ' + t.d; }), sp = shadeSpecies();
      if (sp && pl.shade.some(t => t.k === 'tree')) fac.push('녹음수 수종 안: ' + sp + ' (서울숲 기존 식재 수종, 반려견 주의 목록 제외) — 현장 생육 여건 확인 필요');
      return (fac.length ? fac : ['공간을 바꾸지 않음(기준을 넘지 않음)']).concat(['도면: 시설물배치도 L-1' + String(KS.indexOf(k) + 1).padStart(2, '0') + ' · 단면도 L-2' + String(KS.indexOf(k) + 1).padStart(2, '0') + ' (붙임 3)']); };
    // ⑥ 새로 생기는 그늘 면적(폭염 시나리오 14시, 체류공간 기준 — 기존 나무 그늘 포함한 면적의 증가분)
    const shadeArea = pl => { const e = evalHub(pl, SCN.heat, 14), a0 = pl.stay0.length * CELL_M2, a1 = pl.stay.length * CELL_M2; return { b: e.b.s * a0, a: e.a.s * a1, d: e.a.s * a1 - e.b.s * a0 }; };
    const effT = set ? { head: ['', ...KS.map(k => ALT[k].name)], rows: [
      ['예측 만족도 · 혼잡 시나리오 14시', ...KS.map(k => { const d = set[k].d14.crowd; return d.b.raw.toFixed(1) + ' → ' + d.a.raw.toFixed(1) + '점 (' + f1(d.a.raw - d.b.raw) + ')'; })],
      ['예측 만족도 · 폭염 시나리오 14시', ...KS.map(k => { const d = set[k].d14.heat; return d.b.raw.toFixed(1) + ' → ' + d.a.raw.toFixed(1) + '점 (' + f1(d.a.raw - d.b.raw) + ')'; })],
      ['평균 효과 · 가정 바꾸면', ...KS.map(k => { const sv = sensOf(set[k]); return f1(sv.g0) + '점 · ' + f1(sv.lo) + ' ~ ' + f1(sv.hi) + '점'; })],
      ['신규 그늘 면적(폭염 시나리오 14시)', ...KS.map(k => { const s2 = shadeArea(set[k]); return (s2.d > 1 ? '+' + Math.round(s2.d).toLocaleString() + '㎡' : '없음') + ' (' + Math.round(s2.b).toLocaleString() + ' → ' + Math.round(s2.a).toLocaleString() + '㎡)'; })],
    ] } : null;
    const sens = set ? { head: ['가정', '지금 값', ...KS.map(k => ALT[k].name + ' (낮게 ~ 높게)'), '근거'], rows: SENS.map(f => [f.label, f.base, ...KS.map(k => { const r = sensOf(set[k]).rows.find(x => x.f === f); return f1(r.lo.g) + ' ~ ' + f1(r.hi.g) + '점'; }), f.why]) } : null;
    // ⑤ 추진 일정: 설치 → 평가 → 다시 점검
    const sched = { head: ['단계', ...KS.map(k => ALT[k].name)], rows: [
      ['① 협의·현장 확인', ...KS.map(() => '관리 주체 협의, 매설물·뿌리·배수·행사 동선 확인, 나무 매목조사(실측)')],
      ['② 준비', '안내 문구·앱 알림·이동식 벤치 준비', '그늘막·안내판 규격 확정과 구매(조달)', '실시설계, 공원조성계획 변경 검토(도시공원법 제16조의2)'],
      ['③ 설치', ...KS.map(k => '설치·운영 시작 — 전체 ' + ALT[k].period)],
      ['④ 평가', ...KS.map(k => { const n = needN(gainOf(set ? set[k] : null)); return '설치 후 같은 거점 평가를 전후 비교' + (n ? '(전·후 각 약 ' + n.toLocaleString() + '건)' : '') + ' — 붐빔은 「약간 붐빔」 이상 시각, 더위는 체감 31℃ 이상 시각끼리'; })],
      ['⑤ 재점검', ...KS.map(() => '6개월·1년 뒤 재평가, 여름·주말 평가로 모형 계수(붐빔·더위) 다시 맞추고 유지관리 점검')]
    ] };
    const check = ['수용 인원·끌림·분산 비율 ' + pc(SHIFT) + '·그늘 목표 ' + pc(SHADE_TARGET) + '·쉼터 사용률 ' + pc(YARD_USE) + '·혼잡 기준 ' + pc(CROWD_CUT) + '은 가정값 — 현장 계수와 설문으로 보정', '단가는 출처가 확인된 값만 넣은 개략값 — 실제 사업비는 설계·견적으로 확정', '녹음수 효과는 수관 지름 9m로 자랐을 때 기준, 심은 직후에는 그늘막이 먼저 효과', '나무 수종·그루 수는 알고리즘 추정값이라 실측(매목조사)이 필요함', '계절 정원 ' + GARDEN_M2 + '㎡·그루당 수관 ' + CANOPY_M2 + '㎡(지름 9m)·공사 기간은 가정값', '폭염 시나리오 날씨(체감 36.3℃)는 관측소 실측이 아니라 ERA5 재분석 모델값', '지표온도 변화는 트윈 계수(수관 −0.839·포장 +1.345, R² 0.21)로 계산 — 산출 스크립트가 저장소에 없어 확인 필요(팀 단순회귀: 수관 −1.61, R² 0.175)', '현재 실측 평가는 모두 「여유·보통」 혼잡과 체감 30℃ 미만에서 나와 붐빔·더위 계수를 평가로 맞추지 못함', '설계도는 기본구상 수준의 개략 설계도이며 실시설계·측량 도면이 아님'];
    const sheets = set ? drawingSet(set, date) : [];
    const gainsTxt = set ? KS.map(k => k + ' ' + f1(gainOf(set[k]))).join(' · ') : '';
    const lead = (p && p.n ? '이용자 만족도 ' + Math.round(pct) + '%(' + p.n + '건)' : '이용자 평가 부족') + (C ? ', 혼잡 시나리오 예상 혼잡률 ' + pc(C.b.ratio) : '') + (Hh && sel.type === 'outdoor' ? ', 폭염 시나리오 체류공간 그늘 비율 ' + pc(Hh.b.s) : '');
    return {
      title, date, hub: sel.name, grade: gr, sheets, glance: set ? glanceData(set) : null,
      doc: { org: DOC.from, to: DOC.to, cc: DOC.cc, subj: '서울숲 「' + sel.name + '」 거점 휴게환경 개선 검토 보고', contact: DOC.contact,
        rel: LAW.rel,
        body: [
          '서울숲 「' + sel.name + '」 거점은 ' + lead + ' 등으로 휴게환경 개선이 필요합니다.',
          one ? '디지털트윈으로 ' + ALT[K1].name + '을 만들어 예측 만족도(평균 ' + (set ? f1(gainOf(set[K1])) : '—') + '점), 비용, 기간, 설계도를 정리했습니다.' : '디지털트윈으로 같은 조건에서 A 운영 개선·B 시설 보강·C 공간 재조성 세 안을 만들어 예측 만족도(평균 ' + gainsTxt + '점), 비용, 기간, 설계도를 비교했습니다.',
          one ? '검토하시어 추진 여부를 결정(붙임 마지막 장 검토 의견서)해 주시기 바랍니다.' : '검토하시어 추진할 안을 결정(붙임 마지막 장 검토 의견서)해 주시기 바랍니다.'],
        att: '붙임  검토 보고서 1부.  끝.' },
      sections: [
        { h: '검토 개요', table: { head: ['항목', '내용'], rows: [['사업명', '서울숲 「' + sel.name + '」 거점 휴게환경 개선'], ['사업 위치', loc], ['작성 부서', DOC.from], ['사업 내용', one ? '디지털트윈 기반 개선안 — ' + ALT[K1].name : '디지털트윈 기반 개선 대안 3건(A 운영 개선 · B 시설 보강 · C 공간 재조성) — 구청 선택'], [lab + '개략 사업비', set ? KS.map(k => k + '안 ' + costTxt(costOf(set[k]))).join(' / ') : '—'], [lab + '사업기간', KS.map(k => k + '안 ' + ALT[k].period).join(' / ')], [lab + '예측 효과', set ? KS.map(k => k + '안 ' + f1(gainOf(set[k])) + '점').join(' / ') + ' (만족도 모형 예측치)' : '—']] } },
        { h: '① 현황 및 문제점', table: stat },
        { h: '①-1 문제점', list: probs.concat(['객관 근거 판정(참고): ' + gr.label + ' — ' + gr.act + ' (세부 내용은 부록)']) },
        set && { h: one ? '② 개선방안 — ' + ALT[K1].name : '② 개선방안 — 디지털트윈 대안 A·B·C (선택: 결재권자)', html: glanceHTML(set, 'doc', KS), nx: one ? '같은 거점·같은 자료·같은 계산식으로 만든 A·B·C 세 안 가운데 검토 화면에서 고른 안입니다.' : '세 안은 같은 거점·같은 자료·같은 계산식에서 쓸 수 있는 수단만 달리해 만들었습니다. 안 선택은 결재권자가 합니다.' + (KS.some(k => ALT[k].edited) ? ' 세 안의 수단 구성은 담당 부서가 조정했습니다: ' + KS.map(k => k + '안 ' + MEAS.filter(([m]) => ALT[k].use[m]).map(([, t]) => t.replace(/\(.*\)/, '')).join('·')).join(' / ') + '.' : '') },
        sum && !one && { h: '②-1 대안 비교표', table: sum },
        one && set && { h: '①-2 이 안을 낸 기준', table: { head: ['항목', '지금', '기준', '판정', '대응'], rows: critRows(set[K1]).map(r => [r.k, r.now, r.cut, r.over ? '기준 넘음' : '괜찮음', r.k === '이용자 평가' ? '—' : r.over && r.put ? r.put : r.over ? (((SUPP[K1] || {})[r.k] || {}).t ? SUPP[K1][r.k].t + '(보완 수단, 점수 밖)' : '현장 조사 후 별도 검토') : r.put ? r.put + '(기본 구성, 효과 작음)' : '—']) }, note: '기준값(혼잡 70%·그늘 50%·쉼터 60m·만족 60%)은 팀 가정이며 현장 계수·설문으로 보정 필요.' },
        one && set && { h: '②-2 만족도가 오르는 이유', list: [...new Set(set[K1].G.map(g => g.k))].filter(k => WHY[k]).map(k => { const w = WHY[k]; return groupText(set[K1].G.find(g => g.k === k), set[K1]).t + ': ' + w.chain + (w.ev.length ? ' — 근거: ' + w.ev.map(([t, c]) => t + '(' + CITE[c].s + ')').join('; ') : '') + (w.lim ? ' — 한계: ' + w.lim[0] + '(' + CITE[w.lim[1]].s + ')' : ''); }) },
        one && set && (() => { const R = intentRows(set[K1]); return { h: '②-3 대상지 의도 점검', table: { head: ['수단', '판정', '조건'], rows: R.rows.map(r => [r.name, { ok: '맞음', warn: '조건부', no: '충돌' }[r.st], r.t || '—']) }, note: '이곳의 원래 의도: ' + R.it.t + (R.it.src.length ? ' (' + R.it.src.map(c => CITE[c].s).join(', ') + ')' : '') + ' · ' + INTENT_ALL.t + '(' + CITE.dsw.s + ') · ' + CITE.law.f }; })(),
        ...(set ? KS.map(k => ({ apx: 1, h: k + '안 사업 내용 — ' + ALT[k].name, list: facOf(k) })) : []),
        { h: '③ 필요성', list: need.slice(0, 3).concat(LAW.lines.slice(0, 1)) },
        { apx: 1, h: '필요성 상세 — 선행연구 · 법적 근거', list: need.concat(LAW.lines, set && set.C.yards.length ? [LAW.c] : []) },
        set && { h: '④ 소요예산', table: { head: ['대안', '개략 사업비'], rows: KS.map(k => [ALT[k].name, costTxt(costOf(set[k]))]) }, note: '단가는 출처가 확인된 값만 넣었고, 단가마다 지자체 예산서·계약·회의록 출처를 붙였습니다(대부분 1건 기준이라 범위로 표시). 항목별 내역은 부록.' },
        ...(set ? KS.map(k => ({ apx: 1, h: k + '안 소요예산 내역 — ' + ALT[k].name + ' : ' + costTxt(costOf(set[k])), table: budTable(set[k]) })) : []),
        { apx: 1, h: '소요예산 공통 기준', list: ['단가는 출처가 확인된 값만 넣었고(표의 「단가 출처」), 단가는 지자체 예산서·계약정보·의회 회의록에서 원문을 확인한 값이며, 대부분 1건 기준이라 범위로 표시했습니다.', '실제 사업비는 설계·조달(나라장터 종합쇼핑몰 품목정보 API 등)로 확정합니다.'] },
        { h: '⑤ 추진 일정 — 설치 · 평가 · 재점검', table: sched },
        effT && { h: '⑥ 기대효과 — 예측 만족도 변화 · 신규 그늘 면적', table: effT, note: '점수는 대시보드 만족도 모형의 예상 점수(실제 이용자 평가 아님). 그늘 면적 = 체류공간(거점 40m 안 + 넓힌 쉼터)의 14시 그늘 비율 × 넓이, 햇빛 광선 계산.' },
        ...(set ? KS.map(k => ({ apx: 1, h: k + '안 점수 상승 근거 — ' + ALT[k].name, table: basisTable(set[k]) })) : []),
        sens && { apx: 1, h: '가정 민감도 분석', table: sens, note: '한 번에 가정 하나씩 바꾼 평균 효과(혼잡 시나리오·폭염 시나리오 14시). 근거 등급: 측정 · 계산 · 문헌 대조 · 가정(팀이 정한 값).' },
        
        { apx: 1, h: '분석 방법 및 근거 검증', list: gradeLines(gr).concat(tech, ['혼잡 시나리오: 5월 토요일 14시(날씨 감점 없는 날, 가정) · 폭염 시나리오: 체감 ' + SCN.heat.w.feels + '℃(2026-08-07 15시, Open-Meteo ERA5 재분석값)', '그늘 비율: 태양 위치(NOAA 식)와 햇빛 광선 4×4 표본으로 체류공간(거점 ' + STAY_R + 'm 이내) 계산', '주변 환경 점수: 팀 20m 격자(Landsat 지표온도·ESA WorldCover·OSM) 취약도 식 재현(최대 오차 0.015)']) },
        { apx: 1, h: '한계 및 확인 사항', list: check },
        { apx: 1, h: '참고문헌·자료', list: REFS.map((x, i) => '[' + (i + 1) + '] ' + x).concat(Object.values(CITE).map((x, i) => '[' + (REFS.length + i + 1) + '] ' + x.s + ' — ' + x.f)) }
      ].filter(Boolean)
    };
  }
  const titleBlock = (s, r) => '<table class="tw-tblk"><tr><th>도면번호</th><td>' + s.no + '</td><th>도면명</th><td>서울숲 「' + esc(r.hub) + '」 ' + esc(s.name) + '</td></tr><tr><th>축척</th><td>' + esc(s.scale) + '</td><th>작성 · 일자</th><td>' + esc(DOC.from) + ' · ' + r.date + '</td></tr><tr><th>비고</th><td colspan="3">' + esc(s.note) + ' 구청 협의용 개략(기본구상) 설계도이며 실시설계·측량 도면이 아닙니다.</td></tr></table>';
  // 붙임 그림: 안마다 「지금 | 개선 후」 나눠 보기 화면을 찍는다
  let shots = {};
  function captureShots() {
    const keep = alt, keepSplit = split; shots = {};
    if (!split) { split = true; layoutViews(); }
    const camP = camera.position.clone(), camT = controls.target.clone();
    KS.forEach(k => { alt = k; showPlan(); const v = planView(sel); camera.position.copy(v.p); controls.target.copy(v.t); controls.update(); layoutViews(); draw(views, false); try { shots[k] = cvs.toDataURL('image/jpeg', .82); } catch (e) { shots[k] = ''; } });
    alt = keep; split = keepSplit; camera.position.copy(camP); controls.target.copy(camT); controls.update(); layoutViews(); showPlan();
  }
  function report() {
    KS = REVIEW && picked ? [picked] : ['A', 'B', 'C'];
    captureShots();
    const r = reportData(), el = $('.tw-report'), ul = a => '<ul>' + a.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>';
    const tb = t => '<div class="tw-tw"><table><thead><tr>' + t.head.map(x => '<th>' + esc(x) + '</th>').join('') + '</tr></thead><tbody>' + t.rows.map(rw => '<tr>' + rw.map((x, j) => (j ? '<td>' : '<th>') + esc(x) + (j ? '</td>' : '</th>')).join('') + '</tr>').join('') + '</tbody></table></div>';
    const d = r.doc;
    const lg = s => s.legend ? '<div class="tw-lg2">' + s.legend.map(x => '<span class="lg-' + x[0] + '"><i></i>' + x[1] + '</span>').join('') + '</div>' : '';
    // 공문서 양식: 기안문(내부결재) + 검토보고서(Ⅰ·Ⅱ 장, □ ○ - 단계 기호) — 「행정업무의 운영 및 혁신에 관한 규정」 기안문 서식 구성을 따름
    const fd = (() => { const [y, m, dd] = r.date.split('-').map(Number), w = '일월화수목금토'[new Date(y, m - 1, dd).getDay()]; return { d: y + '. ' + m + '. ' + dd + '.', w: y + '. ' + m + '. ' + dd + '.(' + w + ')' }; })();
    // 장 순서: 서울시 시민참여예산 「사업제안서」(2026년 공모 붙임3) — 사업명·위치·예산·기간 → 사업목적(현 문제점·추진 배경) → 사업내용(대상·규모·추진방법·산출내역) → 사업효과(기대효과·수혜범위)
    const CH = ['사업 개요', '사업 목적 (현 문제점 및 추진 배경)', '사업 내용 (대상·규모·추진 방법)', '소요 예산 (산출 내역)', '추진 일정', '사업 효과 (기대 효과·수혜 범위)', '행정 사항'];
    const one1 = KS.length === 1, chOf = sx => { const h = sx.h; if (/^검토 개요/.test(h)) return 0; if (/^①|^③ 필요성/.test(h)) return 1; if (/^②-3/.test(h)) return 6; if (/^②/.test(h) || (one1 && /안 사업 내용 — /.test(h))) return 2; if (/^④/.test(h) || (one1 && (/안 소요예산 내역/.test(h) || /^소요예산 공통/.test(h)))) return 3; if (/^⑤/.test(h)) return 4; if (/^⑥/.test(h)) return 5; return -1; };
    const ren = h => h === '검토 개요' ? '' : h === '① 현황 및 문제점' ? '현황' : h === '①-1 문제점' ? '문제점' : /^①-2/.test(h) ? '개선 기준 (기준값 대비 현황)' : h === '③ 필요성' ? '추진 배경' : /^② 개선방안 — /.test(h) ? (one1 ? '주요 내용 — ' + h.replace(/^② 개선방안 — /, '') : '대안 구성 (선택: 결재권자)') : /^②-1/.test(h) ? '대안 비교표' : /^②-2/.test(h) ? '만족도가 오르는 이유' : /^②-3/.test(h) ? '대상지 설계 의도 부합 여부' : /안 사업 내용 — /.test(h) ? '세부 내용' : h === '④ 소요예산' ? '총괄' : /안 소요예산 내역/.test(h) ? '산출 기초 (수량 × 단가)' : /^소요예산 공통/.test(h) ? '단가 적용 기준' : /^[⑤⑥]/.test(h) ? '' : h;
    const fl = a => '<ul class="fm-ul">' + a.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>';
    const setR = SETS[sel.id], G = setR ? glanceData(setR) : null;
    const altT = G ? { head: ['구분'].concat(KS.map(k => k + '안 · ' + ALT[k].short)), rows: [
      ['하는 일'].concat(KS.map(k => G[k].does)), ['예측 만족도 변화'].concat(KS.map(k => f1(G[k].lo) + ' ~ ' + f1(G[k].hi) + '점 (기준 가정 ' + f1(G[k].g) + '점)')),
      ['붐빌 때 · 더울 때'].concat(KS.map(k => f1(G[k].dc) + '점 · ' + f1(G[k].dh) + '점')), ['개략 사업비'].concat(KS.map(k => G[k].cost)), ['사업 기간'].concat(KS.map(k => G[k].period)),
      ['장점'].concat(KS.map(k => G[k].pros.slice(0, 3).join(' / '))), ['단점'].concat(KS.map(k => G[k].cons.slice(0, 3).join(' / '))), ['적용 조건'].concat(KS.map(k => G[k].pick))] } : null;
    const body = sx => (sx.html && altT ? tb(altT) : sx.html || '') + (sx.list ? fl(sx.list) : '') + (sx.table ? tb(sx.table) : '') + (sx.tables ? sx.tables.map(tb).join('') : '') + (sx.note ? '<p class="tw-n">' + esc(sx.note) + '</p>' : '');
    const sec = sx => { const t = ren(sx.h); return (t ? '<h5 class="fm-h2">' + esc(t) + '</h5>' : '') + body(sx); };
    const law = { h: '관련 법령 및 협조', list: ['「도시공원 및 녹지 등에 관한 법률」 제16조의2제3항 — 공원의 주제·특색을 바꾸지 않는 소규모 공원시설 설치는 도시공원위원회 심의·주민의견 청취 생략 가능(2009 판본 확인, 현행 조문 확인 필요)', '협조: ' + DOC.cc + ' — 시설 설치 위치·규격 협의', '설치 후 같은 거점 이용자 평가로 효과 확인(5. 추진 일정 참조), 결과에 따라 다음 단계 시설 검토'] };
    const ov = (r.sections.find(sx => sx.h === '검토 개요') || { table: { rows: [] } }).table.rows, ovv = k => (ov.find(x => x[0] === k) || [, ''])[1];
    const ben = { h: '수혜 범위', list: ['대상지 체류공간(반경 ' + STAY_R + 'm) 이용자 — 동시 수용 ' + Math.round(sel.cap || 0).toLocaleString() + '명(가정값), 주말·폭염 시간대 이용자 중심', '분산 유도 안내는 공원 안 다른 거점 이용자에게도 혼잡 완화 효과(점수 계산에는 이 거점만 반영)'] };
    const sdF = G ? { h: '성동구 주민참여예산 사업 신청서 기재 요약', table: { head: ['신청서 항목', '기재 내용'], rows: [['사업명', ovv('사업명')], ['사업위치', ovv('사업 위치')], ['소요사업비(예상)', KS.map(k => (KS.length > 1 ? k + '안 ' : '') + G[k].cost).join(' / ')], ['사업목적(제안취지)', d.body[0] || ''], ['사업내용', KS.map(k => (KS.length > 1 ? k + '안: ' : '') + G[k].does).join(' / ')], ['현황사진', '붙임 2 현황·대안 비교 화면(현장 사진으로 교체 필요)']] }, note: '성동구 공고 제2024-516호(2024. 3. 18.) 붙임2 「주민참여예산사업 신청서」 항목 기준 — 2027년도 공모 서식과 다른지 확인 필요' } : null;
    const tagged = r.sections.map((sx, ix) => ({ sx, ix, c: chOf(sx) }));
    const chap = CH.map((t, c) => { const xs = tagged.filter(x => x.c === c); if (c === 5) xs.push({ sx: ben, ix: 998 }); if (c === 6) { xs.push({ sx: law, ix: 999 }); if (sdF) xs.push({ sx: sdF, ix: 1000 }); } return xs.length ? '<h4 class="fm-h1">' + esc(t) + '</h4>' + xs.map(x => sec(x.sx)).join('') : ''; }).join('');
    const apx = tagged.filter(x => x.c < 0).map(x => x.sx);
    const main = null;
    el.innerHTML = '<div class="tw-sheet fm-on">' +
      // 1. 기안문(내부결재)
      '<section class="tw-doc fm-doc"><p class="fm-draft">※ 초안 — 결재 전 작성 부서·직위·성명·연락처 기입 · 서식: 「행정업무의 운영 및 혁신에 관한 규정 시행규칙」 제4조·별지 제1호서식(행정안전부령 제408호, 2023. 6. 28. 시행)</p><div class="fm-org">서울특별시</div>' +
      '<table class="fm-hd"><tr><th>수신</th><td>내부결재</td></tr><tr><th>(경유)</th><td></td></tr><tr><th>제목</th><td>' + esc(d.subj) + '</td></tr></table><div class="fm-rule"></div>' +
      '<div class="fm-bd"><p>1. 관련: ' + esc(d.rel) + '</p><p>2. ' + esc(d.subj.replace(/ 검토 보고$/, '')) + '에 대하여 아래와 같이 검토 결과를 보고합니다.</p>' + d.body.map((x, q) => '<p class="sub">' + '가나다라마'[q] + '. ' + esc(x) + '</p>').join('') + '</div>' +
      '<p class="fm-att">붙임&nbsp;&nbsp;1. 검토 보고서 1부.<br><span class="fm-att2">2. 현황·대안 비교 화면(현장 사진 대체) 1부.</span><br><span class="fm-att2">3. 기본설계 도면(위치도·현황도·시설물배치도·단면도·상세도) 1부.</span><br><span class="fm-att2">4. 소관부서 검토 의견서 1부.&nbsp;&nbsp;끝.</span></p>' +
      '<table class="fm-gy"><tr><th>기안자</th><th>검토자</th><th>검토자</th><th>결재권자</th></tr><tr><td>' + esc(DOC.from.replace(/^서울숲관리사무소 /, '')) + ' 주무관<br>○○○</td><td>' + esc(DOC.from.replace(/^서울숲관리사무소 /, '')) + '장<br>○○○</td><td>서울숲관리사무소장<br>○○○</td><td>' + esc(DOC.to) + '<br>(서명)</td></tr>' +
      '<tr><th>협조자</th><td colspan="3">' + esc(DOC.cc) + '</td></tr></table>' +
      '<table class="fm-ft"><tr><th>시행</th><td>' + esc(DOC.from.replace(/^서울숲관리사무소 /, '')) + '-0000 (' + fd.d + ')</td><th>접수</th><td></td></tr>' +
      '<tr><td colspan="4">우 ○○○○○ &nbsp;서울특별시 성동구 뚝섬로 273 서울숲관리사무소 &nbsp;/ 홈페이지 ○○○</td></tr>' +
      '<tr><td colspan="4">전화번호 ○○-○○○○-○○○○ &nbsp;/ 팩스번호 ○○-○○○○-○○○○ &nbsp;/ ○○○@seoul.go.kr &nbsp;/ 공개</td></tr></table></section>' +
      // 2. 검토 보고서
      '<section class="tw-prop fm-rep"><div class="fm-title"><h1>' + esc(d.subj) + '</h1></div><p class="fm-by">' + fd.w + '&nbsp;&nbsp;' + esc(DOC.from) + '</p>' +
      '<div class="fm-sum"><b>검토 요지</b>' + fl(d.body.slice(0, 2)) + '</div>' +
      chap +
      (apx.length ? '<h4 class="fm-h1 fm-ref">참고 자료</h4>' + apx.map(sx => '<h5 class="fm-h2">' + esc(sx.h) + '</h5>' + body(sx)).join('') : '') +
      '<p class="tw-n fm-end">모형 예상 점수와 개략 단가로 만든 검토 보고서로, 실제 효과와 사업비는 현장 조사·설계·견적으로 확정해야 함. 항목 기호(□ ○ -)는 같은 시행규칙 제2조제1항 단서에 따름. 글꼴(제목 고딕·본문 명조)은 공식 규정이 아닌 관행.' + (rat.demo ? ' 이용자 평가는 시연용 가상 데이터임.' : '') + '</p></section>' +
      // 붙임 1: 지금/개선 후 비교 그림
      '<section class="tw-dwg"><header><span>붙임 2 · 현황 / 대안 적용 비교 화면</span><span>' + r.date + '</span></header><h1>디지털트윈 비교 (좌: 현황 · 우: 대안 적용)</h1>' +
      KS.map(k => shots[k] ? '<h4>' + ALT[k].name + '</h4><img class="tw-shot" src="' + shots[k] + '" alt="' + ALT[k].name + ' 지금과 개선 후 3D 비교">' : '').join('') +
      '<p class="tw-warn2">※ 그림·점수·수목 현황은 알고리즘 추정값으로 실측이 필요함. 시뮬레이션 화면이며 설계 도면 아님.</p></section>' +
      // 붙임 2: 개략 설계도
      (r.sheets.length ? '<section class="tw-dwg"><header><span>붙임 3 · 기본설계 도면 (' + r.sheets.length + '매)</span><span>' + r.date + '</span></header><h1>도면 목록</h1><label class="tw-dwgt"><input type="checkbox" data-t="dwg-more"> 단면도·상세도 펼치기</label>' + tb({ head: ['도면번호', '도면명', '축척'], rows: r.sheets.map(s => [s.no, s.name, s.scale]) }) + '</section>' +
        r.sheets.map(s => '<section class="tw-dwg' + (s.more ? ' tw-dmore" hidden="' : s.full ? ' fm-full' : '') + '"><header><span>붙임 3 · ' + s.no + '</span><span>' + r.date + '</span></header><h1>' + esc(s.name) + '</h1><div class="tw-dwgf">' + s.svg + '</div>' + (s.full ? '' : lg(s) + (s.rows ? tb({ head: ['번호', '시설', '규격', '수량', '위치(거점 기준)'], rows: s.rows }) : '') + titleBlock(s, r)) + '</section>').join('') : '') +
      // 붙임 3: 선택 회신서
      '<section class="tw-dwg tw-reply"><header><span>붙임 4 · 소관부서 검토 의견서</span><span>' + fd.d + '</span></header><h1>소관부서 검토 의견서</h1>' +
      '<table class="tw-tblk fm-op"><tr><th>사 업 명</th><td colspan="3">' + esc(d.subj.replace(/ 검토 보고$/, '')) + (KS.length === 1 ? ' (' + ALT[KS[0]].name + ')' : '') + '</td></tr><tr><th>검토 부서</th><td></td><th>검토자(직·성명)</th><td></td></tr>' +
      '<tr><th>사업 개요</th><td colspan="3">' + (KS.length === 1 ? esc(G ? G[KS[0]].does : '') + ' · 기간 ' + esc(G ? G[KS[0]].period : '') : '□ A안 · 운영 개선 &nbsp; □ B안 · 시설 보강 &nbsp; □ C안 · 공간 재조성') + '</td></tr>' +
      '<tr><th>적정 소요예산</th><td colspan="3">제안 ' + esc(G ? KS.map(k => (KS.length > 1 ? k + '안 ' : '') + G[k].cost).join(' / ') : '') + ' → 검토 ( &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; 원)</td></tr>' +
      '<tr><th>사업 기간</th><td colspan="3">제안 ' + esc(G ? KS.map(k => (KS.length > 1 ? k + '안 ' : '') + G[k].period).join(' / ') : '') + ' → 검토 ( &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; )</td></tr>' +
      '<tr><th>법률·조례 적합 여부</th><td colspan="3">□ 적합 &nbsp; □ 부적합 &nbsp; □ 확인 필요</td></tr>' +
      '<tr><th rowspan="4">사업성 평가</th><th>타당성</th><td colspan="2">□ 상 &nbsp; □ 중 &nbsp; □ 하</td></tr><tr><th>시급성</th><td colspan="2">□ 상 &nbsp; □ 중 &nbsp; □ 하</td></tr><tr><th>사업 효과</th><td colspan="2">□ 상 &nbsp; □ 중 &nbsp; □ 하</td></tr><tr><th>수혜 범위</th><td colspan="2">□ 상 &nbsp; □ 중 &nbsp; □ 하</td></tr>' +
      '<tr><th>종합 검토 결과</th><td colspan="3">□ 채택 &nbsp;&nbsp; □ 조정 후 채택 &nbsp;&nbsp; □ 보류 &nbsp;&nbsp; □ 불채택</td></tr>' +
      '<tr><th>검토 의견</th><td colspan="3" style="height:80px"></td></tr><tr><th>조정 요청</th><td colspan="3" style="height:50px">(시설 위치·규모·수종·일정 등)</td></tr><tr><th>검 토 일</th><td></td><th>문의</th><td>' + esc(DOC.contact) + '</td></tr></table>' +
      '<p class="tw-n">항목은 자치구 「주민참여예산 소관부서 검토의견서」 구성(사업개요·적정 소요예산·사업기간·법률·조례 적합여부·사업성평가·종합검토결과)을 따름.</p></section>' +
      '<div class="tw-ra tw-rabar"><button type="button" class="pri" data-t="print">' + PRINT_ICO + '인쇄 · PDF 저장</button><button type="button" data-t="rp-doc">Word 저장</button><button type="button" data-t="png">PNG 저장</button><button type="button" data-t="svg">설계도 SVG</button><span class="sp"></span><button type="button" data-t="rp-edit">✎ 편집</button><button type="button" data-t="rp-save">편집 저장</button><button type="button" data-t="rp-reset">원래대로</button><button type="button" data-t="close-report">닫기</button></div><p class="tw-edn" hidden></p></div>';
    el.hidden = false; el.scrollTop = 0;
    rpRestore();
  }
  // ---------- 제안서 바로 편집: 공문·본문·회신서 글을 직접 고치고 이 브라우저에 거점별 저장 ----------
  const RP_KEY = () => 'seoulforest-proposal2-' + sel.id + (KS.length === 1 ? '-' + KS[0] : ''), RP_SEL = ['.tw-doc', '.tw-prop', '.tw-reply'];
  function rpNote(t) { const n = ui.querySelector('.tw-edn'); if (n) { n.hidden = !t; n.textContent = t || ''; } }
  function rpRestore() {
    let sv = null; try { sv = JSON.parse(localStorage.getItem(RP_KEY()) || 'null'); } catch (e) {}
    if (!sv) return;
    RP_SEL.forEach((q, i) => { const e = ui.querySelector('.tw-report ' + q); if (e && sv.v && sv.v[i] != null) e.innerHTML = sv.v[i]; });
    rpNote('저장된 편집본을 불러왔습니다(' + sv.t + '). 데이터로 다시 만들려면 「원래대로」.');
  }
  function rpEdit(on) {
    RP_SEL.forEach(q => { const e = ui.querySelector('.tw-report ' + q); if (e) { e.contentEditable = on ? 'true' : 'false'; e.classList.toggle('rp-on', on); } });
    const b = ui.querySelector('[data-t="rp-edit"]'); if (b) { b.textContent = on ? '편집 끝내기' : '✎ 편집'; b.classList.toggle('on', on); }
    rpNote(on ? '편집 중 — 글자를 눌러 바로 고치세요. 다 고치면 「편집 저장」.' : '');
  }
  function rpSave() {
    const d = ymd(), sv = RP_SEL.map(q => { const e = ui.querySelector('.tw-report ' + q); return e ? e.innerHTML : null; });
    try { localStorage.setItem(RP_KEY(), JSON.stringify({ v: sv, t: d })); rpEdit(false); rpNote('편집본 저장됨(' + d + ', 이 브라우저). 인쇄·PDF와 Word 저장에 반영됩니다.'); } catch (e) { rpNote('저장 실패: ' + e.message); }
  }
  function rpReset() { try { localStorage.removeItem(RP_KEY()); } catch (e) {} report(); rpNote('데이터로 다시 만들었습니다.'); }
  function rpWord() {
    const sh = ui.querySelector('.tw-report .tw-sheet'); if (!sh) return;
    const c = sh.cloneNode(true); c.querySelectorAll('.tw-ra,.tw-edn,.tw-draft').forEach(x => x.remove()); c.querySelectorAll('[contenteditable]').forEach(x => x.removeAttribute('contenteditable'));
    const st = 'body{font-family:"맑은 고딕",sans-serif;font-size:11pt;color:#111}table{border-collapse:collapse;width:100%}th,td{border:1px solid #888;padding:4px 6px;vertical-align:top;font-size:10pt}h1{font-size:18pt}h2{font-size:16pt;text-align:center}h4{font-size:12pt;color:#0b7a45;margin:14pt 0 4pt}img,svg{max-width:100%}.gl-g{display:block}.gl-c{border:1px solid #aaa;padding:6pt;margin:4pt 0}';
    const html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>제안서</title><style>' + st + '</style></head><body>' + c.innerHTML + '</body></html>';
    const u = URL.createObjectURL(new Blob(['\ufeff' + html], { type: 'application/msword' })), a = document.createElement('a');
    a.download = '서울숲_제안서_' + sel.name.replace(/[^\w가-힣]+/g, '_') + '_' + ymd() + '.doc'; a.href = u; a.click(); setTimeout(() => URL.revokeObjectURL(u), 2000);
  }
  // 설계도 전체를 한 장의 SVG로(세로로 이어 붙임)
  function sheetsSVG(r) {
    let y = 0; const W0 = 1000, parts = [];
    r.sheets.forEach(s => { const m = s.svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/), w = +m[1], hh = +m[2], k = W0 / w, H0 = hh * k;
      parts.push('<text x="0" y="' + (y + 26) + '" font-family="Pretendard,sans-serif" font-weight="800" font-size="22" fill="#0b7a45">' + esc(s.no + '  ' + s.name + '  ·  ' + s.scale) + '</text>');
      parts.push('<svg x="0" y="' + (y + 40) + '" width="' + W0 + '" height="' + H0.toFixed(0) + '" viewBox="0 0 ' + w + ' ' + hh + '">' + s.svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '') + '</svg>'); y += 40 + H0 + 40; });
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W0 + ' ' + Math.ceil(y) + '" width="' + W0 + '" height="' + Math.ceil(y) + '"><rect width="100%" height="100%" fill="#fff"/>' + parts.join('') + '</svg>';
  }
  function savePNG() {
    const r = reportData(), Wc = 1240, c = document.createElement('canvas'), x = c.getContext('2d'), F = 'Pretendard Variable, Pretendard, sans-serif', lines = [];
    const push = (t, s, w, col, gap) => lines.push({ t, s, w, col, gap }), d = r.doc;
    push('초안 · 제출 전 내용과 수신처를 확인하세요', 18, 600, '#b4541a', 10); push(d.org, 34, 800, '#0d1a14', 14);
    push('수신  ' + d.to + ' (참조: ' + d.cc + ')', 21, 500, '#1d2a24', 4); push('제목  ' + d.subj, 23, 800, '#0d1a14', 12);
    push('1. 관련: ' + d.rel, 21, 500, '#1d2a24', 4); push('2. 내용', 21, 500, '#1d2a24', 4); d.body.forEach(t => push('   ' + t, 21, 500, '#1d2a24', 4)); push(d.att, 21, 600, '#1d2a24', 10); push(d.org, 22, 800, '#1d2a24', 6); push(d.contact + ' · ' + r.date, 18, 500, '#5b6b63', 30);
    push('붙임 · 제안서 · ' + r.date, 20, 600, '#5b6b63', 8); push(d.subj, 34, 800, '#0d1a14', 16);
    const tl = t => { const hd = t.head; t.rows.forEach(rw => push('· ' + rw[0] + ' — ' + rw.slice(1).map((v, j) => v ? (hd[j + 1] ? hd[j + 1] + ': ' : '') + v : '').filter(Boolean).join(' | '), 19, 500, '#1d2a24', 4)); };
    r.sections.forEach(s => { push(s.h, 25, 800, '#0b7a45', 8); if (s.html && r.glance) KS.forEach(k => { const g = r.glance[k]; push(ALT[k].name + ' — ' + g.badges.join(' · ') + ' · 평균 ' + f1(g.g) + '점 · ' + g.cost + ' · ' + g.period, 20, 800, '#1d2a24', 4); g.pros.forEach(t => push('  ✔ ' + t, 19, 500, '#1f7a5a', 2)); g.cons.forEach(t => push('  ✖ ' + t, 19, 500, '#b4541a', 2)); push('  적용 조건: ' + g.pick, 19, 600, '#1d2a24', 8); }); (s.list || []).forEach(t => push('· ' + t, 20, 500, '#1d2a24', 4)); if (s.table) tl(s.table); (s.tables || []).forEach(tl); if (s.note) push(s.note, 18, 500, '#5b6b63', 4); push('', 8, 400, '#000', 8); });
    push('붙임 3 · 개선안 선택 회신서: □ A안 □ B안 □ C안 □ 보류 — 선택 이유·검토 의견·조정 요청·회신일을 적어 회신', 20, 700, '#1d2a24', 10);
    push('모형 예상 점수와 개략 단가로 만든 검토 보고서이며, 실제 효과와 사업비는 현장 조사·설계·견적으로 확정해야 합니다.' + (rat.demo ? ' 이용자 평가는 시연용 가상 데이터입니다.' : ''), 17, 500, '#6b7a73', 0);
    const wrap = (t, s, w) => { x.font = w + ' ' + s + 'px ' + F; const out = []; let cur = ''; for (const chh of t) { if (x.measureText(cur + chh).width > Wc - 160 && cur) { out.push(cur); cur = chh; } else cur += chh; } out.push(cur); return out; };
    const img = new Image(); let dimg = null;
    const drawP = () => {
      const ih = img.width ? Math.round((Wc - 160) * img.height / img.width) : 0, dh = dimg && dimg.width ? Math.round((Wc - 160) * dimg.height / dimg.width) : 0; let H2 = 120 + (ih ? ih + 120 : 0) + (dh ? dh + 80 : 0);
      const wl = lines.map(l => { const w = l.t ? wrap(l.t, l.s, l.w) : ['']; H2 += w.length * l.s * 1.45 + l.gap; return w; });
      c.width = Wc; c.height = Math.min(32000, Math.ceil(H2 + 60)); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); let y = 80;
      lines.forEach((l, k) => { x.font = l.w + ' ' + l.s + 'px ' + F; x.fillStyle = l.col; wl[k].forEach(t => { x.fillText(t, 80, y); y += l.s * 1.45; }); y += l.gap; });
      if (ih) { x.font = '700 20px ' + F; x.fillStyle = '#0b7a45'; x.fillText('붙임 1. 지금 / 개선 후 비교(' + ALT[alt].name + ') — 알고리즘 추정값이라 실측이 필요함', 80, y); y += 20; x.drawImage(img, 80, y, Wc - 160, ih); y += ih + 40; }
      if (dh) { x.font = '800 24px ' + F; x.fillStyle = '#0b7a45'; x.fillText('붙임 2. 개략 설계도 ' + r.sheets.length + '매 (실시설계 아님)', 80, y); y += 16; x.drawImage(dimg, 80, y, Wc - 160, dh); }
      const a = document.createElement('a'); a.download = '서울숲_제안서_ABC_' + r.hub.replace(/[^\w가-힣]+/g, '_') + '_' + r.date + '.png'; a.href = c.toDataURL('image/png'); a.click();
    };
    const shot = shots[alt] || shots.C || ''; const go = () => { if (shot) { img.onload = drawP; img.onerror = drawP; img.src = shot; } else drawP(); };
    if (r.sheets.length) { dimg = new Image(); dimg.onload = go; dimg.onerror = () => { dimg = null; go(); }; dimg.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(sheetsSVG(r)); } else go();
  }

  // ---------- 그리기(바뀔 때만 · 멈추면 고화질 한 번) ----------
  let W = 1, H = 1, split = true, views = [], VIS = null, hqWant = false, HQ = null, hqPend = false, hqAt = 0, hqLoading = false;
  function size() { W = root.clientWidth || innerWidth; H = root.clientHeight || innerHeight; renderer.setSize(W, H, false); layoutBlocks(); }
  function visRect() {
    const g = q => { const e = ui.querySelector(q); return e && !e.hidden && !e.closest('[hidden]') ? e.getBoundingClientRect() : null; }, L = g(REVIEW ? '.tw-pop' : '.tw-left'), Rr = REVIEW ? null : g('.tw-right'), T = g('.tw-top'), Tm = g('.tw-time');
    const v = W >= 900 ? { x0: L ? L.right : 0, x1: Rr ? Rr.left : W, y0: T ? T.bottom : 0, y1: Tm ? Tm.top : H }
      : { x0: 0, x1: W, y0: T ? T.bottom : 0, y1: Math.min(L ? L.top : H, Tm ? Tm.top : H, Rr ? Rr.top : H) };
    return v.x1 - v.x0 < 160 || v.y1 - v.y0 < 120 ? { x0: 0, x1: W, y0: 0, y1: H } : v;
  }
  function setOffset(cam, v) {
    const cx = (v.vis.x0 + v.vis.x1) / 2 - v.x, cy = (v.vis.y0 + v.vis.y1) / 2 - v.y, fw = 2 * Math.max(cx, v.w - cx), fh = 2 * Math.max(cy, v.h - cy);
    cam.setViewOffset(fw, fh, fw / 2 - cx, fh / 2 - cy, v.w, v.h);
  }
  function layoutViews() {
    const v = VIS = visRect(), vert = W <= 800;
    if (!split) views = [{ cam: camera, side: 'R', x: 0, y: 0, w: W, h: H, vis: v }];
    else if (!vert) { const m = Math.round((v.x0 + v.x1) / 2); views = [{ cam: camL, side: 'L', x: 0, y: 0, w: m, h: H, vis: { x0: v.x0, x1: m, y0: v.y0, y1: v.y1 } }, { cam: camera, side: 'R', x: m, y: 0, w: W - m, h: H, vis: { x0: m, x1: v.x1, y0: v.y0, y1: v.y1 } }]; }
    else { const m = Math.round((v.y0 + v.y1) / 2); views = [{ cam: camL, side: 'L', x: 0, y: 0, w: W, h: m, vis: { x0: 0, x1: W, y0: v.y0, y1: m } }, { cam: camera, side: 'R', x: 0, y: m, w: W, h: H - m, vis: { x0: 0, x1: W, y0: m, y1: v.y1 } }]; }
    views.forEach(w => setOffset(w.cam, w));
    if (HQ) views.forEach(w => { const c = HQ[w.side]; c.setPixelRatio(renderer.getPixelRatio()); c.setSize(w.w, w.h); });
    const sp = $('.tw-split'); sp.hidden = !split;
    if (split) {
      const b = views[1]; $('.tw-div').style.cssText = vert ? 'left:0;top:' + (b.y - 1) + 'px;width:' + W + 'px;height:2px' : 'left:' + (b.x - 1) + 'px;top:' + v.y0 + 'px;width:2px;height:' + (v.y1 - v.y0) + 'px';
      views.forEach(w => { const l = sp.querySelector('.tw-vl[data-s="' + w.side + '"]'), st = sp.querySelector('.tw-vs[data-s="' + w.side + '"]');
        l.style.transform = 'translate(' + (w.vis.x0 + 14) + 'px,' + (w.vis.y0 + 12) + 'px)';
        st.style.transform = 'translate(' + ((w.vis.x0 + w.vis.x1) / 2) + 'px,' + (w.vis.y1 - 10) + 'px) translate(-50%,-100%)'; st.style.maxWidth = (w.vis.x1 - w.vis.x0 - 16) + 'px'; });
    }
    const fp = $('.tw-fps'); fp.hidden = !SHOW_FPS; fp.style.transform = 'translate(' + (v.x1 - 10) + 'px,' + (v.y0 + 12) + 'px) translate(-100%,0)';
    dirty = labDirty = true;
  }
  // 각 화면 아래 핵심 숫자 3개(지금 상황·시각)
  function updStats() {
    const pl = plans[sel.id], L = $('.tw-vs[data-s="L"]'), Rr = $('.tw-vs[data-s="R"]');
    if (!pl) { L.innerHTML = Rr.innerHTML = ''; return; }
    const e = evNow(pl, hour), cell = (k, v, df) => '<span><small>' + k + '</small><b>' + v + '</b>' + (df || '') + '</span>';
    const d = (v, u, good, dg) => '<em class="' + (good ? 'up' : '') + '">' + (Math.abs(v) < Math.pow(10, -dg) / 2 ? '±0' : (v > 0 ? '+' : '−') + Math.abs(v).toFixed(dg)) + u + '</em>';
    const ds = e.a.raw - e.b.raw, dr = Math.round(e.a.ratio * 100) - Math.round(e.b.ratio * 100), dsh = Math.round(e.a.s * 100) - Math.round(e.b.s * 100);
    L.innerHTML = cell('예측 만족도', e.b.raw.toFixed(1) + '점') + cell('혼잡률', pc(e.b.ratio)) + cell('체류공간 그늘 비율', pc(e.b.s)) + cell('사람', Math.round(e.b.ppl) + '명');
    Rr.innerHTML = cell('예측 만족도', e.a.raw.toFixed(1) + '점', d(ds, '', ds > .05, 1)) + cell('혼잡률', pc(e.a.ratio), d(dr, '%p', dr < 0, 0)) + cell('체류공간 그늘 비율', pc(e.a.s), d(dsh, '%p', dsh > 0, 0)) + cell('사람', Math.round(e.a.ppl) + '명');
  }
  function draw(vs, useHQ) {
    camL.position.copy(camera.position); camL.quaternion.copy(camera.quaternion); sky.position.copy(camera.position);
    for (const v of vs) {
      const gy = H - v.y - v.h; renderer.setViewport(v.x, gy, v.w, v.h); renderer.setScissor(v.x, gy, v.w, v.h);
      renderer.shadowMap.needsUpdate = v.side === 'L' ? shL : shR;
      if (useHQ && HQ) HQ[v.side].render(); else renderer.render(scene, v.cam);
      if (v.side === 'L') shL = false; else shR = false;
    }
  }
  async function ensureHQ() {
    if (HQ || hqLoading) return; hqLoading = true;
    try {
      const [{ EffectComposer }, { RenderPass }, { GTAOPass }, { OutputPass }] = await Promise.all(['EffectComposer', 'RenderPass', 'GTAOPass', 'OutputPass'].map(n => import('three/addons/postprocessing/' + n + '.js')));
      if (!alive) return;
      const mk = cam => { const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 }), c = new EffectComposer(renderer, rt); c.addPass(new RenderPass(scene, cam)); const g = new GTAOPass(scene, cam, 4, 4); g.updateGtaoMaterial({ radius: 2.5, distanceExponent: 1, thickness: 2, scale: 1 }); g.blendIntensity = .9; c.addPass(g); c.addPass(new OutputPass()); return c; };
      HQ = { L: mk(camL), R: mk(camera) }; layoutViews();
    } catch (e) { console.warn('[디지털트윈] 고품질 렌더링 실패', e); hqWant = false; }
    hqLoading = false;
  }
  const SHOW_FPS = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) || /[?&](fps|debug3d)\b/.test(location.search);   // 개발 중에만
  let fN = 0, fMs = 0, fT = 0, raf = 0, alive = true, lastR = 0, ft = [], qLevel = 0;
  function degrade(l) {
    if (l === 1) { renderer.setPixelRatio(1); size(); hqWant = false; $('[data-t="hq"]').setAttribute('aria-pressed', 'false'); }
    if (l === 2) { TREES.forEach(m => { m.castShadow = false; }); shadowDirty(); }
    if (l === 3) { renderer.shadowMap.enabled = false; scene.traverse(m => { if (m.material) [].concat(m.material).forEach(x => { x.needsUpdate = true; }); }); }
    const q = $('.tw-q'); if (q) { q.hidden = false; q.textContent = '저사양 기기 — 렌더링 품질 하향 (' + l + '/3)'; }
  }
  function frame(now) {
    if (!alive) return; raf = requestAnimationFrame(frame);
    if (fly) {
      const t = Math.min(1, (now - fly.t0) / (fly.dur * 1000)), e = ease(t);
      controls.target.lerpVectors(fly.a.t, fly.b.t, e); camera.position.lerpVectors(fly.a.p, fly.b.p, e); camera.lookAt(controls.target); dirty = labDirty = true;
      if (controls.target.distanceTo(ctr) > 140) { ctr.copy(controls.target); placeSun(false); }
      if (t >= 1) { const d = fly.done; fly = null; controls.enabled = true; ctr.copy(controls.target); placeSun(false); treeLOD(); if (d) d(); }
    } else if (controls.update()) dirty = true;
    if (dirty) {
      dirty = false; const t0 = performance.now(); draw(views, false); if (labDirty) { labDirty = false; placeLabels(); } fN++; fMs += performance.now() - t0;
      if (now - lastR < 120) { ft.push(now - lastR); if (ft.length >= 30) { const avg = ft.reduce((a, b) => a + b, 0) / ft.length; ft = []; if (avg > 32 && qLevel < 3) degrade(++qLevel); } }
      lastR = now; hqPend = hqWant; hqAt = now + 280;
    } else if (hqPend && now >= hqAt && !fly) { hqPend = false; if (HQ) draw(views, true); }
    if (SHOW_FPS && now - fT > 500) { $('.tw-fps').textContent = fN ? 'FPS ' + Math.round(fN * 1000 / (now - fT)) + ' · CPU ' + (fMs / fN).toFixed(1) + 'ms' : '멈춤 · 다시 그리지 않음' + (HQ && hqWant ? ' · 고화질' : ''); fN = 0; fMs = 0; fT = now; }
  }
  const ro = new ResizeObserver(size); ro.observe(root);

  // ---------- 시작 ----------
  labelsHTML(); timeText(); size(); treeLOD(); $('.tw-livebox').innerHTML = liveHTML();
  placeSun(true);
  planFor(sel); alt = o.alt && ALT[o.alt] && SETS[sel.id] ? o.alt : 'C';
  if (REVIEW) { picked = o.alt && ALT[o.alt] && SETS[sel.id] ? o.alt : null; split = !!picked; root.classList.toggle('tw-picked', !!picked); }
  showPlan(); lowHTML();
  if (hqWant) ensureHQ();
  if (/[?&]debug3d\b/.test(location.search)) window.__tw = { THREE, renderer, scene, camera, camL, get views() { return views; }, get trees() { return TMESH.map(p => p.map(m => m.count).join('/')).join(' '); }, get plan() { return plans[sel.id]; }, evalNow: () => plans[sel.id] && evalNow(plans[sel.id]), plans, SETS, setScn, abOf: id => { const h = hubOf(id); if (!h) return null; planFor(h); const st = SETS[id]; return st ? { name: h.name, type: h.type, A: measOf(st.A), B: measOf(st.B), gA: gainOf(st.A), gB: gainOf(st.B), s0: st.A.d14.heat.b.s, r0: st.A.d14.crowd.b.ratio, shiftA: !!st.A.shift } : null; }, hubIds: () => hubs.map(h => h.id), setAlt: k => { alt = k; showPlan(); lowHTML(); }, recAlt: () => recAlt(SETS[sel.id]), costOf: k => costOf(SETS[sel.id][k]), treeInfo: () => treeInfo(sel), report: () => reportData() };
  root.querySelector('.tw-load').remove(); root.classList.add('in'); raf = requestAnimationFrame(frame);
  flyTo(planView(sel), 1.6, () => { root.classList.add('ready'); o.onReady && o.onReady(); layoutBlocks(); dirty = true; idle(); });
  function idle() { const h = lowList().find(x => !(x.id in SETS)); if (!h || !alive) return; setTimeout(() => { if (!alive) return; planFor(h); lowHTML(); idle(); }, 60); }

  let leaving = false;
  function exit() {
    if (leaving) return; leaving = true; root.classList.remove('ready'); o.onLeave && o.onLeave();
    flyTo(above(sel), 1.4, () => { root.classList.add('out'); setTimeout(dispose, 400); });
  }
  function dispose() {
    alive = false; cancelAnimationFrame(raf);
    removeEventListener('keydown', onKey); ro.disconnect(); controls.dispose(); clearItems();
    if (HQ) Object.values(HQ).forEach(c => { c.passes.forEach(p => p.dispose && p.dispose()); c.dispose(); });
    if (envRT) envRT.dispose(); pmrem.dispose(); envSky.geometry.dispose(); envSky.material.dispose();
    scene.traverse(m => { if (m.geometry && !disp.includes(m.geometry)) m.geometry.dispose(); });
    disp.forEach(d => d.dispose && d.dispose()); renderer.dispose(); renderer.forceContextLoss && renderer.forceContextLoss(); root.remove();
    o.onExit && o.onExit();
  }
  return { exit };
}
