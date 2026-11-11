"""
제품 맛 6축(짠·단·고소·매운·새콤·감칠, 1~10) + 끼니 역할(meal_role)을 계산한다.

근거 (위에 있을수록 믿는다)
  1. 영양 수치 — 짠맛=나트륨, 단맛=당류, 고소=지방 (100g 당, src/lib/recommend/constants.ts TASTE_RANGES 와 같은 구간)
  2. 원재료 — products.ingredients_raw(실제 원재료가 있는 것) 또는 품목제조보고(food_reports.ingredients, 연결된 것)
     감미료(알룰로스·스테비아…)는 당이 없어도 단맛, 고춧가루·캡사이신은 매운맛, 식초·구연산은 새콤, 간장·멸치·L-글루탐산나트륨은 감칠
  3. 제품 이름 — '매콤', '레몬', '버터', '저염', '제로' 같은 말
  모르는 축은 비운다(null) — 0·1 로 채우지 않는다.

끼니 역할: meal(한 끼) · side(반찬·샐러드) · snack(간식·빵·유제품) · drink(음료·선식) · supplement(영양제) · condiment(소스·기름) · ingredient(식재료)
  영양제는 이름(…정·캡슐·글루타치온·루테인…)과 품목 유형(건강기능식품)으로 잡는다 — 분류가 '기타'·'샐러드'로 잘못 들어간 것까지.

  python3 scripts/build_taste_profile.py build --out /tmp/taste.jsonl   # 계산 (읽기만)
  python3 scripts/build_taste_profile.py sample --in /tmp/taste.jsonl   # 눈으로 확인
  python3 scripts/build_taste_profile.py upload --in /tmp/taste.jsonl   # products_taste_patch 에 올림 → SQL 로 반영
환경 변수: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
"""
import argparse, json, os, random, re, sys, urllib.parse, urllib.request

TASTE_RANGES = {
    "salty": [(0, 100), (100, 200), (200, 350), (350, 500), (500, 650), (650, 800), (800, 1000), (1000, 1200), (1200, 1500), (1500, 1e9)],
    "sweet": [(0, 1), (1, 2), (2, 4), (4, 6), (6, 9), (9, 12), (12, 16), (16, 20), (20, 25), (25, 1e9)],
    "fatty": [(0, 1), (1, 3), (3, 5), (5, 7), (7, 10), (10, 15), (15, 20), (20, 25), (25, 30), (30, 1e9)],
}

