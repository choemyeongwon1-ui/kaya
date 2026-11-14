"""팀 컨셉 산출: ① 쾌적 시간(격자별 연간 머물기 좋은 시간) ② 만족도 격차 지도용 설문 구역
입력: output/vuln.json, data/raw/climate/{era,aq,sw}.json → output/concept.json, seoulforest_comfort_grid.csv/.gpkg
사용: python -I analysis/05_concept.py <프로젝트 폴더>

쾌적 시간 정의(06~21시): 모듈 1의 다섯 기준이 모두 '정상'이고 춥지 않은 시간.
  비(시간당 1mm 이상) → 추위(기온 0℃ 미만) → 미세먼지(PM2.5 36·PM10 81 이상) → 더위(체감 31℃ 이상) 순으로 걸러내고,
  남은 시간은 격자의 햇볕 노출 e(=1-그늘 비율)와 도로 노출 a(=대기 지표/100)에 따라 판정한다.
    체감 + S·일사·e < 31,  자외선·e < 6,  PM·(1 + A·a) < 기준
  S(햇볕 아래 체감 가산, 기본 3℃)와 A(도로변 PM 가산, 기본 20%)는 가정이며 대시보드에서 바꿔 볼 수 있다."""
import json, sys, math
sys.stdout.reconfigure(encoding="utf-8")
from pathlib import Path
import numpy as np, pandas as pd

ROOT = Path(sys.argv[1]); RAW = ROOT/"data/raw/climate"; OUT = ROOT/"output"
S_DEF, A_DEF, S_MAX, A_MAX = 3.0, 0.20, 6.0, 0.40      # 기본 가정과 슬라이더 상한
COLD, T_HEAT, T_UV, T_PM25, T_PM10, T_RAIN = 0.0, 31.0, 6.0, 36.0, 81.0, 1.0
H0, H1 = 6, 21; SUMMER = (6, 7, 8, 9); DAY = (10, 17)   # 여름 낮: 6~9월 10~17시
SW_FULL = 800.0                                          # 일사 800W/㎡ 이상이면 햇볕 계수 1

# ---------- 일사 자료(없으면 내려받기) ----------
if not (RAW/"sw.json").exists():
    import requests
    r = requests.get("https://archive-api.open-meteo.com/v1/archive", params=dict(latitude=37.5444, longitude=127.0374, start_date="2024-05-01",
        end_date="2026-10-31", hourly="shortwave_radiation", timezone="Asia/Seoul"), timeout=120)
    r.raise_for_status(); (RAW/"sw.json").write_bytes(r.content)

def kma_feels(ta, rh):
    tw = ta*np.arctan(0.151977*np.sqrt(rh+8.313659)) + np.arctan(ta+rh) - np.arctan(rh-1.67633) + 0.00391838*rh**1.5*np.arctan(0.023101*rh) - 4.686035
    return -0.2442 + 0.55399*tw + 0.45535*ta - 0.0022*tw**2 + 0.00278*tw*ta + 3.0
def load(n):
    f = pd.DataFrame(json.load(open(RAW/n, encoding="utf8"))["hourly"]); f["time"] = pd.to_datetime(f.time); return f.set_index("time")

D = load("era.json").join(load("aq.json"), how="inner").join(load("sw.json"), how="inner")
n0 = len(D); D = D.dropna(subset=["temperature_2m", "relative_humidity_2m", "pm2_5", "pm10", "uv_index", "shortwave_radiation", "precipitation"]); n0 -= len(D)
D = D[(D.index.hour >= H0) & (D.index.hour <= H1)].copy()
summer = D.index.month.isin([5, 6, 7, 8, 9])
D["feels"] = np.where(summer, kma_feels(D.temperature_2m, D.relative_humidity_2m), D.temperature_2m)
# 대시보드와 같은 값으로 계산하도록 저장 정밀도로 반올림
D["f"] = D.feels.round(1); D["s"] = (D.shortwave_radiation/SW_FULL).clip(0, 1).round(2); D["u"] = D.uv_index.round(1); D["p"] = D.pm2_5.round(1); D["q"] = D.pm10.round(1)
D["m"] = D.index.month; D["d"] = (D.index.month.isin(SUMMER) & (D.index.hour >= DAY[0]) & (D.index.hour <= DAY[1])).astype(int)
D["ym"] = D.index.to_period("M"); nyr = D.groupby("m").ym.nunique(); D["w"] = 1/D.m.map(nyr)
print("기간", D.index.min(), "~", D.index.max(), "| 06~21시", len(D), "시간 | 결측으로 뺀 시간", n0, "| 월별 연수", nyr.to_dict())

