# -*- coding: utf-8 -*-
"""Korean building-name keyword rules (high-precision only)."""
import taxonomy as T

RULES = [
    (T.RES, ["아파트", "빌라", "맨션", "연립주택", "기숙사", "사택", "주공",
             "apartment", "dormitory", "residence hall"]),
    (T.CUL, ["교회", "성당", "성결교", "장로교", "감리교", "순복음", "사찰", "암자",
             "사원", "법당", "선원", "포교원", "박물관", "미술관", "기념관", "전시관",
             "문화원", "문화관", "예술관", "극장", "영화관", "아트홀", "church",
             "cathedral", "temple", "museum", "gallery", "theater", "theatre"]),
    (T.PUB, ["초등학교", "중학교", "고등학교", "대학교", "학교", "도서관", "병원",
             "의원", "한의원", "치과", "보건소", "주민센터", "행정복지센터", "구청",
             "시청", "청사", "경찰서", "파출소", "지구대", "소방서", "안전센터",
             "우체국", "복지관", "어린이집", "유치원", "체육관", "연구원", "연구소",
             "대사관", "법원", "검찰청", "교육청", "공사", "공단",
             "school", "library", "hospital", "clinic", "embassy", "police",
             "fire station", "post office"]),
    (T.COM, ["빌딩", "타워", "상가", "프라자", "플라자", "백화점", "쇼핑", "마트",
             "시장", "호텔", "모텔", "여관", "게스트하우스", "오피스텔", "사옥",
             "본사", "은행", "증권", "보험", "약국", "주유소", "웨딩", "예식장",
             "building", "tower", "plaza", "hotel", "mall", "bank", "office"]),
    (T.IND, ["공장", "제조", "물류센터", "창고", "factory", "warehouse"]),
    (T.ETC, ["주차장", "화장실", "변전소", "펌프장", "저수조", "parking", "toilet"]),
]


def classify_name(name):
    """Return a class if the name carries an unambiguous Korean use suffix."""
    if not name:
        return None
    n = name.lower()
    for cls, kws in RULES:
        for kw in kws:
            if kw in n:
                return cls, kw
    return None