# (정규식, 점수) — 이름·원재료에서 찾으면 더한다
NAME_KW = {
    "spicy": [(r"불닭|마라|핵불|청양|땡초|캡사이신|하바네로|고스트페퍼", 7), (r"매운|매콤|얼큰|짬뽕|스파이시|핫\b|hot|고추장|불맛|칠리|할라피뇨|와사비", 5), (r"김치|떡볶이|고추|카레|커리|닭갈비|제육|쭈꾸미|낙지", 3)],
    "sour": [(r"새콤|식초|피클|초절임|사워|사우어|홍초|발사믹", 6), (r"레몬|라임|유자|자몽|매실|오미자|깔라만시|크랜베리|요거트|요구르트|플레인요|베리", 4), (r"김치|냉면|파인애플|키위|토마토|오렌지|귤|자두|살구", 2)],
    "umami": [(r"사골|곰탕|육수|멸치|다시마|가쓰오|굴소스|명란|감칠|조미", 5), (r"간장|된장|청국장|치즈|버섯|트러플|불고기|갈비|한우|소고기|참치|라면|우동|짜장|국밥|탕$|찌개", 3), (r"닭|돼지|햄|베이컨|새우|오징어|김$|김자반", 2)],
    "sweet": [(r"달콤|허니|꿀|초코|초콜릿|카라멜|캐러멜|바닐라|연유|시럽|마카롱|케이크|빙수|양갱|약과|잼", 4), (r"딸기|바나나|망고|복숭아|고구마|단호박|밤|팥|크림|라떼|모카|쿠키|도넛|와플", 2)],
    "fatty": [(r"고소|참깨|들깨|버터|치즈|크림|마요|참기름|들기름|튀김|프라이드|치킨|베이컨|삼겹|까르보", 4), (r"견과|땅콩|아몬드|호두|캐슈|피스타치오|아보카도|콩가루|두유|라떼", 3)],
    "salty": [(r"짭짤|소금|젓갈|장아찌|자반|간장|짠지|염장", 4)],
}
LESS = {  # 덜하다는 말 — 뺀다
    "salty": r"저염|싱거|무염|저나트륨|나트륨\s?줄",
    "sweet": r"무가당|무당|저당|당\s?줄|슈가\s?프리|sugar\s?free|제로슈가",
    "fatty": r"저지방|무지방|라이트|light",
    "spicy": r"순한|안\s?매운|덜\s?매운|마일드|mild|키즈|어린이|아이",
}
SWEETENER = r"알룰로스|스테비아|수크랄로스|에리스리톨|아스파탐|아세설팜|말티톨|자일리톨|사카린|나한과|감미료"
ING_KW = {
    "spicy": [(r"캡사이신|하바네로|청양|베트남고추|태국고추", 4), (r"고춧가루|고추분말|고추장|고추추출|칠리|할라피뇨|와사비|겨자|산초|화자오|마라", 3)],
    "sour": [(r"양조식초|사과식초|현미식초|식초|구연산|사과산|젖산|주석산|레몬|라임|매실|발효유|요구르트|요거트|피클", 3)],
    "umami": [(r"L-글루탐산나트륨|글루탐산|이노신산|구아닐산|효모추출물|가쓰오|멸치|다시마|사골|육수|간장|된장|굴소스|버섯|치즈|토마토페이스트|액젓|참치", 2)],
    "fatty": [(r"버터|치즈|크림|참기름|들기름|참깨|들깨|땅콩|아몬드|호두|캐슈|마요네즈|팜유|쇼트닝|코코넛오일", 2)],
}

SUPPLEMENT = re.compile(r"(\d+\s?정|\S정$|\S정\s|캡슐|타블렛|츄어블|글루타치온|아르기닌|비오틴|루테인|오메가\s?3|밀크씨슬|프로바이오틱스|락토바실러스|비타민\s?[A-Za-z0-9]|멀티비타민|홍삼정|스피루리나|클로렐라|프로폴리스|쏘팔메토|크릴오일|MSM|NMN|코엔자임|엽산\s|철분제|칼슘\s?마그네슘|아연\s|셀레늄|글루코사민|콘드로이친|히알루론산|레스베라트롤|퀘르세틴|가르시니아|카테킨|잔티젠|보스웰리아|맥주효모|\d+\s?mg\b)", re.I)
# 분류(dish_category)가 '밥'·'반찬'이어도 이름으로 보면 간식·식재료인 것
SNACK_NAME = re.compile(r"(과자|스낵|칩$|칩\s|튀밥|뻥튀기|쿠키|강정|크래커|볶은\s?(서리태|콩|검은콩|아몬드|땅콩|병아리콩)|볶음\s?(서리태|콩)|견과|바\b|바$|젤리|사탕|캔디|초콜릿|누룽지\s?(과자|칩|스낵))")
INGREDIENT_NAME = re.compile(r"(가루|분말|사리$|당면$|소면$|중면$|국수$|국수면|떡국떡|떡볶이떡|밀가루|부침가루|튀김가루|빵가루|전분|생면$|건면$|쌀$|현미$|잡곡$|귀리$|오트$"
                             r"|김밥용|용김$|두부피|유부$|만두피|라이스페이퍼)")
# 마른 파스타 — 끝이 면 이름이고 소스·요리 이름이 없을 때만 (토마토 스파게티 같은 완제품은 한 끼)
PASTA_RAW = re.compile(r"(스파게티|스파게티니|펜네|푸실리|링귀니|마카로니|파스타면|파스타|리가토니|탈리아텔레|페투치네|파르팔레)\s*$")
PASTA_DISH = re.compile(r"토마토|크림|로제|알리오|까르보|볼로네제|미트|봉골레|나폴리탄|소스|오일|바질|치즈|새우|베이컨")
CONDIMENT_NAME = re.compile(r"(소스|드레싱|오일|기름|식초|간장|양념|시럽|잼|케찹|케첩|마요네즈|머스타드|조미료|맛술|액젓|된장|고추장|쌈장|다시다)$")