rain = D.precipitation >= T_RAIN
cold = ~rain & (D.temperature_2m < COLD)
pm = ~rain & ~cold & ((D.p >= T_PM25) | (D.q >= T_PM10))
heat = ~rain & ~cold & ~pm & (D.f >= T_HEAT)
rest = ~(rain | cold | pm | heat)
border = rest & ((D.f + S_MAX*D.s >= T_HEAT) | (D.u >= T_UV) | (D.p*(1+A_MAX) >= T_PM25) | (D.q*(1+A_MAX) >= T_PM10))
base = rest & ~border
def by_month(mask, day=False):
    g = D[mask & (D.d == 1)] if day else D[mask]
    return [round(float(g[g.m == m].w.sum()), 1) for m in range(1, 13)]
uni = {k: by_month(v) for k, v in dict(rain=rain, cold=cold, pm=pm, heat=heat).items()}
uniD = {k: by_month(v, True) for k, v in dict(rain=rain, cold=cold, pm=pm, heat=heat).items()}
allm = pd.Series(True, index=D.index)
win, winD, baseM, baseD = by_month(allm), by_month(allm, True), by_month(base), by_month(base, True)
B = D[border]
print("연평균(06~21시) 전체", round(sum(win)), "| 비", round(sum(uni["rain"])), "추위", round(sum(uni["cold"])), "미세먼지", round(sum(uni["pm"])), "더위", round(sum(uni["heat"])),
      "| 항상 쾌적", round(sum(baseM)), "| 격자별 판정 대상", round(float(B.w.sum())), f"({len(B)}행)")
print("여름 낮 전체", round(sum(winD)), "| 비", round(sum(uniD["rain"])), "미세먼지", round(sum(uniD["pm"])), "더위", round(sum(uniD["heat"])), "| 항상 쾌적", round(sum(baseD)), "| 판정 대상", round(float(B[B.d == 1].w.sum())))

# ---------- 격자 ----------
V = json.load(open(OUT/"vuln.json", encoding="utf8")); X = {k: np.array(v) for k, v in V["cells"].items()}; N = len(X["x"])
tree = X["tree"].clip(0, 1); a = X["air"]/100
shade2 = np.where(X["c_shade"] == 1, np.minimum(1, tree+.35), np.where((X["c_plant"] == 1) | (X["c_buffer"] == 1), np.maximum(tree, .70), tree))  # 02_vulnerability.py 시나리오와 같은 가정
f, s, u, p, q, w, dd = (B[c].values for c in "f s u p q w d".split())
def comfort(shade, S=S_DEF, A=A_DEF):
    e = (1-shade)[:, None]; k = 1 + A*a[:, None]
    ok = (f[None]+S*s[None]*e < T_HEAT) & (u[None]*e < T_UV) & (p[None]*k < T_PM25) & (q[None]*k < T_PM10)
    return sum(baseM) + (ok*w[None]).sum(1), sum(baseD) + (ok*(w*dd)[None]).sum(1)
yr, sm = comfort(tree); yr2, sm2 = comfort(shade2)
print("쾌적 시간(연) 평균", round(yr.mean()), "최소", round(yr.min()), "최대", round(yr.max()), "| 여름 낮 평균", round(sm.mean()), "최소", round(sm.min()), "최대", round(sm.max()), "/", round(sum(winD)))
cand = (X["c_plant"] == 1) | (X["c_shade"] == 1) | (X["c_buffer"] == 1)
print("개선 후보", int(cand.sum()), "칸 | 연 +", round(float((yr2-yr)[cand].mean())), "| 여름 낮 +", round(float((sm2-sm)[cand].mean())), "| 공원 평균 연 +", round(float((yr2-yr).mean()), 1))
for nm, (S_, A_) in dict(낮게=(1.5, .1), 높게=(5, .3)).items():
    y_, s_ = comfort(tree, S_, A_); print("  가정", nm, (S_, A_), "연 평균", round(y_.mean()), "범위", round(y_.min()), "~", round(y_.max()), "| 여름 낮", round(s_.min()), "~", round(s_.max()))

