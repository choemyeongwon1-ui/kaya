// 서울숲 실시간 인구(서울시 실시간 도시데이터 · citydata_ppltn, 5분마다 갱신)
// 서울시 API는 http만 되고 CORS를 열어 두지 않아 브라우저에서 바로 부를 수 없습니다.
// 그래서 인증키를 숨긴 중계 서버(proxy/seoul-crowd)를 거쳐 받습니다. 주소는 config.js의 LIVE_CROWD_URL.
// 값은 통신사 기지국 신호로 어림한 것이라 실제 현장 인원과 다를 수 있습니다(서울 열린데이터광장 안내).
import { LIVE_CROWD_URL } from './config.js';

export const LIVE_LEVELS = { '여유': 0, '보통': 1, '약간 붐빔': 2, '붐빔': 3 };

/** 반환: {level, rank(0~3), min, max, time, msg, forecast:[{time, level, min, max}]} 또는 못 받으면 null */
export async function fetchLiveCrowd(timeoutMs = 8000) {   // 중계 서버가 쉬었다 깨면 서울시 응답까지 몇 초 걸림
  if (!LIVE_CROWD_URL) return null;
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(LIVE_CROWD_URL, { signal: ctl.signal, cache: 'no-cache' });
    if (!r.ok) return null;
    const d = await r.json();
    if (!d?.level || !(d.level in LIVE_LEVELS)) return null;
    return { ...d, rank: LIVE_LEVELS[d.level] };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** 12000 → '1.2만', 950 → '950' */
export const fmtPeople = n => (n >= 10000 ? `${(n / 10000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, '')}만` : `${Math.round(n).toLocaleString('ko-KR')}`);
