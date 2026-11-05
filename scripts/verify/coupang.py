"""
쿠팡 파트너스 Open API (상품 검색) — GitHub Actions 비밀값 COUPANG_ACCESS_KEY / COUPANG_SECRET_KEY 사용

  python3 scripts/verify/coupang.py check "<검색어>" <출력.json>

검색 API 는 상품명·가격·이미지·링크·로켓 여부만 준다 (제조사·영양·품목보고번호 없음) → 검증이 아니라 가격 붙이기에 쓴다.
호출 한도가 작아(검색 분당 50회 안내, 초과 시 정지 위험) 천천히 부른다.
"""
import hashlib, hmac, json, os, sys, time, urllib.parse, urllib.request

DOMAIN = "https://api-gateway.coupang.com"
SEARCH = "/v2/providers/affiliate_open_api/apis/openapi/products/search"
AK = os.environ.get("COUPANG_ACCESS_KEY", ""); SK = os.environ.get("COUPANG_SECRET_KEY", "")

def auth(method, path, query):
    signed = time.strftime("%y%m%dT%H%M%SZ", time.gmtime())
    sig = hmac.new(SK.encode(), (signed + method + path + query).encode(), hashlib.sha256).hexdigest()
    return f"CEA algorithm=HmacSHA256, access-key={AK}, signed-date={signed}, signature={sig}"

def search(keyword, limit=10):
    query = f"keyword={urllib.parse.quote(keyword)}&limit={limit}"
    req = urllib.request.Request(f"{DOMAIN}{SEARCH}?{query}", headers={"Authorization": auth("GET", SEARCH, query), "Content-Type": "application/json;charset=UTF-8"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.load(r)

if __name__ == "__main__":
    cmd, kw, out = sys.argv[1], sys.argv[2], sys.argv[3]
    res = {"has_keys": bool(AK and SK), "keyword": kw}
    if not res["has_keys"]:
        res["error"] = "COUPANG_ACCESS_KEY / COUPANG_SECRET_KEY 비밀값이 없어요"
    else:
        try:
            d = search(kw, 5)
            items = ((d.get("data") or {}).get("productData")) or []
            res.update({"rCode": d.get("rCode"), "rMessage": d.get("rMessage"), "count": len(items),
                        "items": [{k: it.get(k) for k in ("productName", "productPrice", "isRocket", "productId")} for it in items]})
        except urllib.error.HTTPError as e:
            res.update({"error": f"HTTP {e.code}", "body": e.read().decode("utf8", "ignore")[:300]})
        except Exception as e:
            res["error"] = str(e)[:300]
    json.dump(res, open(out, "w"), ensure_ascii=False, indent=1)
    print(json.dumps({k: v for k, v in res.items() if k != "items"}, ensure_ascii=False))
    for it in res.get("items", []): print(" ", it["productName"][:50], it["productPrice"])
