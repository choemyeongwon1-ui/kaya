// 거점 혼잡 추정(현장 계수 전 추정값).
// 요일·시각 곡선은 서울숲 보행 계수기 연구(조현민·권태경 2025, 한국조경학회지 53(4), 2022년 자료)가 보고한 모양에 맞췄습니다.
//  - 평일: 12시 전후와 19~20시에 몰림 / 주말: 오후 2~3시 정점, 저녁에 다시 오름 / 21시 이후 급감
//  - 토요일 14시가 한 주에서 가장 붐빔, 토요일이 일요일보다 약 14% 많음(511 vs 448명/시)
//  - 주말 평균이 평일의 약 1.6배(479 vs 298명/시)
// 논문 그래프의 값을 옮긴 것이 아니라 피크 시각과 비율만 맞춘 곡선입니다. 실시간 인구 기록이 쌓이면 실측으로 바꿉니다.
const HOURS = Array.from({ length: 17 }, (_, i) => i + 6);            // 6~22시
const WEEKDAY  = [.12, .14, .18, .22, .26, .36, .50, .43, .36, .36, .40, .48, .58, .66, .62, .36, .14];
const FRIDAY   = [.12, .14, .18, .22, .26, .36, .50, .43, .37, .38, .43, .52, .64, .72, .70, .44, .18];
const SATURDAY = [.08, .12, .20, .32, .48, .64, .80, .90, .97, .93, .80, .70, .68, .72, .66, .38, .15];
const SUNDAY   = [.08, .12, .19, .30, .44, .58, .72, .80, .86, .84, .74, .64, .60, .62, .56, .32, .13];
export const CURVE_SRC = '조현민·권태경(2025) 서울숲 보행 계수기 연구의 요일·시간 패턴';

/** 요일·시각별 방문 수준 0~1 */
export function dayCurve(dow, hour) {
  if (hour < 6 || hour > 22) return .02;
  return (dow === 6 ? SATURDAY : dow === 0 ? SUNDAY : dow === 5 ? FRIDAY : WEEKDAY)[hour - 6];
}

/** 날씨에 따른 이용 증감 (야외는 줄고 실내는 늘어남) */
function weatherFactor(type, wx = {}) {
  let k = 1;
  const heat = (wx.feels ?? 20) >= 33 ? 2 : (wx.feels ?? 20) >= 31 ? 1 : 0;
  const dust = (wx.pm25 ?? 0) >= 76 ? 2 : (wx.pm25 ?? 0) >= 36 ? 1 : 0;
  const rain = wx.heavyRain || (wx.precip ?? 0) >= 15 ? 2 : (wx.pop ?? 0) >= 60 ? 1 : 0;
  if (type === 'outdoor') k *= [1, .75, .5][heat] * [1, .8, .5][dust] * [1, .6, .25][rain];
  if (type === 'shade')   k *= [1, 1.1, .85][heat] * [1, .85, .55][dust] * [1, .6, .3][rain];
  if (type === 'indoor')  k *= [1, 1.35, 1.7][heat] * [1, 1.3, 1.6][dust] * [1, 1.4, 1.8][rain];
  return k * [1, .9, .7][Math.max(heat, dust, rain)];
}

/** 거점의 수용 대비 이용 비율과 추정 인원. 입구처럼 수용 인원이 없으면 null */
export function hubLoad(hub, dow, hour, wx) {
  if (hub.type === 'gate' || !hub.capacity) return null;
  const ratio = Math.min(1.35, dayCurve(dow, hour) * (.55 + .6 * hub.pull) * weatherFactor(hub.type, wx) * 1.15);
  return { ratio, people: Math.round(ratio * hub.capacity) };
}

export function crowdLabel(ratio) {
  return ratio >= .9 ? { key: 'very', label: '매우 혼잡', tone: 'critical' }
    : ratio >= .7 ? { key: 'busy', label: '혼잡', tone: 'serious' }
    : ratio >= .4 ? { key: 'normal', label: '보통', tone: 'warning' }
    : { key: 'free', label: '여유', tone: 'good' };
}

/** 길 혼잡을 시각에 맞춰 줄이는 배수 (가장 붐비는 주말 한낮 = 1) */
export const crowdScale = (dow, hour) => Math.max(.15, dayCurve(dow, hour) / .95);
export { HOURS as CROWD_HOURS };
