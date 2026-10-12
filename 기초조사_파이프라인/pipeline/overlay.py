# -*- coding: utf-8 -*-
"""지표 ③ × ⑥ 중첩 — 용도지역별 경사·향 적합 비율 (6주차 38쪽 "현행 지정·지형 적합의 불일치 확인").

meteo 가 계산한 경사·향 표본점과 vworld 가 받은 용도지역 폴리곤을 같은 실행 안에서 메모리로만 겹친다.
표본점 좌표는 파일에 남기지 않는다(지오코더 좌표에서 만든 격자일 수 있음).
"""
from .common import row, _inside

CELLS = []       # meteo.collect 가 채움: [(lat, lon, 경사 %, 향 ° 또는 None)]
ZONES = []       # vworld.collect 가 채움: [(용도지역 이름, rings)]
SRC = "③ 브이월드 LT_C_UQ111~114 × ⑥ Copernicus GLO-90 경사·향"
CMD = "py run.py --only meteo vworld   (두 수집기를 같은 실행에서)"


def reset():
    CELLS.clear()
    ZONES.clear()


def _zone_of(la, lo):
    for name, rings in ZONES:
        las = [p[0] for r in rings for p in r]
        los = [p[1] for r in rings for p in r]
        if min(las) <= la <= max(las) and min(los) <= lo <= max(los) and sum(_inside(la, lo, r) for r in rings) % 2:
            return name
    return "미지정/미조회"


def rows(r, slope=15, south=(135, 225)):
    """용도지역마다 표본점 수 · 경사 ≤ slope% · 남향 동시 충족 비율. 두 수집기가 모두 돌았을 때만 행을 낸다."""
    if not CELLS or not ZONES:
        return []
    by = {}
    for la, lo, p, q in CELLS:
        z = _zone_of(la, lo)
        n, ok_s, ok_b = by.get(z, (0, 0, 0))
        s = p <= slope
        b = s and q is not None and south[0] <= q <= south[1]
        by[z] = (n + 1, ok_s + s, ok_b + b)
    total = len(CELLS)
    out = []
    for z, (n, ok_s, ok_b) in sorted(by.items(), key=lambda x: -x[1][0]):
        out.append(row("자연환경", "경사도", "③×⑥ %s — 경사 ≤%d%% · 남향 동시 충족" % (z, slope), round(100 * ok_b / n, 1), "%", SRC, CMD,
                       비고="표본 %d점(원 안 표본의 %.0f%%) · 경사만 충족 %.0f%% · 표본 간격 100 m 라 점이 적은 지역은 참고값 · "
                            "구성비가 큰데 적합 비율이 낮으면 현행 지정과 지형이 어긋남" % (n, 100 * n / total, 100 * ok_s / n)))
    return out