# ---------- 설문 구역 (만족도 격차 지도) ----------
poi = {n: (x, y) for x, y, n in V["geo"]["poi"]}; Z = {z["rank"]: z for z in V["zones"]}
SZ = [  # id, 이름, 기준점(거점 이름 또는 좌표), 우선 개선 구역 번호(있으면 그 격자는 이 구역으로 고정)
    ("A", "가족마당·호수", ["가족마당", "서울숲호수", "서울숲 수변휴게실 커뮤니티센터"], None),
    ("B", "거울연못·방문자센터", ["거울연못", "서울숲 방문자센터", "군마상"], None),
    ("C", "숲속놀이터", ["숲속놀이터", "놀이터화장실"], None),
    ("D", "곤충식물원·나비정원", ["곤충식물원", "나비정원"], None),
    ("E", "생태숲(사슴우리)", ["사슴우리", "먼 곳에서 오는 바람"], None),
    ("F", "남동측 수변(수도박물관)", ["수도박물관"], 1),
    ("G", "공영주차장 일대", ["서울숲 공영주차장앞"], 3),
    ("H", "북측 연결로변", [], 2),
]
anch = []
for k, (zid, nm, names, pr) in enumerate(SZ, 1):
    for n_ in names: anch.append((k, poi[n_]))
    if pr: anch.append((k, (Z[pr]["cx"], Z[pr]["cy"])))
ax = np.array([c for _, c in anch]); ak = np.array([k for k, _ in anch])
xy = np.column_stack([X["x"], X["y"]])
sz = ak[((xy[:, None, :]-ax[None])**2).sum(2).argmin(1)]
for k, (*_, pr) in enumerate(SZ, 1):
    if pr: sz[X["zone"] == pr] = k
sz[X["hold"] == 1] = 0
zones = []
for k, (zid, nm, _, pr) in enumerate(SZ, 1):
    m = sz == k
    zones.append(dict(id=zid, name=nm, pr=pr, cells=int(m.sum()), cx=round(float(X["x"][m].mean())), cy=round(float(X["y"][m].mean()))))
    print(zid, nm, "칸", int(m.sum()), "| 취약도", round(float(X["score"][m].mean()), 1), {c: round(float(X[c][m].mean())) for c in ("heat", "crowd", "access", "air")},
          "| 수관", round(float(tree[m].mean())*100), "| 쾌적 연", round(float(yr[m].mean())), "여름 낮", round(float(sm[m].mean())), "→", round(float(sm2[m].mean())))
print("공원 평균 취약도", round(float(X["score"][sz > 0].mean()), 1), {c: round(float(X[c][sz > 0].mean())) for c in ("heat", "crowd", "access", "air")})

# ---------- 저장 ----------
ints = lambda v, k=1: [int(round(float(x)*k)) for x in v]
out = dict(
    comfort=dict(S=S_DEF, A=A_DEF, Smax=S_MAX, Amax=A_MAX, cold=COLD, th=dict(heat=T_HEAT, uv=T_UV, pm25=T_PM25, pm10=T_PM10, rain=T_RAIN), hours=[H0, H1], summer=list(SUMMER), day=list(DAY), sw_full=SW_FULL,
        period=[str(D.index.min())[:10], str(D.index.max())[:10]], nyr=[int(nyr.get(m, 1)) for m in range(1, 13)],
        win=win, winD=winD, uni=uni, uniD=uniD, base=baseM, baseD=baseD,
        rows=dict(m=ints(B.m), d=ints(B.d), f=ints(f, 10), s=ints(s, 100), u=ints(u, 10), p=ints(p, 10), q=ints(q, 10)),
        check=dict(mean=round(float(yr.mean()), 1), min=round(float(yr.min()), 1), max=round(float(yr.max()), 1), mean_after=round(float(yr2.mean()), 1))),
    survey=dict(zones=zones, sz=sz.tolist()))
json.dump(out, open(OUT/"concept.json", "w", encoding="utf8"), ensure_ascii=False, separators=(",", ":"))
tab = pd.DataFrame(dict(i=X["i"], j=X["j"], x=X["x"], y=X["y"], survey_zone=[SZ[k-1][0] if k else "" for k in sz], shade=tree.round(2), shade_after=shade2.round(2), road_exposure=a.round(2),
    comfort_h_year=yr.round(0), comfort_h_year_after=yr2.round(0), comfort_h_summer_day=sm.round(0), comfort_h_summer_day_after=sm2.round(0)))
tab.to_csv(OUT/"seoulforest_comfort_grid.csv", index=False, encoding="utf-8-sig")
try:
    import geopandas as gpd
    G = gpd.read_file(OUT/"seoulforest_vulnerability_grid.gpkg", layer="grid")
    assert len(G) == N and (G.x.round().values == X["x"]).all() and (G.y.round().values == X["y"]).all()
    gpd.GeoDataFrame(tab, geometry=G.geometry.values, crs=G.crs).to_file(OUT/"seoulforest_comfort_grid.gpkg", layer="comfort", driver="GPKG")
    print("gpkg 저장")
except Exception as ex:
    print("gpkg 생략:", ex)
print("concept.json", round((OUT/"concept.json").stat().st_size/1024), "KB")
