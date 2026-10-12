# -*- coding: utf-8 -*-
"""Open-Meteo — 지형(표고·경사)과 기후. 인증키 없음.

표고는 Copernicus DEM(약 90 m), 기후는 재분석값(ERA5 계열 격자)이다.
관측소 값(기상청 ASOS)이 아니므로 보고서에는 '재분석'이라고 적는다.
"""
import math
from .. import common
from ..common import row, http_json, save_raw, dist_m
from ..config import CLIMATE_YEAR

CMD = "py run.py --only meteo"


def elevations(pts):
    out = []
    for i in range(0, len(pts), 100):                          # 한 번에 100점까지
        chunk = pts[i:i + 100]
        res = http_json("https://api.open-meteo.com/v1/elevation", {
            "latitude": ",".join("%.6f" % p[0] for p in chunk),
            "longitude": ",".join("%.6f" % p[1] for p in chunk)})
        out += res["elevation"]
    return out


def collect(site, r):
    lat, lon = site["lat"], site["lon"]
    out = []
    # 지형 — 원을 덮는 격자(간격 100 m)의 표고, 이웃 격자 차이로 경사
    step = 100.0
    n = int(r // step)
    dlat = step / 111320.0
    dlon = step / (111320.0 * math.cos(math.radians(lat)))
    grid = [(lat + i * dlat, lon + j * dlon) for i in range(-n, n + 1) for j in range(-n, n + 1)]
    z = elevations(grid)
    # 지오코더 좌표에서 만든 격자는 좌표 대신 중심 기준 오프셋(m)으로 남긴다
    pts = [[i * step, j * step] for i in range(-n, n + 1) for j in range(-n, n + 1)] if common.GEO_MASKED else grid
    save_raw("elevation.json", {"grid": pts, "grid_kind": "offset_m(북,동)" if common.GEO_MASKED else "lat,lon", "z": z})
    W = 2 * n + 1
    Z = [z[k * W:(k + 1) * W] for k in range(W)]
    inside = [(i, j) for i in range(W) for j in range(W) if dist_m(lat, lon, *grid[i * W + j]) <= r]
    zs = [Z[i][j] for i, j in inside]
    # 경사(%)·향(°) — 중앙차분. i 는 북쪽, j 는 동쪽으로 증가. 향 = 경사면이 바라보는 방향(북 0° 시계방향)
    cells = []
    for i, j in inside:
        if 0 < i < W - 1 and 0 < j < W - 1:
            gx = (Z[i][j + 1] - Z[i][j - 1]) / (2 * step)
            gy = (Z[i + 1][j] - Z[i - 1][j]) / (2 * step)
            pct = 100 * math.hypot(gx, gy)
            asp = (math.degrees(math.atan2(-gx, -gy)) + 360) % 360 if pct > 0 else None
            cells.append((pct, asp))
    src = "Open-Meteo Elevation API (Copernicus DEM GLO-90)"
    note = "반경 %d m 안 %d점 · 격자 100 m" % (r, len(zs))
    # 계산 조건(6주차 33쪽 ④) — 셀 크기·구간 경계·향 기준을 값과 함께 남긴다
    cond = ("DEM 계산값(API 수집 아님) · Copernicus GLO-90(90 m 셀 = 0.81 ha)을 100 m 표본 %d점으로 판정 · "
            "경사 = 100×√(dz/dx²+dz/dy²) 중앙차분 · 향 = 북 0° 시계방향" % len(cells))
    out.append(row("자연환경", "지형", "중심 표고", Z[n][n], "m", src, CMD))
    out.append(row("자연환경", "지형", "표고 최저~최고", "%g~%g" % (min(zs), max(zs)), "m", src, CMD, 비고=note))
    out.append(row("자연환경", "지형", "평균 표고", round(sum(zs) / len(zs), 1), "m", src, CMD, 비고=note))
    if cells:
        s = [c[0] for c in cells]
        out.append(row("자연환경", "경사도", "평균 경사", round(sum(s) / len(s), 1), "%", src, CMD,
                       비고=cond + " · 90 m DEM 이라 국지 급경사가 뭉개짐 — 5 m·1 m DEM(국토지리정보원)으로 교차확인"))
        for t, tag in ((10, "하한 시나리오"), (15, "기준안"), (25, "상한 시나리오")):
            out.append(row("자연환경", "경사도", "경사 %d%% 이하 면적 비율(%s)" % (t, tag),
                           round(100 * sum(x <= t for x in s) / len(s), 1), "%", src, CMD,
                           비고="임계값은 교안 가정(교재 범위 4~25%%, 6주차 27쪽) · 구간 경계 ≤%d%% 포함 · %s" % (t, cond)))
        a = [c[1] for c in cells if c[1] is not None]
        if a:
            out.append(row("자연환경", "경사도", "남향(향 135~225°) 면적 비율", round(100 * sum(135 <= x <= 225 for x in a) / len(cells), 1),
                           "%", src, CMD, 비고="남 180° ±45° · 경계 포함 · 평지(경사 0) %d점은 향 없음으로 분모에만 · %s" % (len(cells) - len(a), cond)))
        # 지표 ⑥ 카탈로그 한 행 — 값 · 임계값 10·15·25% · DEM · 레이어 · 조회일을 한 행에 (6주차 38쪽)
        both = {t: round(100 * sum(p <= t and q is not None and 135 <= q <= 225 for p, q in cells) / len(cells), 1) for t in (10, 15, 25)}
        out.append(row("자연환경", "경사도", "지표 ⑥ 경사·향 적합면적 비율(기준안 15%)", both[15], "%", src, CMD,
                       비고="임계값 10%%: %s%% · 15%%: %s%% · 25%%: %s%% | 향 135~225° | DEM Copernicus GLO-90 90 m(국토지리정보원 90 m 대용) | "
                            "③과 겹쳐 볼 레이어: 브이월드 LT_C_UQ111(용도지역 — 중첩 계산은 아직) | 표고 조건(+50 m) 미적용" % (both[10], both[15], both[25])))
        out.append(row("자연환경", "경사도", "경사 ≤15% · 남향 동시 충족 비율", round(100 * sum(p <= 15 and q is not None and 135 <= q <= 225 for p, q in cells) / len(cells), 1),
                       "%", src, CMD, 비고="지표 ➅ 판정의 경사·향 두 조건 — 표고(기반시설 +50 m)는 기준 표고가 정해지면 추가 · " + cond))

    # 기후 — 한 해 일자료
    y = CLIMATE_YEAR
    d = http_json("https://archive-api.open-meteo.com/v1/archive", {
        "latitude": lat, "longitude": lon, "start_date": "%d-01-01" % y, "end_date": "%d-12-31" % y,
        "daily": "temperature_2m_mean,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max",
        "timezone": "Asia/Seoul"})
    save_raw("climate_%d.json" % y, d)
    dd = d["daily"]
    tm = [v for v in dd["temperature_2m_mean"] if v is not None]
    tx = [v for v in dd["temperature_2m_max"] if v is not None]
    tn = [v for v in dd["temperature_2m_min"] if v is not None]
    pr = [v for v in dd["precipitation_sum"] if v is not None]
    ws = [v for v in dd["wind_speed_10m_max"] if v is not None]
    src = "Open-Meteo Historical Weather API (재분석)" + ("" if common.GEO_MASKED else " · 격자 %.2fN %.2fE" % (d["latitude"], d["longitude"]))
    yn = "%d년" % y
    out += [
        row("자연환경", "기후", "연평균기온(%s)" % yn, round(sum(tm) / len(tm), 1), "℃", src, CMD),
        row("자연환경", "기후", "연강수량(%s)" % yn, round(sum(pr)), "mm", src, CMD),
        row("자연환경", "기후", "폭염일수 — 일최고 33℃ 이상(%s)" % yn, sum(v >= 33 for v in tx), "일", src, CMD,
            비고="재분석 격자값은 도심 관측값보다 낮게 나오는 경향"),
        row("자연환경", "기후", "열대야 근사 — 일최저 25℃ 이상(%s)" % yn, sum(v >= 25 for v in tn), "일", src, CMD,
            비고="기상청 정의(18~09시 최저)와 달라 근사값"),
        row("자연환경", "풍수해", "일강수량 80 mm 이상 일수(%s)" % yn, sum(v >= 80 for v in pr), "일", src, CMD,
            비고="호우 빈도 단서 — 재해이력은 시군 풍수해저감종합계획으로"),
        row("자연환경", "풍수해", "최대 일강수량(%s)" % yn, round(max(pr), 1), "mm", src, CMD),
        row("자연환경", "풍수해", "일최대풍속 최댓값(%s)" % yn, round(max(ws), 1), "km/h", src, CMD),
    ]
    return out