def rest(method, path, body=None):
    url = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/") + "/rest/v1/" + path
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    req = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json", "Prefer": "return=minimal,resolution=merge-duplicates"})
    with urllib.request.urlopen(req, timeout=180) as r:
        t = r.read()
        return json.loads(t) if t else None


def level(axis, v):
    for i, (lo, hi) in enumerate(TASTE_RANGES[axis], 1):
        if lo <= v < hi: return i
    return 10


def kw_points(text, table):
    pts = 0
    for pat, w in table:
        if re.search(pat, text, re.I): pts = max(pts, w)  # 같은 축은 가장 센 말 하나만
    return pts


def compute(p, ings):
    name = p.get("name") or ""
    ing = " ".join(ings) if ings else ""
    out = {}
    num = lambda k: None if p.get(k) in (None, "") else float(p[k])

    for axis, field in (("salty", "sodium_mg"), ("sweet", "sugar_g"), ("fatty", "fat_g")):
        v = num(field)
        base = level(axis, v) if v is not None and v >= 0 else None
        add = kw_points(name, NAME_KW[axis]) + (kw_points(ing, ING_KW[axis]) if axis in ING_KW and ing else 0)
        if base is None:
            out[axis] = min(10, 2 + add) if add else None
        else:
            # 수치가 있으면 수치가 기본, 말은 한두 단계만 보탠다
            out[axis] = min(10, base + (1 if add >= 3 else 0))
        if out[axis] is not None and re.search(LESS[axis], name, re.I): out[axis] = max(1, out[axis] - 2)
    # 감미료: 당이 적어도 단맛이 난다
    if (ing and re.search(SWEETENER, ing)) or re.search(r"제로|zero|0\s?kcal|칼로리\s?0", name, re.I) and p.get("dish_category") in ("beverage", "snack", "dairy"):
        out["sweet"] = max(out["sweet"] or 1, 5)

    sp = num("spicy_score")
    spicy = 1 + kw_points(name, NAME_KW["spicy"]) + (kw_points(ing, ING_KW["spicy"]) if ing else 0)
    if sp is not None: spicy = max(spicy, int(round(sp * 2)))
    if re.search(LESS["spicy"], name, re.I): spicy = max(1, spicy - 3)
    out["spicy"] = max(1, min(10, spicy))

    for axis in ("sour", "umami"):
        pts = kw_points(name, NAME_KW[axis]) + (kw_points(ing, ING_KW[axis]) if ing else 0)
        out[axis] = max(1, min(10, 1 + pts))
    return out


def role(p, food_type):
    name = p.get("name") or ""
    cat = p.get("dish_category") or "other"
    if (food_type and "건강기능" in food_type) or cat == "supplement" or SUPPLEMENT.search(name): return "supplement"
    if cat == "sauce" or CONDIMENT_NAME.search(name.strip()): return "condiment"
    if cat == "ingredient": return "ingredient"
    if cat in ("beverage", "powder"): return "drink"
    if SNACK_NAME.search(name): return "snack"
    if INGREDIENT_NAME.search(name.strip()): return "ingredient"
    bare = re.sub(r"\([^)]*\)|\d+(\.\d+)?\s*(g|kg)\b", " ", name).strip()
    if PASTA_RAW.search(bare) and not PASTA_DISH.search(bare): return "ingredient"
    if cat in ("rice", "noodle", "soup", "stew", "set", "grill"): return "meal"
    if cat in ("side", "salad", "seafood"): return "side"
    if cat in ("snack", "bread", "dairy"): return "snack"
    # 기타: 1회 열량으로 — 300kcal 이상이면 한 끼, 아니면 간식
    kcal, g, base = p.get("calories"), p.get("serving_size_g"), p.get("nutrient_base_g") or 100
    if kcal is not None and g:
        per = float(kcal) * float(g) / float(base)
        if per >= 300: return "meal"
    return "snack"


