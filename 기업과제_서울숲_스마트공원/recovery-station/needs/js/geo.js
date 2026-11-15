// 좌표 계산 도구
const R = 6371008.8;
const rad = d => d * Math.PI / 180;

/** 두 [lon, lat] 사이 거리(m) */
export function haversine([lon1, lat1], [lon2, lat2]) {
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// 공원 크기에서는 평면 근사로 충분합니다 (기존 대시보드와 같은 상수)
const LAT0 = 37.544, LON0 = 127.04, KX = Math.cos(rad(LAT0)) * 111320, KY = 110540;
export const toXY = (lon, lat) => [(lon - LON0) * KX, (lat - LAT0) * KY];
export const toLonLat = (x, y) => [x / KX + LON0, y / KY + LAT0];

/** 점이 다각형(GeoJSON Polygon·MultiPolygon 좌표) 안에 있는지 */
export function inPolygon(lon, lat, geom) {
  const polys = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates];
  for (const rings of polys) {
    if (!inRing(lon, lat, rings[0])) continue;
    let hole = false;
    for (let i = 1; i < rings.length; i++) if (inRing(lon, lat, rings[i])) { hole = true; break; }
    if (!hole) return true;
  }
  return false;
}
function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** 격자 버킷으로 가까운 점을 빨리 찾는 색인. items: [{x, y, ...}] */
export class PointIndex {
  constructor(items, size = 40) {
    this.size = size; this.map = new Map(); this.items = items;
    items.forEach((it, i) => {
      const k = this.key(Math.floor(it.x / size), Math.floor(it.y / size));
      (this.map.get(k) ?? this.map.set(k, []).get(k)).push(i);
    });
  }
  key(i, j) { return i * 100003 + j; }
  /** (x, y)에서 반경 r 안의 항목 번호들 */
  within(x, y, r) {
    const out = [], s = this.size, n = Math.ceil(r / s);
    const ci = Math.floor(x / s), cj = Math.floor(y / s);
    for (let i = ci - n; i <= ci + n; i++) for (let j = cj - n; j <= cj + n; j++) {
      const b = this.map.get(this.key(i, j)); if (!b) continue;
      for (const k of b) { const it = this.items[k]; if (Math.hypot(it.x - x, it.y - y) <= r) out.push(k); }
    }
    return out;
  }
  /** 가장 가까운 항목 번호와 거리 (maxR 안에 없으면 null) */
  nearest(x, y, maxR = Infinity, filter = null) {
    let best = -1, bd = Infinity;
    const s = this.size, ci = Math.floor(x / s), cj = Math.floor(y / s);
    const maxRing = Number.isFinite(maxR) ? Math.ceil(maxR / s) + 1 : 60;
    for (let ring = 0; ring <= maxRing; ring++) {
      for (let i = ci - ring; i <= ci + ring; i++) for (let j = cj - ring; j <= cj + ring; j++) {
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== ring) continue;
        const b = this.map.get(this.key(i, j)); if (!b) continue;
        for (const k of b) {
          if (filter && !filter(k)) continue;
          const it = this.items[k], d = Math.hypot(it.x - x, it.y - y);
          if (d < bd) { bd = d; best = k; }
        }
      }
      if (best >= 0 && bd <= ring * s) break;      // 다음 고리에는 더 가까운 점이 없다
    }
    return best >= 0 && bd <= maxR ? { i: best, d: bd } : null;
  }
}

/** 해 뜨는·지는 시각(지방시, 소수 시간). 표준 근사식(Almanac for Computers) */
export function sunTimes(date, lat, lon, tz = 9) {
  const start = Date.UTC(date.getFullYear(), 0, 0);
  const N = Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - start) / 864e5);
  const sin = d => Math.sin(rad(d)), cos = d => Math.cos(rad(d)), tan = d => Math.tan(rad(d));
  const deg = r => r * 180 / Math.PI, mod = (a, n) => ((a % n) + n) % n;
  const lngHour = lon / 15;
  const calc = rise => {
    const t = N + ((rise ? 6 : 18) - lngHour) / 24;
    const M = 0.9856 * t - 3.289;
    const L = mod(M + 1.916 * sin(M) + 0.020 * sin(2 * M) + 282.634, 360);
    let RA = mod(deg(Math.atan(0.91764 * tan(L))), 360);
    RA = (RA + Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90) / 15;
    const sinDec = 0.39782 * sin(L), cosDec = Math.cos(Math.asin(sinDec));
    const cosH = (cos(90.833) - sinDec * sin(lat)) / (cosDec * cos(lat));
    if (cosH > 1 || cosH < -1) return null;
    const H = (rise ? 360 - deg(Math.acos(cosH)) : deg(Math.acos(cosH))) / 15;
    return mod(H + RA - 0.06571 * t - 6.622 - lngHour + tz, 24);
  };
  return { rise: calc(true), set: calc(false) };
}
