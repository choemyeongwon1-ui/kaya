# -*- coding: utf-8 -*-
"""OSM tag -> Korean land-use class mapping (single source of truth)."""

RES, COM, PUB, CUL, IND, ETC, UNK = (
    "주거", "상업·업무", "공공·교육", "종교·문화", "공업", "기타·부속", "미분류")

ORDER = [UNK, COM, RES, PUB, CUL, IND, ETC]

# --- L1: the building=* value itself --------------------------------------
BUILDING = {
    RES: ["apartments", "residential", "house", "detached", "semidetached_house",
          "semi", "terrace", "terraced_house", "dormitory", "bungalow",
          "tower_block", "flats", "annexe", "houseboat", "static_caravan",
          "trullo", "villa"],
    COM: ["commercial", "retail", "office", "supermarket", "kiosk", "hotel",
          "shop", "mall", "department_store", "marketplace", "restaurant",
          "motel", "guest_house", "hostel", "pharmacy", "bank"],
    PUB: ["school", "university", "college", "kindergarten", "hospital",
          "clinic", "civic", "public", "government", "fire_station", "police",
          "train_station", "transportation", "sports_hall", "sports_centre",
          "stadium", "grandstand", "toilets_public", "military", "post_office",
          "courthouse", "embassy"],
    CUL: ["church", "chapel", "cathedral", "mosque", "temple", "shrine",
          "synagogue", "monastery", "religious", "presbytery", "pagoda",
          "museum", "theatre", "cinema", "gate", "hanok"],
    IND: ["industrial", "factory", "manufacture", "warehouse", "works",
          "digester", "storage_tank", "silo"],
    ETC: ["garage", "garages", "carport", "shed", "roof", "hut", "cabin",
          "container", "construction", "ruins", "service", "bridge", "wall",
          "parking", "greenhouse", "bunker", "gatehouse", "tent", "stable",
          "barn", "farm_auxiliary", "toilets", "kitchen", "transformer_tower",
          "water_tower", "elevator", "boathouse", "hangar", "shelter",
          "guardhouse", "pavilion", "cowshed", "sty", "allotment_house"],
}
# building=yes / true / 1 / unknown -> stays 미분류 at L1
UNCLASSIFIED_BUILDING = {"yes", "true", "1", "building", "unknown",
                         "undefined", "y", "Yes", "YES", ""}

# --- L2/L3: use-bearing POI tags -------------------------------------------
AMENITY = {
    COM: ["restaurant", "cafe", "fast_food", "bar", "pub", "food_court",
          "ice_cream", "biergarten", "bank", "bureau_de_change", "pharmacy",
          "marketplace", "fuel", "car_wash", "car_rental", "car_rental_station",
          "internet_cafe", "nightclub", "casino", "stripclub", "love_hotel",
          "veterinary", "driving_school", "coworking_space", "money_transfer",
          "payment_centre", "vehicle_inspection", "funeral_hall", "spa",
          "language_school", "music_school", "dancing_school", "gambling",
          "lottery", "studio"],
    PUB: ["school", "university", "college", "kindergarten", "childcare",
          "library", "townhall", "courthouse", "police", "fire_station",
          "prison", "post_office", "post_depot", "hospital", "clinic",
          "doctors", "dentist", "social_facility", "community_centre",
          "research_institute", "public_building", "embassy", "nursing_home",
          "public_bath", "ranger_station", "customs", "register_office"],
    CUL: ["place_of_worship", "theatre", "cinema", "arts_centre",
          "exhibition_centre", "conference_centre", "monastery", "clubhouse"],
    IND: ["waste_transfer_station", "recycling_centre"],
}
LEISURE = {
    PUB: ["sports_centre", "sports_hall", "stadium", "swimming_pool",
          "public_bath", "sauna"],
    COM: ["fitness_centre", "fitness_station", "adult_gaming_centre",
          "amusement_arcade", "escape_game", "bowling_alley", "hackerspace"],
    CUL: ["culture_centre"],
}
TOURISM = {
    COM: ["hotel", "motel", "guest_house", "hostel", "apartment", "chalet",
          "love_hotel", "caravan_site"],
    CUL: ["museum", "gallery", "artwork", "attraction", "theme_park", "aquarium"],
}
HISTORIC = {CUL: ["*"]}          # every historic=* value -> 종교·문화
SHOP = {COM: ["*"]}              # every shop=* value      -> 상업·업무
CRAFT = {COM: ["*"]}             # 공방/수리업 - small urban business
HEALTHCARE = {PUB: ["*"]}        # 의료시설은 공공·교육(공공서비스)군으로 집계
GOVERNMENT = {PUB: ["*"]}
CLUB = {CUL: ["*"]}
OFFICE = {
    PUB: ["government", "administrative", "diplomatic", "educational_institution",
          "political_party", "ngo", "association", "research", "charity"],
    COM: ["*"],                  # 나머지 office=* 전부 -> 업무시설
}
BUILDING_USE = {
    RES: ["residential", "apartments", "housing"],
    COM: ["commercial", "retail", "office", "business"],
    PUB: ["civic", "public", "education", "school", "government", "health"],
    CUL: ["religious", "worship", "culture"],
    IND: ["industrial", "warehouse", "factory"],
}

