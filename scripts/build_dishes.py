"""
식약처 식품영양성분DB(FoodNtrCpntDbInfo03)에서 '음식 · 품목대표'(일반 메뉴)만 받아
1인분(식품중량 Z10500) 기준 열량·영양으로 바꿔 src/data/dishes.json 에 저장한다.

  MFDS_API_KEY=... python3 scripts/build_dishes.py [원본저장폴더]

값은 100g 당 성분 × 1인분 중량 / 100. 외식·직접 만든 음식을 간단히 기록할 때 쓰는 '보통 1인분' 기준.
"""
import json, os, sys, time, urllib.parse, urllib.request

KEY = urllib.parse.quote(os.environ["MFDS_API_KEY"], safe="")
BASE = "https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo03/getFoodNtrCpntDbInq03"
RAW = sys.argv[1] if len(sys.argv) > 1 else None
OUT = os.path.join(os.path.dirname(__file__), "..", "src", "data", "dishes.json")

def page(n):
    q = f"{BASE}?serviceKey={KEY}&type=json&numOfRows=500&pageNo={n}&DB_CLASS_NM={urllib.parse.quote('품목대표')}"
    for attempt in range(4):
        try:
            with urllib.request.urlopen(q, timeout=60) as r:
                return json.load(r)["body"]
        except Exception as e:  # 잠깐 끊기면 다시
            print("retry", n, e); time.sleep(2 + attempt * 3)
    raise SystemExit(f"page {n} 실패")

def num(v):
    try: return float(str(v).replace("g", "").replace(",", "").strip())
    except Exception: return None

first = page(1)
total = first["totalCount"]; items = list(first["items"])
for n in range(2, (total + 499) // 500 + 1):
    items += page(n)["items"]; print(n, len(items))
if RAW:
    json.dump(items, open(os.path.join(RAW, "pumok.json"), "w"), ensure_ascii=False)

dishes, seen = [], set()
for it in items:
    if it.get("DB_GRP_NM") != "음식": continue
    g = num(it.get("Z10500")); kcal100 = num(it.get("AMT_NUM1"))
    if not g or kcal100 is None: continue
    f = g / 100
    def per(k):
        v = num(it.get(k)); return round(v * f, 1) if v is not None else None
    name = it["FOOD_NM_KR"].strip()
    if name in seen: continue
    seen.add(name)
    dishes.append({
        "id": it["FOOD_CD"],
        "name": name,                     # 예: 국밥_순대국밥
        "group": it.get("FOOD_REF_NM") or "",  # 예: 국밥
        "cat": it.get("FOOD_CAT1_NM") or "",
        "g": round(g),
        "kcal": round(kcal100 * f),
        "protein_g": per("AMT_NUM3"), "fat_g": per("AMT_NUM4"), "carbs_g": per("AMT_NUM6"),
        "sugar_g": per("AMT_NUM7"), "sodium_mg": per("AMT_NUM13"),
    })
dishes.sort(key=lambda d: d["name"])
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump({"source": "식품의약품안전처 식품영양성분DB (음식 · 품목대표)", "fetched": time.strftime("%Y-%m-%d"), "count": len(dishes), "dishes": dishes},
          open(OUT, "w"), ensure_ascii=False, separators=(",", ":"))
print("dishes", len(dishes), "→", OUT)
