"""검증에 쓸 조문 원문을 law.go.kr DRF API 로 받아 law_raw/ 에 저장한다.

    PowerShell:  $env:LAW_OC = "발급받은OC"; python fetch_articles.py
응답 원본(JSON)은 law_raw/ 에, 평문으로 펼친 조문은 law_raw/articles.json 에 저장된다.
"""
import json
import os
import sys
from datetime import date
from urllib.parse import urlencode
from urllib.request import urlopen

BASE = "https://www.law.go.kr/DRF"
OC = os.environ.get("LAW_OC") or sys.exit("LAW_OC 환경변수를 설정하세요.")

# (문서명, target, MST, [JO...])  — MST 는 lawSearch 로 확정한 값
LAW = ("국토의 계획 및 이용에 관한 법률", "law", "284013")
DECREE = ("국토의 계획 및 이용에 관한 법률 시행령", "law", "288857")
DECREE_OLD = ("국토의 계획 및 이용에 관한 법률 시행령", "law", "289497")  # 2026-09-08 시행본
BUILDING_ACT = ("건축법", "law", "273437")
# 자치법규는 JO 지정 대신 전문을 받아 필요한 조를 고른다
ORDINANCES = [
    ("서울특별시 도시계획 조례", "2149501", ["000200", "004400", "004700", "004800", "005100"]),
    ("서울특별시 건축 조례", "2116749", ["001900"]),
    ("천안시 도시계획 조례", "1932763", ["005600", "006100"]),
    ("아산시 도시계획 조례", "2162613", ["005100", "005600"]),
    ("서울특별시 도시계획 조례 시행규칙", "1976247", ["001900"]),
]

REQUESTS = [
    (LAW, ["000200", "001000", "001200", "001600", "001800", "002300", "002400",
           "002900", "003100", "003400", "003600", "003700", "003800", "003802",
           "003900", "004000", "004003", "004004", "005000", "005100", "005200",
           "005300", "007600", "007700", "007800"]),
    (BUILDING_ACT, ["001900"]),
    (DECREE, ["003000", "003100", "008400", "008500"]),
    (DECREE_OLD, ["003100", "008500"]),
]


def call(**params):
    url = f"{BASE}/lawService.do?{urlencode(params)}"
    with urlopen(url, timeout=60) as r:
        text = r.read().decode("utf-8")
    if "검증에 실패" in text:
        sys.exit("사용자 정보 검증 실패 — 마이페이지에서 IP 등록을 확인하세요.")
    return text


def as_list(x):
    return [x] if isinstance(x, dict) else (x or [])


def text_of(v):
    # 내용 필드가 문자열 또는 (중첩) 리스트로 오는 경우가 있음
    if isinstance(v, list):
        return "\n".join(text_of(x) for x in v)
    return str(v or "").strip()


def flatten_article(a):
    lines = [text_of(a.get("조문내용"))]
    for h in as_list(a.get("항")):
        lines.append(text_of(h.get("항내용")))
        for ho in as_list(h.get("호")):
            lines.append(text_of(ho.get("호내용")))
            for mok in as_list(ho.get("목")):
                lines.append(text_of(mok.get("목내용")))
    return "\n".join(l for l in lines if l)


def main():
    os.makedirs("law_raw", exist_ok=True)
    today = date.today().isoformat()
    out = []
    for (name, target, mst), jos in REQUESTS:
        for jo in jos:
            text = call(OC=OC, target=target, type="JSON", MST=mst, JO=jo)
            with open(f"law_raw/{target}_{mst}_{jo}.json", "w", encoding="utf-8") as f:
                f.write(text)
            body = json.loads(text)["법령"]
            info = body["기본정보"]
            units = [u for u in as_list(body.get("조문", {}).get("조문단위"))
                     if u.get("조문여부") == "조문"]
            if not units:
                print(f"  [없음] {name} JO={jo}")
                continue
            a = units[0]
            out.append({
                "법령명": name, "ID": info.get("법령ID"), "MST": mst, "JO": jo,
                "조": f"제{int(jo[:4])}조" + (f"의{int(jo[4:])}" if int(jo[4:]) else ""),
                "조문제목": a.get("조문제목"),
                "시행일": info.get("시행일자"), "공포일": info.get("공포일자"),
                "조회일": today, "원문": flatten_article(a),
            })
            print(f"  {name} {out[-1]['조']}({out[-1]['조문제목']}) 시행 {out[-1]['시행일']}")

    for name, mst, jos in ORDINANCES:
        text = call(OC=OC, target="ordin", type="JSON", MST=mst)
        with open(f"law_raw/ordin_{mst}.json", "w", encoding="utf-8") as f:
            f.write(text)
        body = json.loads(text)["LawService"]
        info = body["자치법규기본정보"]
        for u in body["조문"]["조"]:
            jo = u["조문번호"][0]
            if u.get("조문여부") == "Y" and jo in jos and u.get("조제목"):
                out.append({
                    "법령명": name, "ID": info.get("자치법규ID"), "MST": mst, "JO": jo,
                    "조": f"제{int(jo[:4])}조",
                    "조문제목": u.get("조제목"), "시행일": info["시행일자"],
                    "공포일": info["공포일자"], "공포번호": info.get("공포번호"),
                    "조회일": today, "원문": text_of(u.get("조내용")),
                })
                print(f"  {name} 제{int(jo[:4])}조({u.get('조제목')}) 시행 {info['시행일자']}")

    with open("law_raw/articles.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f"저장: law_raw/articles.json ({len(out)}개 조문)")


if __name__ == "__main__":
    main()
