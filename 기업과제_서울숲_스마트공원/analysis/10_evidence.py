"""근거 보강 자료: ① 대기 지표 검증(에어코리아 도로변·도시대기 실측) ② 혼잡 지표 근거(지하철 시간대별 하차)
입력: .env의 AIRKOREA_SERVICE_KEY(없으면 ① 건너뜀), output/vuln.json, data/raw/osm/osm.json(역 좌표)
출력: output/evidence.json  ※ 인증키는 결과에 남기지 않는다. 원자료는 data/raw/evidence/(깃허브 제외)
사용: python -I analysis/10_evidence.py <프로젝트 폴더>

① 에어코리아 「대기오염정보」 측정소별 실시간 측정정보(ver 1.5, 최근 3개월)
   강변북로(도로변대기) vs 성동구(도시대기). 두 곳 모두 Flag가 없고 값이 있는 시간만 짝지어 비교한다.
   도로변/도시대기 비율은 쾌적 시간의 '도로변 미세먼지 가산(기본 20%)' 가정과 대기 지표(도로 거리감쇠)의 근거로 쓴다.
② 서울 열린데이터광장 OA-12252 「지하철 호선별 역별 시간대별 승하차 인원」(CardSubwayTime, 월 합계)
   서울숲역(분당선)·뚝섬역(2호선) 최근 12개월. 낮 시간(10~18시) 하차를 여가 방문 대리값으로 보고,
   역별 하차를 출입구에 거리감쇠(300m)로 나눈 '출입구 유입 가중치(검토안)'를 만든다. 혼잡 지표에는 아직 적용하지 않았다."""
import json, sys, math, time, urllib.parse, urllib.request
from datetime import date
from pathlib import Path
sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(sys.argv[1]); OUT = ROOT/"output"; RAW = ROOT/"data/raw/evidence"; RAW.mkdir(parents=True, exist_ok=True)
V = json.loads((OUT/"vuln.json").read_text(encoding="utf8"))

def env(k):
    f = ROOT/".env"
    if not f.exists(): return None
    for line in f.read_text(encoding="utf8").splitlines():
        if line.startswith(k+"="): return line.split("=", 1)[1].strip() or None

def get(url, tries=3):
    for i in range(tries):
        try: return json.loads(urllib.request.urlopen(url, timeout=40).read().decode("utf-8"))
        except Exception as e:
            if i == tries-1: raise
            time.sleep(2)

# ---------- ① 에어코리아 ----------
AK_ST = [("강변북로", "도로변대기", "111143"), ("성동구", "도시대기", "111142")]
POL = [("pm10", "PM10", "㎍/㎥"), ("pm25", "PM2.5", "㎍/㎥"), ("no2", "NO₂", "ppm")]
def num(v):
    try: return float(v)
    except (TypeError, ValueError): return None

air = None
key = env("AIRKOREA_SERVICE_KEY")
if key:
    rows = {}
    for st, kind, code in AK_ST:
        q = urllib.parse.urlencode(dict(stationName=st, dataTerm="3MONTH", pageNo=1, numOfRows=2500, returnType="json", ver="1.5"))
        d = get(f"http://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty?serviceKey={key}&{q}")
        it = d["response"]["body"]["items"]
        (RAW/f"airkorea_{code}.json").write_text(json.dumps(it, ensure_ascii=False), encoding="utf8")
        rows[st] = {r["dataTime"]: r for r in it}
        print(st, len(it), "시간")
    road, urb = rows["강변북로"], rows["성동구"]
    times = sorted(set(road) & set(urb))
    res = dict(stations=[dict(name=s, kind=k, code=c) for s, k, c in AK_ST], period=[times[0], times[-1]] if times else None, pol={})
    for p, lab, unit in POL:
        pr = []
        for t in times:
            a, b = road[t], urb[t]
            va, vb = num(a.get(p+"Value")), num(b.get(p+"Value"))
            if va is None or vb is None or a.get(p+"Flag") or b.get(p+"Flag"): continue
            pr.append((t, va, vb))
        if not pr: continue
        ma, mb = sum(x[1] for x in pr)/len(pr), sum(x[2] for x in pr)/len(pr)
        hr = {}
        for t, va, vb in pr:
            h = int(t[11:13]) % 24                 # '24:00'은 0시로
            hr.setdefault(h, []).append((va, vb))
        hourly = [[h, round(sum(x[0] for x in hr[h])/len(hr[h]), 4), round(sum(x[1] for x in hr[h])/len(hr[h]), 4)] if h in hr else [h, None, None] for h in range(24)]
        higher = sum(1 for x in pr if x[1] > x[2])/len(pr)
        res["pol"][p] = dict(label=lab, unit=unit, n=len(pr), road=round(ma, 4), urban=round(mb, 4), ratio=round(ma/mb, 3) if mb else None, higher=round(higher, 3), hourly=hourly)
        print(lab, len(pr), "쌍", round(ma, 3), round(mb, 3), "비율", round(ma/mb, 2) if mb else "-")
    res["n_hours"] = len(times)
    res["fetched"] = date.today().isoformat()
    air = res
