"""분석 결과 JSON을 템플릿에 넣어 단일 HTML 대시보드 생성. 사용: python -I analysis/04_build.py <프로젝트 폴더>"""
import sys
from pathlib import Path
R = Path(sys.argv[1])
t = (R/"analysis/dashboard_template.html").read_text(encoding="utf8")
t = t.replace("/*__VULN__*/null", (R/"output/vuln.json").read_text(encoding="utf8"))
t = t.replace("/*__CLIMATE__*/null", (R/"output/climate.json").read_text(encoding="utf8"))
t = t.replace("/*__CONCEPT__*/null", (R/"output/concept.json").read_text(encoding="utf8"))   # 05_concept.py 결과(쾌적 시간, 설문 구역)
out = R/"서울숲_진행현황_대시보드.html"
out.write_text(t, encoding="utf8"); print(out, round(out.stat().st_size/1024), "KB")
