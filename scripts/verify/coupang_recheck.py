"""
이미 넣은 쿠팡 가격을 지금 매칭 규칙으로 다시 본다. 맞지 않으면 기록을 recheck 로 — coupang_sync.py 가 다시 검색해서 맞는 것으로 바꾸거나 숨긴다.

  python3 scripts/verify/coupang_recheck.py [--apply]
"""
import argparse, json, os, re, sys, urllib.parse, urllib.request
sys.path.insert(0, os.path.dirname(__file__))
from coupang_match import accept
# coupang_sync.py 와 같은 표 (그 파일은 불러오면 바로 검색을 시작해서 따로 둔다)
SERVICE_BRANDS = {"sixmeal": "식스밀", "greating": "그리팅", "yundiet": "윤식단", "designmeal": "디자인밀", "makesalad": "메이크샐러드"}

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
        tg = {"brand": brand, "name": p.get("name"), "mall_name": k["name"], "volume": k.get("volume") or "", "maker": p.get("manufacturer") or ""}
    else:
        g = p.get("serving_size_g") or p.get("total_weight_g")
        svc = SERVICE_BRANDS.get((p.get("manufacturer") or "").strip().lower(), "")
        tg = {"brand": svc, "name": p.get("name"), "mall_name": (p.get("name") or "") + (f" {float(g):g}g" if g else ""), "volume": "", "maker": p.get("manufacturer") or ""}
    ok, why = accept(tg, {"productName": l["coupang_name"]})
    if not ok: bad.append((l, tg, why))

print("다시 본 것", len(looks), "· 맞지 않음", len(bad))
import random, collections
print(collections.Counter(w.split(" (")[0] for _, _, w in bad).most_common(12))
random.seed(1)
for l, tg, why in random.sample(bad, min(60, len(bad))): print((tg.get("maker") or "-")[:14].ljust(14), "  -", (tg["mall_name"] or "")[:30].ljust(30), "↔", (l["coupang_name"] or "")[:34], "|", why)
if a.apply:
    # 바로 지우지 않고 '다시 확인'으로 둔다 → coupang_sync.py 가 지금 규칙으로 다시 검색해 맞는 것으로 바꾸거나 숨긴다
    groups = {}
    for l, tg, why in bad: groups.setdefault(why, []).append(l["product_id"])
    for why, ids in groups.items():
        for i in range(0, len(ids), 150):
            rest("PATCH", f"coupang_lookups?status=eq.found&product_id=in.({','.join(ids[i:i+150])})", {"status": "recheck", "reason": f"다시 확인: {why}"[:200]})
    print("다시 확인으로 표시", len(bad))
