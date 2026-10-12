# -*- coding: utf-8 -*-
"""공통 — HTTP 재시도, 거리·면적 셈, 결과 행."""
import datetime, json, math, os, time, urllib.parse, urllib.request

TODAY = datetime.date.today().isoformat()
# 결과 폴더 — 대상지를 바꿔 돌릴 때 run.py --out 으로 따로 둔다(환경변수 SURVEY_OUT)
OUT = os.environ.get("SURVEY_OUT") or os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "결과")
RAW = os.path.join(OUT, "raw")
UA = {"User-Agent": "smartcity-capstone-basic-survey/1.0"}
# 대상지 좌표가 지오코더 결과일 때 True — 이용조건(결과 저장 금지)대로 파일에 그 좌표를 남기지 않는다
GEO_MASKED = False
MASK = "(지오코더 좌표 — 저장 안 함)"


def set_out(path):
    """실행 중에 결과 폴더를 바꾼다(대시보드가 대상지마다 폴더를 따로 쓴다). 각 수집기의 OUT·RAW 도 맞춘다."""
    import sys
    global OUT, RAW
    OUT, RAW = path, os.path.join(path, "raw")
    os.makedirs(RAW, exist_ok=True)
    for name, mod in list(sys.modules.items()):
        if name.startswith("pipeline.sources.") and mod is not None:
            for attr, val in (("OUT", OUT), ("RAW", RAW)):
                if hasattr(mod, attr):
                    setattr(mod, attr, val)

COLS = ["대항목", "세부항목", "지표", "값", "단위", "출처", "조회일", "재현", "상태", "비고"]
# 상태: 수집 / 조회대기(인증키 없음) / 화면열람(API 없음 — 사람이 볼 곳) / 실패


def row(대항목, 세부항목, 지표, 값="", 단위="", 출처="", 재현="", 상태="수집", 비고=""):
    return dict(zip(COLS, [대항목, 세부항목, 지표, 값, 단위, 출처, TODAY, 재현, 상태, 비고]))


def http(url, params=None, data=None, timeout=120, retries=3, wait=5):
    """GET(또는 data 가 있으면 POST). 실패하면 wait 초 쉬고 다시. 마지막 실패는 올린다."""
    if params:
        url += ("&" if "?" in url else "?") + urllib.parse.urlencode(params)
    body = urllib.parse.urlencode(data).encode() if isinstance(data, dict) else data
    last = None
    for i in range(retries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, data=body, headers=UA), timeout=timeout) as r:
                return r.read()
        except Exception as e:
            last = e
            print("    재시도 %d/%d — %s" % (i + 1, retries, e))
            time.sleep(wait)
    raise last


def http_json(url, params=None, **kw):
    return json.loads(http(url, params, **kw).decode("utf-8"))


def save_raw(name, content):
    os.makedirs(RAW, exist_ok=True)
    mode, enc = ("wb", None) if isinstance(content, bytes) else ("w", "utf-8")
    if not isinstance(content, (bytes, str)):
        content = json.dumps(content, ensure_ascii=False)
    with open(os.path.join(RAW, name), mode, encoding=enc) as f:
        f.write(content)


def dist_m(la1, lo1, la2, lo2):
    dla, dlo = math.radians(la2 - la1), math.radians(lo2 - lo1)
    a = math.sin(dla / 2) ** 2 + math.cos(math.radians(la1)) * math.cos(math.radians(la2)) * math.sin(dlo / 2) ** 2
    return 2 * 6371000.0 * math.asin(math.sqrt(a))


class Disk:
    """반경 원을 격자 표본점으로 채운다. 폴리곤 ∩ 원 면적 = 폴리곤 안 표본점 수 × 칸 면적.
    shapely 없이 경계 클리핑을 대신하는 방법이다(칸 20 m 면 오차는 수백 m² 수준)."""

    def __init__(self, lat, lon, radius_m, step_m=20):
        self.step = step_m
        dlat = step_m / 111320.0
        dlon = step_m / (111320.0 * math.cos(math.radians(lat)))
        n = int(radius_m // step_m) + 1
        self.pts = []
        for i in range(-n, n + 1):
            for j in range(-n, n + 1):
                la, lo = lat + i * dlat, lon + j * dlon
                if dist_m(lat, lon, la, lo) <= radius_m:
                    self.pts.append((la, lo))
        self.cell = step_m * step_m

    def hits(self, rings):
        """rings: [[(lat,lon),...], ...] — 짝홀 규칙이라 구멍(inner)도 같은 목록에 넣으면 빠진다."""
        if not rings:
            return set()
        las = [p[0] for r in rings for p in r]
        los = [p[1] for r in rings for p in r]
        s, n, w, e = min(las), max(las), min(los), max(los)
        out = set()
        for k, (la, lo) in enumerate(self.pts):
            if s <= la <= n and w <= lo <= e and sum(_inside(la, lo, r) for r in rings) % 2:
                out.add(k)
        return out


def _inside(la, lo, ring):
    c, j = False, len(ring) - 1
    for i in range(len(ring)):
        yi, xi = ring[i]
        yj, xj = ring[j]
        if (yi > la) != (yj > la) and lo < (xj - xi) * (la - yi) / (yj - yi) + xi:
            c = not c
        j = i
    return c


def join_rings(ways):
    """relation 의 outer/inner 조각(way)들을 끝점으로 이어 닫힌 고리로 만든다."""
    ways = [list(w) for w in ways if len(w) > 1]
    rings = []
    while ways:
        cur = ways.pop(0)
        changed = True
        while cur[0] != cur[-1] and changed:
            changed = False
            for k, w in enumerate(ways):
                if w[0] == cur[-1]:
                    cur += w[1:]
                elif w[-1] == cur[-1]:
                    cur += w[::-1][1:]
                elif w[-1] == cur[0]:
                    cur = w[:-1] + cur
                elif w[0] == cur[0]:
                    cur = w[::-1][:-1] + cur
                else:
                    continue
                ways.pop(k)
                changed = True
                break
        if len(cur) >= 4 and cur[0] == cur[-1]:
            rings.append(cur)
    return rings
