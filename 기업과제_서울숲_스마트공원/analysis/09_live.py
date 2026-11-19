"""서울숲 실시간 인구 모으기 — 서울시 실시간 도시데이터(citydata_ppltn)에서 「서울숲공원」(POI101)을 받아
latest.json(지금 값)으로 저장하고 history.csv(시계열)에 한 줄씩 쌓습니다. 목표 1 「실시간 탐색」 화면 위쪽 띠에 보입니다.

필요한 것: 서울 열린데이터광장 일반 인증키를 환경변수 SEOUL_KEY 에 넣기 (키는 출력하거나 파일에 남기지 않음)
  - sample 키로는 광화문·덕수궁만 조회됩니다.
실행:  python analysis/09_live.py                  → recovery-station/data/live/ 에 저장 (화면의 예비 값)
       python analysis/09_live.py --out 폴더       → 다른 폴더에 저장 (GitHub Actions가 live-data 가지에 저장할 때)

값의 뜻 (서울 실시간 도시데이터 매뉴얼)
  - 인구: KT·SKT 통신 신호를 50m 격자에 나눈 뒤 서울숲공원 영역 안을 합친 추정치. 집계 후 약 15분 뒤 제공, 5분마다 갱신.
  - 혼잡도: 이 장소의 '평소' 인구 대비 비율. 여유 ≤50% · 보통 ≤75% · 약간 붐빔 ≤100% · 붐빔 >100%.
  - 상주/비상주: 이 지역에 사는 사람(SKT 거주지 분석)과 아닌 사람의 비율.
  - 공원 전체가 한 단위라 잔디광장 같은 구역별 값은 없습니다.
"""
import argparse
import csv
import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "recovery-station" / "data" / "live"
SERVICE = "citydata_ppltn"
AREA = "서울숲공원"
KST = timezone(timedelta(hours=9))
AGES = ["0", "10", "20", "30", "40", "50", "60", "70"]
COLUMNS = ["time", "level", "min", "max", "male", "female", *[f"age{a}" for a in AGES],
           "resident", "non_resident", "fetched_at"]


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def fetch(key):
    url = f"http://openapi.seoul.go.kr:8088/{urllib.parse.quote(key)}/json/{SERVICE}/1/5/{urllib.parse.quote(AREA)}"
    with urllib.request.urlopen(url, timeout=30) as r:
        body = json.load(r)
    rows = (body.get("SeoulRtd.citydata_ppltn") or [])
    if not rows:
        # 키가 틀리거나 호출 한도를 넘으면 RESULT에 이유가 옵니다 (키는 메시지에 담기지 않음)
        res = body.get("RESULT") or body.get("result") or {}
        raise RuntimeError(f"응답에 서울숲 값이 없습니다: {res.get('RESULT.CODE') or res.get('CODE')} {res.get('RESULT.MESSAGE') or res.get('MESSAGE')}")
    return rows[0]


def tidy(r, fetched_at):
    return {
        "area": r.get("AREA_NM"), "code": r.get("AREA_CD"),
        "time": r.get("PPLTN_TIME"),
        "level": r.get("AREA_CONGEST_LVL"), "message": r.get("AREA_CONGEST_MSG"),
        "min": num(r.get("AREA_PPLTN_MIN")), "max": num(r.get("AREA_PPLTN_MAX")),
        "male": num(r.get("MALE_PPLTN_RATE")), "female": num(r.get("FEMALE_PPLTN_RATE")),
        "age": {a: num(r.get(f"PPLTN_RATE_{a}")) for a in AGES},
        "resident": num(r.get("RESNT_PPLTN_RATE")), "non_resident": num(r.get("NON_RESNT_PPLTN_RATE")),
        "replaced": r.get("REPLACE_YN") == "Y",   # Y면 통신사 값이 늦어 다른 값으로 대신 채운 것
        "forecast": [
            {"time": f.get("FCST_TIME"), "level": f.get("FCST_CONGEST_LVL"),
             "min": num(f.get("FCST_PPLTN_MIN")), "max": num(f.get("FCST_PPLTN_MAX"))}
            for f in (r.get("FCST_PPLTN") or [])
        ] if r.get("FCST_YN") == "Y" else [],
        "fetched_at": fetched_at,
        "source": "서울시 실시간 도시데이터 (서울 열린데이터광장 citydata_ppltn)",
    }


def append_history(path, d):
    """같은 시각(PPLTN_TIME) 값이 이미 있으면 쌓지 않습니다."""
    seen = set()
    if path.exists():
        with path.open(encoding="utf-8", newline="") as f:
            seen = {row["time"] for row in csv.DictReader(f)}
    if d["time"] in seen:
        return False
    new = not path.exists()
    with path.open("a", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        if new:
            w.writerow(COLUMNS)
        w.writerow([d["time"], d["level"], d["min"], d["max"], d["male"], d["female"],
                    *[d["age"][a] for a in AGES], d["resident"], d["non_resident"], d["fetched_at"]])
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=OUT_DIR)
    args = ap.parse_args()
    key = os.environ.get("SEOUL_KEY", "").strip()
    if not key or key == "sample":
        sys.exit("환경변수 SEOUL_KEY(서울 열린데이터광장 일반 인증키)가 필요합니다.")

    fetched_at = datetime.now(KST).strftime("%Y-%m-%d %H:%M")
    d = tidy(fetch(key), fetched_at)
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "latest.json").write_text(json.dumps(d, ensure_ascii=False, indent=1), encoding="utf-8")
    added = append_history(args.out / "history.csv", d)
    print(f"{d['area']} {d['time']} {d['level']} {d['min']:.0f}~{d['max']:.0f}명 "
          f"비상주 {d['non_resident']}% · 예측 {len(d['forecast'])}시간 · 기록 {'추가' if added else '같은 시각 있음'}")


if __name__ == "__main__":
    main()
