// 거점 혼잡 추정. 기존 대시보드와 같은 시뮬레이션 식입니다(현장 계수 전 추정값).
const HOURS = Array.from({ length: 17 }, (_, i) => i + 6);            // 6~22시
const WEEKDAY = [.05, .08, .12, .16, .2, .26, .34, .32, .3, .32, .38, .46, .58, .52, .42, .3, .15];
const FRIDAY  = [.05, .08, .12, .17, .22, .3, .42, .4, .38, .42, .5, .6, .72, .66, .55, .42, .22];
const WEEKEND = [.06, .1, .18, .3, .45, .62, .86, .94, .95, .92, .8, .68, .64, .55, .42, .3, .16];

/** 요일·시각별 방문 수준 0~1 */
export function dayCurve(dow, hour) {
  if (hour < 6 || hour > 22) return .02;
  return (dow === 0 || dow === 6 ? WEEKEND : dow === 5 ? FRIDAY : WEEKDAY)[hour - 6];
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