else:
    print("AIRKOREA_SERVICE_KEY 없음: ① 건너뜀")

# ---------- ② 지하철 하차 ----------
SW_ST = [("분당선", "서울숲", "수인분당선 서울숲역", "K211"), ("2호선", "뚝섬", "2호선 뚝섬역", "210")]
SKEY = env("SEOUL_OPENAPI_KEY") or "sample"            # 역·월 하나씩 조회하면 1행이라 공개 샘플 키로 충분
def months(n):
    y, m = date.today().year, date.today().month
    out = []
    for _ in range(n+1):
        m -= 1
        if m == 0: y, m = y-1, 12
        out.append(f"{y}{m:02d}")
    return out
osm = json.loads((ROOT/"data/raw/osm/osm.json").read_text(encoding="utf8"))
st_ll = {e["tags"].get("ref"): (e["lat"], e["lon"]) for e in osm.get("elements", []) if e.get("tags", {}).get("railway") == "station" and e.get("lat")}
from pyproj import Transformer
TR = Transformer.from_crs(4326, 5186, always_xy=True)
sub = dict(stations=[], months=[])
for line, name, label, ref in SW_ST:
    mon = {}
    for ym in months(13):
        u = f"http://openapi.seoul.go.kr:8088/{SKEY}/json/CardSubwayTime/1/5/{ym}/{urllib.parse.quote(line)}/{urllib.parse.quote(name)}/"
        d = get(u); c = d.get("CardSubwayTime", d)
        if c.get("RESULT", {}).get("CODE") != "INFO-000" or not c.get("row"): continue
        r = c["row"][0]
        mon[ym] = dict(on=[r[f"HR_{h}_GET_ON_NOPE"] for h in range(24)], off=[r[f"HR_{h}_GET_OFF_NOPE"] for h in range(24)])
        if len(mon) == 12: break
    (RAW/f"subway_{ref}.json").write_text(json.dumps(mon, ensure_ascii=False), encoding="utf8")
    ks = sorted(mon)
    lat, lon = st_ll.get(ref, (None, None))
    x, y = TR.transform(lon, lat) if lat else (None, None)
    off_m = [sum(mon[k]["off"]) for k in ks]
    day_m = [sum(mon[k]["off"][10:19]) for k in ks]      # 10~18시 하차
    prof = [sum(mon[k]["off"][h] for k in ks) for h in range(24)]; tp = sum(prof)
    sub["stations"].append(dict(name=label, ref=ref, x=round(x) if x else None, y=round(y) if y else None,
        months=ks, off=off_m, day=day_m, off_year=sum(off_m), day_year=sum(day_m),
        prof=[round(v/tp*100, 2) for v in prof], peak=max(range(24), key=lambda h: prof[h])))
    sub["months"] = sorted(set(sub["months"]) | set(ks))
    print(label, len(ks), "개월", sum(off_m), "명 하차 (10~18시", sum(day_m), ")")

# 출입구 유입 가중치(검토안): 역의 낮 시간 하차를 300m 거리감쇠로 출입구에 배분, 역에서 800m 넘는 출입구는 제외
ENT = V["geo"]["entr"]; DEC, CUT = 300.0, 800.0
alloc = [0.0]*len(ENT)
for s in sub["stations"]:
    if s["x"] is None: continue
    w = [math.exp(-math.dist(p, (s["x"], s["y"]))/DEC) if math.dist(p, (s["x"], s["y"])) <= CUT else 0 for p in ENT]
    tw = sum(w)
    if tw == 0: continue
    s["near_d"] = round(min(math.dist(p, (s["x"], s["y"])) for p in ENT))
    for i, wi in enumerate(w): alloc[i] += s["day_year"]/365*wi/tw
tot = sum(alloc)
sub["entr"] = [dict(i=i, x=p[0], y=p[1], daily=round(a), share=round(a/tot*100, 1) if tot else 0) for i, (p, a) in enumerate(zip(ENT, alloc))]
sub["decay"], sub["cut"] = DEC, CUT
sub["fetched"] = date.today().isoformat()

out = OUT/"evidence.json"
out.write_text(json.dumps(dict(air=air, subway=sub), ensure_ascii=False), encoding="utf8")
print(out, round(out.stat().st_size/1024), "KB")
