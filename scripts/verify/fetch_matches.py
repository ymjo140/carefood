"""
판매처 4곳의 '연결된(matched)' 상품과 연결 대상 식약처 제품을 읽기만 해서 JSON 으로 내려받는다.
  python3 scripts/verify/fetch_matches.py <출력폴더> [--catalog] [--coupang]
  --catalog: 다시 이을 후보를 찾도록 상용제품 전체(이름·제조사·중량)도 받는다
  --coupang: 쿠팡 연결(coupang_lookups found)도 같은 꼴로 받는다 (id = 제품 id, name = 쿠팡 상품명)
"""
import json, os, sys, urllib.parse, urllib.request

URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/") + "/rest/v1/"
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
OUT = sys.argv[1]
CATALOG = "--catalog" in sys.argv[2:]
COUPANG = "--coupang" in sys.argv[2:]
H = {"apikey": KEY, **({"Authorization": f"Bearer {KEY}"} if KEY.startswith("eyJ") else {})}

def get_all(table, select, filt, page=1000, order="id"):
    rows, start = [], 0
    while True:
        q = f"{URL}{table}?select={urllib.parse.quote(select, safe=',')}&{filt}&order={order}"
        req = urllib.request.Request(q, headers={**H, "Range-Unit": "items", "Range": f"{start}-{start+page-1}"})
        with urllib.request.urlopen(req, timeout=120) as r:
            chunk = json.load(r)
        rows += chunk
        if len(chunk) < page: return rows
        start += page

MALLS = {
    "kurly": ("kurly_products", "id,name,volume,seller_name,matched_product_id,match_score,url"),
    "oasis": ("oasis_products", "id,name,matched_product_id,match_score,url"),
    "homeplus": ("homeplus_products", "id,name,matched_product_id,match_score,url"),
    "11st": ("st11_products", "id,name,brand,matched_product_id,match_score,product_url"),
}
allrows = {}
for mall, (table, sel) in MALLS.items():
    rows = get_all(table, sel, "match_status=eq.matched&matched_product_id=not.is.null")
    allrows[mall] = rows
    print(mall, len(rows), flush=True)

if COUPANG:
    rows = get_all("coupang_lookups", "product_id,coupang_product_id,coupang_name", "status=eq.found", order="product_id")
    allrows["coupang"] = [{"id": r["product_id"], "name": r.get("coupang_name") or "", "matched_product_id": r["product_id"],
                           "url": f"https://www.coupang.com/vp/products/{r.get('coupang_product_id') or ''}"} for r in rows]
    print("coupang", len(rows), flush=True)

ids = sorted({r["matched_product_id"] for rows in allrows.values() for r in rows})
print("products", len(ids), flush=True)
prods = {}
for i in range(0, len(ids), 150):
    part = ids[i:i+150]
    q = f"{URL}products?select=id,name,manufacturer,serving_size_g,total_weight_g,food_code,calories&id=in.({','.join(part)})"
    with urllib.request.urlopen(urllib.request.Request(q, headers=H), timeout=120) as r:
        for p in json.load(r): prods[p["id"]] = p
catalog = []
if CATALOG:
    catalog = get_all("products", "id,name,manufacturer,serving_size_g,total_weight_g", "is_active=eq.true&category_large=eq." + urllib.parse.quote("상용제품"))
    print("catalog", len(catalog), flush=True)
json.dump({"malls": allrows, "products": prods, "catalog": catalog}, open(os.path.join(OUT, "matches.json"), "w"), ensure_ascii=False)
print("saved")
