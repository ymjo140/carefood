"""
판매처 4곳의 '연결된(matched)' 상품과 연결 대상 식약처 제품을 읽기만 해서 JSON 으로 내려받는다.
  python3 scripts/verify/fetch_matches.py <출력폴더>
"""
import json, os, sys, urllib.parse, urllib.request

URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/") + "/rest/v1/"
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
OUT = sys.argv[1]
H = {"apikey": KEY, **({"Authorization": f"Bearer {KEY}"} if KEY.startswith("eyJ") else {})}

def get_all(table, select, filt, page=1000):
    rows, start = [], 0
    while True:
        q = f"{URL}{table}?select={urllib.parse.quote(select, safe=',')}&{filt}&order=id"
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
    "11st": ("st11_products", "id,name,matched_product_id,match_score,product_url"),
}
allrows = {}
for mall, (table, sel) in MALLS.items():
    rows = get_all(table, sel, "match_status=eq.matched&matched_product_id=not.is.null")
    allrows[mall] = rows
    print(mall, len(rows), flush=True)

ids = sorted({r["matched_product_id"] for rows in allrows.values() for r in rows})
print("products", len(ids), flush=True)
prods = {}
for i in range(0, len(ids), 150):
    part = ids[i:i+150]
    q = f"{URL}products?select=id,name,manufacturer,serving_size_g,total_weight_g,food_code,calories&id=in.({','.join(part)})"
    with urllib.request.urlopen(urllib.request.Request(q, headers=H), timeout=120) as r:
        for p in json.load(r): prods[p["id"]] = p
json.dump({"malls": allrows, "products": prods}, open(os.path.join(OUT, "matches.json"), "w"), ensure_ascii=False)
print("saved")
