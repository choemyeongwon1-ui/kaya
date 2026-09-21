# -*- coding: utf-8 -*-
"""3 대상지(서울 종로구) 조례 건폐율.용적률 21종 표를 국가법령정보 OPEN API 에서 직접 만들어 CSV 로 저장한다.

  py build_조례표.py

법 제77.78조(범위) -> 시행령 제84.85조(21종 범위) -> 서울특별시 도시계획 조례 제44.48조(적용값)
세 층을 같은 행에 놓는다. 서울시는 도시지역 16종만 정하므로 17~21행은 조례 칸이 비며,
빈칸은 '조례 미규정 - 관할구역 내 미지정'으로 사유를 적는다(임의 값 금지).
"""
import csv, json, re, urllib.request, datetime

OC   = "test"        # 법제처 공개 데모 키
ACT  = "284013"      # 국토계획법             시행 2026-07-01
DEC  = "288857"      # 같은 법 시행령          시행 2026-09-18
ORD  = "2149501"     # 서울특별시 도시계획 조례  시행 2026-07-13
QDATE = datetime.date.today().isoformat()

def fetch(target, mst):
    url = ("https://www.law.go.kr/DRF/lawService.do?OC=" + OC +
           "&target=" + target + "&MST=" + mst + "&type=JSON")
    with urllib.request.urlopen(url, timeout=60) as r:
        return json.load(r)

def arts(doc):
    root = doc.get("법령") or doc["LawService"]
    jo = root["조문"]
    return root, (jo.get("조문단위") or jo.get("조"))

def num_of(a):
    n = a.get("조문번호")
    n = n[0] if isinstance(n, list) else n
    n = str(n)
    return str(int(n[:4])) if (n.isdigit() and len(n) == 6) else n

def find_law(items, no):
    for a in items:
        if num_of(a) == str(no) and not a.get("조문가지번호") and a.get("항"):
            return a
    raise SystemExit("법령 제%s조를 찾지 못함" % no)

def find_ordin(items, no, title):
    for a in items:
        if num_of(a) == str(no) and title in (a.get("조제목") or ""):
            return a
    raise SystemExit("조례 제%s조(%s)를 찾지 못함" % (no, title))

def law_items(art):
    """시행령 제84/85조 제1항의 호를 {번호: (지역명, 값)} 으로."""
    out = {}
    for hang in (art.get("항") or []):
        for ho in (hang.get("호") or []):
            t = " ".join((ho.get("호내용") or "").split())
            m = re.match(r"(\d{1,2})\.\s*(.+?)\s*[:：]\s*(.+)$", t)
            if m:
                out[int(m.group(1))] = (m.group(2).strip(), m.group(3).strip())
        if out:
            break
    return out

def ordin_items(art, names):
    """조례 제44/48조 본문 한 덩어리에서 {번호: 값} 을. 지역명 위치로 잘라 읽는다."""
    text = " ".join((art.get("조내용") or "").split())
    marks = []
    for i, nm in enumerate(names, 1):
        m = re.search(re.escape(str(i) + ". " + nm) + r"\s*[:：]\s*", text)
        if m:
            marks.append((i, m.end()))
    out = {}
    for k, (i, start) in enumerate(marks):
        end = marks[k + 1][1] - len(str(marks[k + 1][0]) + ". " + names[marks[k + 1][0] - 1]) - 1 if k + 1 < len(marks) else len(text)
        # 다음 호의 번호가 꼬리에 붙어 오므로 끝의 숫자.마침표.공백을 떼어낸다
        out[i] = re.sub(r"[\s.]*\d*$", "", text[start:end]).strip()
    return out

act_root, act_a = arts(fetch("law", ACT))
dec_root, dec_a = arts(fetch("law", DEC))
ord_root, ord_a = arts(fetch("ordin", ORD))

d84 = law_items(find_law(dec_a, 84))
d85 = law_items(find_law(dec_a, 85))
names = [d84[i][0] for i in range(1, 22)]
s44 = ordin_items(find_ordin(ord_a, 44, "건폐율"), names)
s48 = ordin_items(find_ordin(ord_a, 48, "용적률"), names)

# 법 제77.78조는 대분류 9갈래이므로 21종에 대응시킨다.
big_of = (["주거지역"] * 6 + ["상업지역"] * 4 + ["공업지역"] * 3 + ["녹지지역"] * 3 +
          ["보전관리지역", "생산관리지역", "계획관리지역", "농림지역", "자연환경보전지역"])
mok_of = (["제1호가목"] * 6 + ["제1호나목"] * 4 + ["제1호다목"] * 3 + ["제1호라목"] * 3 +
          ["제2호가목", "제2호나목", "제2호다목", "제3호", "제4호"])

def law_caps(art):
    out = {}
    for hang in (art.get("항") or []):
        for ho in (hang.get("호") or []):
            head = " ".join((ho.get("호내용") or "").split())
            m0 = re.match(r"(\d{1,2})\.\s*(.+?)\s*[:：]\s*(.+)$", head)
            if m0:
                out[m0.group(2).strip()] = m0.group(3).strip()
            for mok in (ho.get("목") or []):
                mc = mok.get("목내용")
                mc = " ".join(mc) if isinstance(mc, list) else mc
                mc = " ".join((mc or "").split())
                m = re.match(r"[가-힣]\.\s*(.+?)\s*[:：]\s*(.+)$", mc)
                if m:
                    out[m.group(1).strip()] = m.group(2).strip()
        if out:
            break
    return out

c77, c78 = law_caps(find_law(act_a, 77)), law_caps(find_law(act_a, 78))

미규정 = "조례 미규정 - 서울특별시 관할구역 내 미지정"
header = ["번호", "용도지역(21종)", "법 제77.78조 대분류", "법 제77조제1항 건폐율 상한", "법 제78조제1항 용적률 상한",
          "시행령 제84조제1항 건폐율 범위", "시행령 제85조제1항 용적률 범위",
          "서울시 조례 제44조 건폐율", "서울시 조례 제48조 용적률", "서울도심 단서",
          "조례 시행일", "조회일", "비고"]
rows = []
for i in range(1, 22):
    name, big, mok = names[i - 1], big_of[i - 1], mok_of[i - 1]
    b = s44.get(i, 미규정)
    f = s48.get(i, 미규정)
    dosim = ""
    m = re.search(r"\(단,\s*서울도심\s*[:：]\s*([^)]+)\)", f)
    if m:
        dosim = m.group(1).strip()
        f = f[:m.start()].strip()
    rows.append([i, name, big + "(" + mok + ")", c77.get(big, ""), c78.get(big, ""),
                 d84[i][1], d85[i][1], b, f, dosim,
                 "2026-07-13" if i <= 16 else "-", QDATE,
                 "" if i <= 16 else "서울시는 도시지역 16종만 규정 - 임의 값을 넣지 않음"])

with open("조례_건폐율용적률_21종표_원본.csv", "w", encoding="utf-8-sig", newline="") as fp:
    w = csv.writer(fp); w.writerow(header); w.writerows(rows)

print("조회일", QDATE)
print("법령   MST", ACT, "공포번호", act_root["기본정보"]["공포번호"], "시행", act_root["기본정보"]["시행일자"])
print("시행령 MST", DEC, "시행", dec_root["기본정보"]["시행일자"])
print("조례   MST", ORD, "시행", ord_root["자치법규기본정보"]["시행일자"])
print("행 수", len(rows), "/ 조례값이 채워진 행", sum(1 for r in rows if r[7] != 미규정))
for r in rows:
    print(r[0], r[1], "|법", r[3], r[4], "|영", r[5], r[6], "|조례", r[7], r[8], r[9])