def fetch_all():
    rows, last = [], "00000000-0000-0000-0000-000000000000"
    cols = "id,name,dish_category,category_large,calories,serving_size_g,nutrient_base_g,sodium_mg,sugar_g,fat_g,spicy_score,ingredients_raw,food_type"
    while True:
        part = rest("GET", f"products?select={cols}&is_active=eq.true&id=gt.{last}&order=id.asc&limit=1000")
        if not part: break
        rows += part; last = part[-1]["id"]
        if len(rows) % 50000 < 1000: print(f"  제품 {len(rows)}", flush=True)
    return rows


def fetch_reports():
    """품목제조보고 원재료 · 품목 유형 — 연결된 제품만"""
    out, last = {}, "00000000-0000-0000-0000-000000000000"
    while True:
        part = rest("GET", f"food_reports?select=id,matched_product_id,ingredients,food_type&matched_product_id=not.is.null&id=gt.{last}&order=id.asc&limit=1000")
        if not part: break
        for r in part: out[r["matched_product_id"]] = (r.get("ingredients") or [], r.get("food_type") or "")
        last = part[-1]["id"]
    return out


def build(path):
    print("제품 받는 중", flush=True)
    rows = fetch_all()
    print(f"제품 {len(rows)}개 · 품목보고 받는 중", flush=True)
    reps = fetch_reports()
    print(f"품목보고 연결 {len(reps)}개", flush=True)
    with open(path, "w") as f:
        for p in rows:
            ings, ftype = reps.get(p["id"], ([], ""))
            raw = p.get("ingredients_raw") or ""
            if raw and raw != "식품의약품안전처": ings = ings + [raw]
            t = compute(p, ings)
            f.write(json.dumps({"id": p["id"], "name": p["name"], "cat": p.get("dish_category"), "src": "ing" if ings else "name",
                                **{f"taste_{k}": v for k, v in t.items()}, "meal_role": role(p, ftype or p.get("food_type"))}, ensure_ascii=False) + "\n")
    print("끝", flush=True)


def sample(path):
    recs = [json.loads(l) for l in open(path)]
    from collections import Counter
    print("역할", Counter(r["meal_role"] for r in recs).most_common())
    print("원재료 근거", Counter(r["src"] for r in recs))
    for axis in ("salty", "sweet", "fatty", "spicy", "sour", "umami"):
        c = Counter(r[f"taste_{axis}"] for r in recs)
        print(axis, sorted(((k if k is not None else 0), v) for k, v in c.items()))
    probe = re.compile(r"글루타치온|양배추정|불닭|레몬|요거트|제로|저염|사골|버터|매콤|홍삼|아르기닌|비타민")
    random.seed(3)
    picks = [r for r in recs if probe.search(r["name"] or "")]
    for r in random.sample(picks, min(30, len(picks))):
        print(f'{r["meal_role"]:10} 짠{r["taste_salty"]} 단{r["taste_sweet"]} 고{r["taste_fatty"]} 매{r["taste_spicy"]} 새{r["taste_sour"]} 감{r["taste_umami"]} | {r["cat"]} | {r["name"][:30]}')


def upload(path):
    rows = []
    for l in open(path):
        r = json.loads(l)
        rows.append({k: r[k] for k in ("id", "taste_salty", "taste_sweet", "taste_fatty", "taste_spicy", "taste_sour", "taste_umami", "meal_role")})
    for i in range(0, len(rows), 1000):
        rest("POST", "products_taste_patch?on_conflict=id", rows[i:i + 1000])
        if (i // 1000) % 50 == 0: print(f"  {i + 1000}/{len(rows)}", flush=True)
    print("올림 끝", flush=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["build", "sample", "upload"])
    ap.add_argument("--out"); ap.add_argument("--in", dest="inp")
    a = ap.parse_args()
    {"build": lambda: build(a.out), "sample": lambda: sample(a.inp), "upload": lambda: upload(a.inp)}[a.cmd]()
