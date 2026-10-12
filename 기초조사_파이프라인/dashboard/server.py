# -*- coding: utf-8 -*-
"""기초조사 대시보드 — 주소를 넣으면 브이월드로 대상지 정보를 뽑아 6주차 38쪽 여섯 칸을 채운다.

  py dashboard/server.py            # → http://127.0.0.1:8765

인증키는 이 서버의 환경변수(VWORLD_KEY·VWORLD_DOMAIN)에만 있고 브라우저로 보내지 않는다(35·36쪽).
지오코더 좌표는 화면 표시(실시간 사용)에만 쓰고 파일에는 남기지 않는다(32·33쪽 이용조건).
대상지마다 결과를 `결과_대시보드/<시각>_<이름>/` 에 기초조사_결과.csv · raw/ 로 남긴다.
"""
import csv, datetime, json, os, re, sys, threading, traceback
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE)


def _user_env(name):
    """setx 로 넣은 값은 이미 켜져 있던 프로그램의 환경에 안 보인다 — Windows 사용자 환경변수를 직접 읽는다."""
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as k:
            return winreg.QueryValueEx(k, name)[0]
    except Exception:
        return None


for _n in ("VWORLD_KEY", "VWORLD_DOMAIN", "SGIS_KEY", "SGIS_SECRET"):
    if not os.environ.get(_n) and _user_env(_n):
        os.environ[_n] = _user_env(_n)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from pipeline import common, geocode
from pipeline.common import COLS, TODAY
from pipeline.config import SITE, KEYS
from pipeline.sources import meteo, vworld, sgis

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_ROOT = os.path.join(BASE, "결과_대시보드")
PORT = int(os.environ.get("DASHBOARD_PORT", "8765"))
LOCK = threading.Lock()                       # 수집기는 결과 폴더를 전역으로 쓰므로 한 번에 하나씩


def hide_key(s):
    k = KEYS.get("VWORLD_KEY")
    return s.replace(k, "***") if k else s


def pick(rows, **kw):
    return [r for r in rows if all(r.get(k) == v for k, v in kw.items())]


def indicators(rows):
    """38쪽 여섯 칸 — 각 칸은 상태·값 행·설명을 갖는다."""
    def card(no, title, items, state, note=""):
        return {"no": no, "title": title, "state": state, "rows": items, "note": note}

    clim = pick(rows, 세부항목="기후")
    pop = [r for r in rows if r["대항목"] == "인구"]
    zone = [r for r in pick(rows, 세부항목="용도별 면적") if r["지표"].startswith("용도지역")]
    plan_ids = tuple(vworld.PLAN_LAYERS)
    plan = [r for r in rows if any(l in r["출처"] for l in plan_ids) or r["지표"].startswith("중심 필지 고시 이력")]
    slope = pick(rows, 세부항목="경사도")
    pop_ok = any(r["상태"] == "수집" for r in pop)
    return [
        card(1, "기온·강수", clim, "확보" if clim else "실패", "재분석 격자값 — 관측소 값 아님"),
        card(2, "격자 인구밀도", pop, "확보" if pop_ok else "조회 대기",
             "" if pop_ok else "SGIS 인증키(SGIS_KEY·SGIS_SECRET) 필요 — 키가 없으면 빈칸 + 사유"),
        card(3, "용도지역 구성비", zone, "확보" if zone else "실패", "브이월드 현행 지정 · 반경 원 면적비"),
        card(4, "고시 이력", plan, "열람 병기" if plan else "없음",
             "브이월드 계획 레이어는 현행 지정만 — 결정·효력일은 토지이음 고시문으로 확인"),
        card(5, "용도별 소요면적", [], "조회 대기" if not pop_ok else "계산 필요",
             "② 인구 × 용도별 원단위(교과서·실측) — 인구가 확보되면 계산"),
        card(6, "경사·향 적합", slope, "확보" if slope else "실패",
             "임계값 10·15·25% 는 교안 가정 · DEM 90 m · 계산 조건은 각 행 비고"),
    ]


