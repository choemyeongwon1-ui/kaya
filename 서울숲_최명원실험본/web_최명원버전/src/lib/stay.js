// 「머무는 숲」 핵심 지표: 이 자리에서 지금부터 몇 시간 쾌적하게 머물 수 있나
// 시간대별 예보로 날씨 단계를 판정하고(risk.evaluate), 같은 시각의 혼잡 예측(crowd.hubLoad)을 함께 본다.
// 둘 중 하나라도 '머물기 어려움'이 되는 첫 시각에서 멈춘다. 시설 운영시간은 아직 반영하지 않음.
import { evaluate } from './risk.js';
import { hubLoad } from './crowd.js';
import { typeAllowed } from './recommend.js';

export const STAY_MAX = 4;          // 최대 4시간까지만 센다 (그 이상은 '4시간 이상')
export const CROWD_LIMIT = 0.85;    // 수용 85% 이상이면 편히 머물기 어렵다고 봄
export const LONG_STAY = 2;         // 2시간 = 주 120분(White et al. 2019)을 한 번에 채우는 길이

/** 날씨 단계가 '주의' 이상이면 야외 자리는 머물기 어려움, 경고면 그늘도(먼지·비) 어려움 */
function okAt(hub, snap, dow) {
  const ev = evaluate(snap);
  if (!typeAllowed(hub.type, ev)) return { ok: false, why: 'weather', ev };
  if (hub.type === 'outdoor' && ev.overall >= 1) return { ok: false, why: 'weather', ev };
  const ratio = hubLoad(hub, dow, snap.hour, snap)?.ratio ?? 0;
  if (ratio >= CROWD_LIMIT) return { ok: false, why: 'crowd', ev };
  return { ok: true };
}

/** { hours, until, stopWhy } — hours 는 0~STAY_MAX, until 은 머물 수 있는 마지막 시각(시) */
export function stayHours(hub, hourly, dow) {
  const ahead = hourly.filter((h) => h.offset >= 0).slice(0, STAY_MAX);
  let hours = 0;
  let stopWhy = null;
  for (const snap of ahead) {
    const r = okAt(hub, snap, dow);
    if (!r.ok) { stopWhy = r.why; break; }
    hours += 1;
  }
  const until = hours ? (ahead[0].hour + hours) % 24 : null;
  return { hours, until, stopWhy, capped: hours >= STAY_MAX };
}

export function stayLabel(s) {
  if (!s.hours) return s.stopWhy === 'crowd' ? '지금은 붐빔' : '지금은 머물기 어려움';
  return s.capped ? `${STAY_MAX}시간 이상` : `${s.hours}시간 · ${s.until}시까지`;
}
