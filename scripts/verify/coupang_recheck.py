"""
이미 넣은 쿠팡 가격을 지금 매칭 규칙으로 다시 본다. 맞지 않으면 product_prices(coupang) 에서 빼고 기록을 rejected 로.

  python3 scripts/verify/coupang_recheck.py [--apply]
"""
import argparse, json, os, re, sys, urllib.parse, urllib.request
sys.path.insert(0, os.path.dirname(__file__))
from coupang_match import accept

ap = argparse.ArgumentParser(); ap.add_argument("--apply", action="store_true"); a = ap.parse_args()
SB = (os.environ.get("SUPABASE_URL") or os.environ["NEXT_PUBLIC_SUPABASE_URL"]).rstrip("/") + "/rest/v1/"
K = os.environ["SUPABASE_SERVICE_ROLE_KEY"]; H = {"apikey": K, "Authorization": f"Bearer {K}", "Content-Type": "application/json"}

def rest(method, path, body=None, rng=None):
    h = dict(H)
    if rng: h["Range"] = rng
    if method != "GET": h["Prefer"] = "return=minimal"
    with urllib.request.urlopen(urllib.request.Request(SB + path, data=json.dumps(body).encode() if body is not None else None, headers=h, method=method), timeout=120) as r:
        t = r.read(); return json.loads(t) if t else None

def all_rows(path):
    out, s = [], 0
    while True:
        c = rest("GET", path, rng=f"{s}-{s+999}"); out += c
        if len(c) < 1000: return out
        s += 1000

looks = all_rows("coupang_lookups?select=product_id,coupang_name&status=eq.found&order=product_id")
ids = [l["product_id"] for l in looks]
prods, mall = {}, {}
for i in range(0, len(ids), 150):
    part = ",".join(ids[i:i+150])
    for p in rest("GET", f"products?select=id,name,manufacturer,serving_size_g,total_weight_g&id=in.({part})"): prods[p["id"]] = p
    for k in rest("GET", f"kurly_products?select=matched_product_id,name,volume&verify_status=in.(same,relink)&matched_product_id=in.({part})"):
        mall.setdefault(k["matched_product_id"], k)

bad = []
for l in looks:
    p = prods.get(l["product_id"]) or {}; k = mall.get(l["product_id"])
    if k:
        brand = (re.match(r"\s*\[([^\]]+)\]", k["name"]) or [None, ""])[1]
        tg = {"brand": brand, "name": p.get("name"), "mall_name": k["name"], "volume": k.get("volume") or ""}
    else:
        g = p.get("serving_size_g") or p.get("total_weight_g")
        tg = {"brand": "", "name": p.get("name"), "mall_name": (p.get("name") or "") + (f" {float(g):g}g" if g else ""), "volume": ""}
    ok, why = accept(tg, {"productName": l["coupang_name"]})
    if not ok: bad.append((l, tg, why))

print("다시 본 것", len(looks), "· 맞지 않음", len(bad))
for l, tg, why in bad[:25]: print("  -", (tg["mall_name"] or "")[:30].ljust(30), "↔", (l["coupang_name"] or "")[:34], "|", why)
if a.apply:
    for l, tg, why in bad:
        rest("DELETE", f"product_prices?product_id=eq.{l['product_id']}&platform=eq.coupang")
        rest("PATCH", f"coupang_lookups?product_id=eq.{l['product_id']}", {"status": "rejected", "reason": f"다시 보니 다른 상품: {why}"[:200]})
    print("뺐음", len(bad))