def run(addr, typ, radius, name):
    key, dom = KEYS["VWORLD_KEY"], KEYS["VWORLD_DOMAIN"]
    if not key:
        raise RuntimeError("서버 환경변수 VWORLD_KEY 가 없습니다 — setx 후 서버를 다시 켜세요")
    lat, lon, refined, shown = geocode.request(addr, typ, key, dom)
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    safe = re.sub(r"[^\w가-힣-]+", "_", name or refined or addr)[:40]
    out = os.path.join(OUT_ROOT, "%s_%s" % (stamp, safe))
    common.set_out(out)
    common.GEO_MASKED = True
    site = dict(SITE, lat=lat, lon=lon, name=name or refined or addr)
    rows = [dict(geocode.catalog_row(addr, typ, refined, shown), 수집기="geocode")]
    log = []
    for nm, mod in (("meteo", meteo), ("vworld", vworld), ("sgis", sgis)):
        if nm == "sgis" and KEYS["SGIS_KEY"]:
            # config 의 SGIS 행정코드는 기본 대상지(종로구) 것 — 다른 주소에 그대로 쓰면 틀린 값이 된다
            got = [common.row("인구", "인구밀도", "격자 인구밀도", 상태="조회대기", 출처="SGIS OpenAPI3",
                              재현="py run.py --only sgis", 비고="대시보드는 아직 주소별 SGIS 행정코드 변환이 없음")]
        else:
            try:
                got = mod.collect(site, radius)
            except Exception as e:
                got = [common.row("(%s)" % nm, "-", "수집기 전체 실패", 상태="실패", 출처=nm,
                                  재현="py run.py --only %s" % nm, 비고=hide_key("%s: %s" % (type(e).__name__, e)))]
                log.append(hide_key(traceback.format_exc()))
        for g in got:
            g["수집기"] = nm
        rows += got
    with open(os.path.join(out, "기초조사_결과.csv"), "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, COLS + ["수집기"])
        w.writeheader()
        w.writerows(rows)
    admin = [r for r in pick(rows, 세부항목="행정") if r["수집기"] == "vworld"]
    return {
        # 좌표는 응답(화면 표시)에만 — 파일에는 없다
        "site": {"addr": addr, "type": typ, "refined": refined, "name": site["name"], "lat": lat, "lon": lon, "radius": radius},
        "admin": admin, "today": TODAY, "out": os.path.relpath(out, BASE),
        "indicators": indicators(rows), "rows": rows, "log": log,
    }


class H(BaseHTTPRequestHandler):
    def send(self, code, body, ctype="application/json; charset=utf-8"):
        data = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path in ("/", "/index.html"):
            with open(os.path.join(HERE, "index.html"), "rb") as f:
                return self.send(200, f.read(), "text/html; charset=utf-8")
        if self.path == "/api/config":
            # 팀 DB(Supabase) — publishable 키는 공개용이라 브라우저로 보내도 된다(쓰기 권한은 RLS 가 막음)
            cfg = {}
            p = os.path.join(HERE, "supabase_config.json")
            if os.path.exists(p):
                with open(p, encoding="utf-8") as f:
                    cfg = json.load(f)
            return self.send(200, {"supabase_url": os.environ.get("SUPABASE_URL") or cfg.get("url", ""),
                                   "supabase_key": os.environ.get("SUPABASE_PUBLISHABLE_KEY") or cfg.get("publishable_key", "")})
        if self.path == "/api/status":
            return self.send(200, {"vworld_key": bool(KEYS["VWORLD_KEY"]), "domain": KEYS["VWORLD_DOMAIN"] or "",
                                   "sgis_key": bool(KEYS["SGIS_KEY"]), "today": TODAY})
        self.send(404, {"error": "없는 경로"})

    def do_POST(self):
        if self.path != "/api/run":
            return self.send(404, {"error": "없는 경로"})
        try:
            q = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
            addr = (q.get("addr") or "").strip()
            typ = (q.get("type") or "PARCEL").upper()
            radius = max(100, min(1000, int(q.get("radius") or 400)))
            if not addr:
                return self.send(400, {"error": "주소를 입력하세요"})
            with LOCK:
                res = run(addr, typ, radius, (q.get("name") or "").strip())
            self.send(200, res)
        except geocode.GeocodeError as e:
            self.send(422, {"error": "지오코더: " + hide_key(str(e)).split(" — ")[0] +
                            " — 주소 형식(지번이면 PARCEL, 도로명이면 ROAD)을 확인하세요"})
        except Exception as e:
            traceback.print_exc()
            self.send(500, {"error": hide_key("%s: %s" % (type(e).__name__, e))})

    def log_message(self, fmt, *args):
        sys.stdout.write("[dashboard] %s\n" % (fmt % args))


if __name__ == "__main__":
    print("기초조사 대시보드 → http://127.0.0.1:%d  (VWORLD_KEY %s)" % (PORT, "있음" if KEYS["VWORLD_KEY"] else "없음"))
    ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