# --- L4: containing land-use polygon ---------------------------------------
LANDUSE = {
    RES: ["residential"],
    COM: ["commercial", "retail"],
    IND: ["industrial", "logistics", "port", "depot"],
    PUB: ["education", "institutional", "military", "hospital"],
    CUL: ["religious", "cemetery"],
}

# L4 uses an explicit whitelist: only areas that really imply a building use.
# Parks, viewpoints and generic "attraction" polygons are deliberately excluded -
# a building standing inside 청계천공원 is not thereby a cultural facility.
AREA_RULES = [
    ("amenity", {PUB: ["school", "university", "college", "kindergarten",
                       "hospital", "prison", "police", "fire_station",
                       "research_institute", "community_centre", "social_facility"],
                 CUL: ["place_of_worship", "arts_centre", "theatre", "cinema"],
                 COM: ["marketplace"]}),
    ("historic", {CUL: ["*"]}),
    ("tourism", {CUL: ["museum", "gallery", "zoo", "aquarium", "theme_park"],
                 COM: ["hotel", "motel", "guest_house", "hostel", "apartment"]}),
    ("office", {PUB: ["government", "administrative", "diplomatic",
                      "educational_institution", "research"],
                COM: ["*"]}),
    ("military", {PUB: ["*"]}),
    ("leisure", {PUB: ["sports_centre", "stadium", "swimming_pool", "sports_hall"]}),
    ("shop", {COM: ["*"]}),
]


def classify_area(tags):
    """Return (class, 'key=value') for an area polygon, or None if it implies nothing."""
    for key, table in AREA_RULES:
        c = _lookup(table, tags.get(key))
        if c:
            return c, "{}={}".format(key, tags[key])
    c = _lookup(LANDUSE, tags.get("landuse"))
    if c:
        return c, "landuse=" + tags["landuse"]
    return None


def _lookup(table, value):
    if value is None:
        return None
    v = value.strip().lower()
    star = None
    for cls, vals in table.items():
        if v in vals:
            return cls
        if "*" in vals:
            star = cls
    return star

# evidence strength: a more specific tag wins over a generic one
PRIORITY = [COM, PUB, CUL, IND, RES, ETC]

def classify_tags(tags):
    """Return a class from any use-bearing tags on one OSM element, else None."""
    checks = [
        (AMENITY,     tags.get("amenity")),
        (SHOP,        tags.get("shop")),
        (OFFICE,      tags.get("office")),
        (HEALTHCARE,  tags.get("healthcare")),
        (TOURISM,     tags.get("tourism")),
        (GOVERNMENT,  tags.get("government")),
        (LEISURE,     tags.get("leisure")),
        (CRAFT,       tags.get("craft")),
        (HISTORIC,    tags.get("historic")),
        (CLUB,        tags.get("club")),
        (BUILDING_USE, tags.get("building:use")),
    ]
    hits = [c for table, val in checks if (c := _lookup(table, val))]
    if tags.get("religion") or tags.get("denomination"):
        hits.append(CUL)
    if tags.get("residential") or tags.get("building:flats") or tags.get("flats"):
        hits.append(RES)
    if tags.get("man_made") in ("works",):
        hits.append(IND)
    if not hits:
        return None
    for cls in PRIORITY:
        if cls in hits:
            return cls
    return None

def classify_building_value(value):
    """Return a class from the building=* value, or None if it is 미분류."""
    if value is None or value.strip().lower() in UNCLASSIFIED_BUILDING:
        return None
    return _lookup(BUILDING, value)
