"""모듈 1: 위험 임계치 발생 통계 + 현재 시점 스냅샷 (Open-Meteo: ERA5 재분석, CAMS 대기질 모델)
체감온도는 기상청 여름철(5~9월) 산출식 사용. 사용: python -I analysis/03_climate.py <프로젝트 폴더>"""
import json, sys, datetime as dt
sys.stdout.reconfigure(encoding="utf-8")
from pathlib import Path
import numpy as np, pandas as pd

ROOT = Path(sys.argv[1]); RAW = ROOT/"data/raw/climate"; OUT = ROOT/"output"

def kma_feels(ta, rh):
    tw = ta*np.arctan(0.151977*np.sqrt(rh+8.313659)) + np.arctan(ta+rh) - np.arctan(rh-1.67633) + 0.00391838*rh**1.5*np.arctan(0.023101*rh) - 4.686035
    return -0.2442 + 0.55399*tw + 0.45535*ta - 0.0022*tw**2 + 0.00278*tw*ta + 3.0

def load(n):
    d = json.load(open(RAW/n, encoding="utf8"))["hourly"]
    f = pd.DataFrame(d); f["time"] = pd.to_datetime(f.time); return f.set_index("time")

E = load("era.json"); A = load("aq.json")
D = E.join(A, how="inner").dropna(subset=["temperature_2m", "relative_humidity_2m"])
D["feels"] = kma_feels(D.temperature_2m, D.relative_humidity_2m)
D.loc[~D.index.month.isin([5,6,7,8,9]), "feels"] = np.nan
D["rain3h"] = D.precipitation.rolling(3, min_periods=1).sum()
print("기간", D.index.min(), D.index.max(), "행", len(D), "\n결측", D[["pm2_5","pm10","uv_index"]].isna().mean().round(3).to_dict())
day = D[(D.index.hour >= 6) & (D.index.hour <= 21)].copy()
IND = {
    "feels": ("체감온도", lambda s: (s >= 31) & (s < 33), lambda s: s >= 33),
    "uv_index": ("자외선지수", lambda s: (s >= 6) & (s < 8), lambda s: s >= 8),
    "pm2_5": ("PM2.5", lambda s: (s >= 36) & (s < 76), lambda s: s >= 76),
    "pm10": ("PM10", lambda s: (s >= 81) & (s < 151), lambda s: s >= 151),
}
day["ym"] = day.index.to_period("M"); yrs = day.groupby(day.index.month).ym.nunique()
tbl = {}
for k, (lab, f1, f2) in IND.items():
    c = day.groupby(day.index.month)[k].apply(lambda s: int(f1(s.dropna()).sum()))/yrs
    w = day.groupby(day.index.month)[k].apply(lambda s: int(f2(s.dropna()).sum()))/yrs
    tbl[k] = dict(label=lab, caution=[round(float(c.get(m, 0)), 1) for m in range(1, 13)], warning=[round(float(w.get(m, 0)), 1) for m in range(1, 13)])
rc = day.groupby(day.index.month).precipitation.apply(lambda s: int((s >= 1).sum()))/yrs
rw = day.groupby(day.index.month).rain3h.apply(lambda s: int((s >= 60).sum()))/yrs
tbl["rain"] = dict(label="강수(시간당 1mm↑ / 3시간 60mm↑)", caution=[round(float(rc.get(m, 0)), 1) for m in range(1, 13)], warning=[round(float(rw.get(m, 0)), 1) for m in range(1, 13)])

# 여름 시간대별 경고·주의 비율 (6~9월 06~21시)
hot = day[day.index.month.isin([6,7,8,9])]
hours = list(range(6, 22)); months = [6,7,8,9]
mat = [[round(float((hot[(hot.index.month == m) & (hot.index.hour == h)].feels >= 33).mean()*100), 1) for h in hours] for m in months]
mat2 = [[round(float(((hot[(hot.index.month == m) & (hot.index.hour == h)].feels >= 31)).mean()*100), 1) for h in hours] for m in months]
by_year = {}
for y, g in day.groupby(day.index.year):
    s = g.feels.dropna(); by_year[int(y)] = dict(heat_warn=int((s >= 33).sum()), heat_caution=int(((s >= 31) & (s < 33)).sum()),
        pm25_bad=int((g.pm2_5.dropna() >= 36).sum()), pm10_bad=int((g.pm10.dropna() >= 81).sum()), months=int(g.index.to_period("M").nunique()))

# 현재 스냅샷
N = load("now.json"); Q = load("now_aq.json")
now = pd.Timestamp(dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)+dt.timedelta(hours=9)).floor("h")
r = N.loc[now]; q = Q.loc[now]
fut = N.loc[now:now+pd.Timedelta(hours=12)]
snap = dict(time=str(now), temp=float(r.temperature_2m), rh=float(r.relative_humidity_2m), feels_kma=round(float(kma_feels(r.temperature_2m, r.relative_humidity_2m) if now.month in (5,6,7,8,9) else r.temperature_2m), 1), summer=bool(now.month in (5,6,7,8,9)),
    uv=float(r.uv_index), pp=float(r.precipitation_probability), pm25=float(q.pm2_5), pm10=float(q.pm10))
def preset(t):
    x = D.loc[t]; return dict(time=str(t)[:16], feels=round(float(x.feels), 1) if x.feels == x.feels else round(float(x.temperature_2m), 1), uv=round(float(x.uv_index), 1), pm25=round(float(x.pm2_5)), pm10=round(float(x.pm10)), rainmm=round(float(x.precipitation), 1))
presets = dict(heat=preset(day.feels.idxmax()), dust=preset(day.pm2_5.idxmax()), pm10=preset(day.pm10.idxmax()), rain=preset(day.precipitation.idxmax()))
print(presets)
out = dict(presets=presets, months=list(range(1, 13)), table=tbl, heat_hours=hours, heat_months=months, heat_warn=mat, heat_caution=mat2, by_year=by_year, snapshot=snap,
           period=[str(D.index.min())[:10], str(D.index.max())[:10]],
           max_feels=round(float(D.feels.max()), 1), max_feels_at=str(D.feels.idxmax()), pm25_p99=round(float(D.pm2_5.quantile(.99)), 1))
json.dump(out, open(OUT/"climate.json", "w", encoding="utf8"), ensure_ascii=False, separators=(",", ":"))
print(json.dumps(by_year, ensure_ascii=False)); print(json.dumps(snap, ensure_ascii=False)); print(out["max_feels"], out["max_feels_at"], out["pm25_p99"])
for k, v in tbl.items(): print(v["label"], "주의", v["caution"], "경고", v["warning"])
for m, row in zip(months, mat): print(m, row)
