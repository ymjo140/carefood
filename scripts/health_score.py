"""
건강 점수(health_score, 0~100) — 100g 당 영양 성분만으로 매기는 점수.

계산 방식은 유럽 Nutri-Score(2023 개정판)의 점수표를 그대로 쓴다.
  나쁜 쪽(N): 열량 · 당류 · 포화지방 · 나트륨(소금 = 나트륨 × 2.5)
  좋은 쪽(P): 단백질 · 식이섬유   (과일·채소·콩 비율은 데이터가 없어 0)
  점수 NS = N − P.  N 이 11 이상이면 단백질은 세지 않는다(2023 규칙, 과일·채소 점수를 모르니 늘 적용).
  음료(meal_role=drink 이고 100g 당 120kcal 이하)는 음료 점수표 — 열량·당류 구간이 훨씬 촘촘하고,
  감미료(원재료의 알룰로스·수크랄로스… 또는 이름의 '제로')가 들어가면 4점을 더한다(2023 음료 규칙).

NS → 0~100: 등급 구간을 점수 구간에 그대로 옮긴다 (구간 안에서는 직선)
          일반 식품 NS      음료 NS      건강 점수
  A        −17 ~ 0         (물·무가당 0kcal)  80 ~ 100
  B          1 ~ 2         −15 ~ 2       70 ~ 79
  C          3 ~ 10          3 ~ 6       50 ~ 69
  D         11 ~ 18          7 ~ 9       30 ~ 49
  E         19 ~ 40         10 ~ 30       0 ~ 29
화면의 80 이상 '좋음'·60 이상 '보통'과 맞물린다.

값이 없을 때
  열량이 없으면 점수도 없다(None).
  포화지방이 없으면 지방의 30% 로 잡는다(없으면 0). 나트륨·당류가 없으면 0 — 이런 제품은 적다(0.3% 미만).
  식이섬유는 대부분 비어 있어 0 으로 친다 — 식이섬유가 많은 제품은 점수가 조금 덜 나온다.
의료 판단이 아니라 성분 정보를 한 숫자로 줄인 것이다.

  python3 scripts/health_score.py  # 예시 몇 개 계산
"""

import re

SWEETENER = re.compile(r"알룰로스|스테비아|수크랄로스|에리스리톨|아스파탐|아세설팜|말티톨|자일리톨|사카린|나한과|감미료|제로|zero|다이어트|diet", re.I)

FOOD = {
    "energy": [335, 670, 1005, 1340, 1675, 2010, 2345, 2680, 3015, 3350],  # kJ
    "sugar": [3.4, 6.8, 10, 14, 17, 20, 24, 27, 31, 34, 37, 41, 44, 48, 51],
    "satfat": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    "salt": [round(0.2 * i, 1) for i in range(1, 21)],
    "protein": [2.4, 4.8, 7.2, 9.6, 12, 14, 17],
    "fiber": [3.0, 4.1, 5.2, 6.3, 7.4],
}
BEVERAGE = {
    "energy": [30, 90, 150, 210, 240, 270, 300, 330, 360, 390],
    "sugar": [0.5, 2, 3.5, 5, 6, 7, 8, 9, 10, 11],
    "satfat": FOOD["satfat"],
    "salt": FOOD["salt"],
    "protein": [1.2, 1.5, 1.8, 2.1, 2.4, 2.7, 3.0],
    "fiber": FOOD["fiber"],
}
# (NS 시작, NS 끝, 점수 시작, 점수 끝)
FOOD_BANDS = [(-17, 0, 100, 80), (1, 2, 79, 70), (3, 10, 69, 50), (11, 18, 49, 30), (19, 40, 29, 0)]
BEV_BANDS = [(-15, 2, 79, 70), (3, 6, 69, 50), (7, 9, 49, 30), (10, 30, 29, 0)]


def _pts(v, thresholds):
    return sum(1 for t in thresholds if v > t)


def _num(p, k):
    v = p.get(k)
    if v in (None, ""): return None
    try: return float(v)
    except (TypeError, ValueError): return None


def has_sweetener(p, ingredients=""):
    return bool(SWEETENER.search(p.get("name") or "") or (ingredients and SWEETENER.search(ingredients)))


def nutri_ns(p, beverage=False, sweetener=False):
    """Nutri-Score 점수(NS). 열량이 없으면 None"""
    kcal = _num(p, "calories")
    if kcal is None: return None
    t = BEVERAGE if beverage else FOOD
    fat = _num(p, "fat_g")
    sat = _num(p, "saturated_fat_g")
    if sat is None: sat = 0.3 * fat if fat is not None else 0.0
    sugar = _num(p, "sugar_g") or 0.0
    salt = (_num(p, "sodium_mg") or 0.0) * 2.5 / 1000
    n = _pts(kcal * 4.184, t["energy"]) + _pts(sugar, t["sugar"]) + _pts(sat, t["satfat"]) + _pts(salt, t["salt"])
    fiber = _pts(_num(p, "fiber_g") or 0.0, t["fiber"])
    protein = _pts(_num(p, "protein_g") or 0.0, t["protein"])
    if beverage and sweetener: n += 4
    if not beverage and n >= 11: protein = 0
    return n - (protein + fiber)


def _band(ns, bands):
    lo_ns = bands[0][0]
    if ns <= lo_ns: return bands[0][2]
    for a, b, sa, sb in bands:
        if a - 1 < ns <= b:
            if b == a: return sa
            x = (min(max(ns, a), b) - a) / (b - a)
            return round(sa + (sb - sa) * x)
    return 0


def is_beverage(p, role):
    kcal = _num(p, "calories")
    return role == "drink" and kcal is not None and kcal <= 120


def health_score(p, role=None, ingredients=""):
    bev = is_beverage(p, role)
    sweet = bev and has_sweetener(p, ingredients)
    ns = nutri_ns(p, beverage=bev, sweetener=sweet)
    if ns is None: return None
    if bev:
        kcal, sugar = _num(p, "calories") or 0, _num(p, "sugar_g") or 0
        if kcal <= 5 and sugar <= 0.5 and not sweet: return 90  # 물·무가당 차 — 음료 A 등급
        return max(0, min(100, _band(ns, BEV_BANDS)))
    return max(0, min(100, _band(ns, FOOD_BANDS)))


if __name__ == "__main__":
    demo = [
        ("닭가슴살", dict(calories=110, protein_g=23, fat_g=1.5, saturated_fat_g=0.4, sugar_g=0.5, sodium_mg=380), "meal"),
        ("컵라면", dict(calories=440, protein_g=9, fat_g=17, saturated_fat_g=8, sugar_g=4, sodium_mg=1700), "meal"),
        ("콜라", dict(calories=45, protein_g=0, fat_g=0, sugar_g=11, sodium_mg=10), "drink"),
        ("생수", dict(calories=0, sugar_g=0, sodium_mg=1), "drink"),
        ("제로콜라", dict(name="콜라 제로", calories=0, sugar_g=0, sodium_mg=10), "drink"),
        ("현미밥", dict(calories=150, protein_g=3, fat_g=1, sugar_g=0, sodium_mg=5, fiber_g=1.5), "side"),
        ("초콜릿", dict(calories=545, protein_g=6, fat_g=31, saturated_fat_g=19, sugar_g=50, sodium_mg=80), "snack"),
    ]
    for name, p, role in demo:
        p["name"] = p.get("name", name)
        bev = is_beverage(p, role)
        print(f"{name:6} NS={nutri_ns(p, bev, bev and has_sweetener(p)):>3}  점수={health_score(p, role)}")
