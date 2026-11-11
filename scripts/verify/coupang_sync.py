"""
쿠팡 가격 자동 검색 — GitHub Actions 가 1시간마다 실행 (비밀값 COUPANG_*, SUPABASE_*)

  python3 scripts/verify/coupang_sync.py --max 1700 --per-minute 30

1. coupang_sync_state 가 쉬는 중이면 끝낸다
   (먼저) coupang_lookups.status=recheck 인 것 — 예전 규칙으로 붙인 쿠팡 상품을 지금 규칙으로 다시 검색해 바꾸거나 숨긴다(rejected)
2. coupang_queue(아직 안 찾아본 제품, 우선순위 순)에서 max 개를 가져온다
3. 쿠팡 파트너스 검색(1분 per-minute 회) → 브랜드·이름·맛·총중량이 맞는 것 중 가장 싼 것
   쿠팡 쪽 브랜드만 달라 빠졌으면 제조사 이름을 붙여 한 번 더 찾는다
4. 찾으면 product_prices(platform=coupang) 에 넣고, 찾든 못 찾든 coupang_lookups 에 기록
5. 403·rCode 오류면 6시간 쉬게 표시하고 끝낸다 (반복되면 API 가 제한될 수 있음)
6. 대기열이 비면 '재확인': 가격을 찾은 지 --refresh-days 일이 지난 제품을 오래된 순으로 다시 검색한다
   - 처음 찾은 그 쿠팡 상품(productId)이 결과에 있으면 가격·링크·확인 시각을 새로 쓴다
   - 없으면 한 번은 그대로 두고(miss1), 다음 재확인에서도 없으면 쿠팡 가격을 숨긴다(is_available=false, gone)
"""
import argparse, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request
sys.path.insert(0, os.path.dirname(__file__))
from coupang import search
from coupang_match import accept

ap = argparse.ArgumentParser()
ap.add_argument("--max", type=int, default=1700); ap.add_argument("--per-minute", type=float, default=30)
ap.add_argument("--dry", action="store_true", help="DB 에 쓰지 않음")
ap.add_argument("--minutes", type=float, default=0, help="이 시간이 지나면 남은 것은 다음 실행으로 (0 = 끝까지)")
ap.add_argument("--refresh-days", type=float, default=14, help="대기열이 비면 이 일수보다 오래된 쿠팡 가격을 다시 확인 (0 = 안 함)")
a = ap.parse_args()

SB = (os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or "").rstrip("/") + "/rest/v1/"
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY") or ""
if not KEY or SB == "/rest/v1/": raise SystemExit("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 비밀값이 없어요")
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}

def rest(method, path, body=None, prefer=None):
    h = dict(H)
    if prefer: h["Prefer"] = prefer
    req = urllib.request.Request(SB + path, data=json.dumps(body).encode() if body is not None else None, headers=h, method=method)
    with urllib.request.urlopen(req, timeout=60) as r:
        t = r.read()
        return json.loads(t) if t else None

PAUSED = False
def pause(hours, note):
    global PAUSED
    PAUSED = True
    until = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() + hours * 3600))
    if not a.dry:
        rest("PATCH", "coupang_sync_state?id=eq.search", {"paused_until": until, "note": note[:300], "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())})
    print("쉬기:", until, note)

try:
    state = (rest("GET", "coupang_sync_state?id=eq.search&select=paused_until,note") or [{}])[0]
except urllib.error.HTTPError as e:
    # 기록 테이블이 아직 없으면 (scripts/verify/sql/002_coupang_sync.sql 실행 전) 조용히 끝낸다
    print("coupang_sync_state 를 읽지 못했어요 — 002_coupang_sync.sql 을 먼저 실행해 주세요", e.code); raise SystemExit(0)
if state.get("paused_until") and state["paused_until"] > time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()):
    # 일부러 쉬는 것이라 실패로 끝내지 않는다 (실패로 끝내면 GitHub 가 매시간 실패 메일을 보낸다)
    print(f"쉬는 중 ({state['paused_until']} 까지): {state.get('note')} — 이번 실행은 건너뛰어요"); raise SystemExit(0)

# 대기열 — 아직 쿠팡에서 찾아보지 않은 제품 (coupang_lookups 에 없는 것)
# 전에는 coupang_queue 뷰를 우선순위로 정렬해 받았는데, 34만 제품 전체를 가격 뷰와 합쳐 정렬하느라 7초가 넘게 걸려
# API 제한(8초)에 걸려 500 으로 끝났다 (2026-11-10 부터). 이제 단계마다 가벼운 질의로 id 순서대로 받는다:
#   0) 컬리 라벨로 확인된 제품  1) 살 수 있거나 한 끼인 제품  2) 나머지
# coupang_lookups!left(product_id) + coupang_lookups=is.null 은 '기록이 없는 제품'(anti join)이다.
QCOLS = "id,name,manufacturer,serving_size_g,total_weight_g,coupang_lookups!left(product_id)"
TIERS = [("살 수 있거나 한 끼", "&or=(is_purchasable.eq.true,is_meal.eq.true)"), ("나머지", "")]
QSTATE = {"kurly": False, "tier": 0, "last": "00000000-0000-0000-0000-000000000000"}

def kurly_batch():
    """컬리 라벨로 확인된 제품 중 아직 안 찾은 것 (판매처 이름으로 찾는다)"""
    labels, last = {}, ""
    while True:
        part = rest("GET", "kurly_products?select=matched_product_id,name,volume&verify_status=in.(same,relink)&matched_product_id=not.is.null"
                    + (f"&matched_product_id=gt.{last}" if last else "") + "&order=matched_product_id.asc&limit=1000") or []
        for k in part: labels.setdefault(k["matched_product_id"], k)
        if len(part) < 1000: break
        last = part[-1]["matched_product_id"]
    ids, out = list(labels), []
    for i in range(0, len(ids), 150):
        for p in rest("GET", f"products?select={QCOLS}&coupang_lookups=is.null&is_active=eq.true&id=in.({','.join(ids[i:i + 150])})") or []:
            p.pop("coupang_lookups", None)
            k = labels[p["id"]]
            p.update({"mall_name": k["name"], "volume": k.get("volume")}); out.append(p)
    return out

def short_maker(m):
    s = re.sub(r"\(주\)|㈜|주식회사|유한회사|농업회사법인|영농조합법인|\(유\)|[0-9]*\s*공장|본사|지점|센터", " ", m or "")
    s = re.sub(r"\s+", " ", s).strip()
    return s.split(" ")[0] if s else ""

def norm(s): return re.sub(r"[^0-9a-z가-힣]", "", (s or "").lower())

# 식단 배송 서비스 제품은 제조사 칸에 영어 이름이 들어 있다 → 쿠팡 판매 이름(한글 브랜드)
SERVICE_BRANDS = {"sixmeal": "식스밀", "greating": "그리팅", "yundiet": "윤식단", "designmeal": "디자인밀", "makesalad": "메이크샐러드"}

def target(p):
    if p.get("mall_name"):  # 컬리 라벨로 확인된 제품 — 판매처 이름(브랜드 포함)으로 찾는다
        mall = p["mall_name"]
        brand = (re.match(r"\s*\[([^\]]+)\]", mall) or [None, ""])[1]
        kw = re.sub(r"\(택\s*\d\)|\d+\s*종|\s*\([^)]*[xX×*][^)]*\)", " ", mall).replace("[", " ").replace("]", " ")
        return {"keyword": re.sub(r"\s+", " ", kw).strip()[:50], "brand": brand, "name": p["name"], "mall_name": mall, "volume": p.get("volume") or "", "maker": p.get("manufacturer") or ""}
    name = p.get("name") or ""
    svc = SERVICE_BRANDS.get((p.get("manufacturer") or "").strip().lower())
    if svc:  # 식단 배송 브랜드 — 이름이 '부채살 스테이크'처럼 흔해서 브랜드를 붙여 찾고, 쿠팡 이름에 브랜드가 있어야 같은 제품
        clean = re.sub(r"\s*\([^)]*\)", " ", name)
        kw = clean if norm(svc) in norm(clean) else f"{svc} {clean}"
        g = p.get("serving_size_g") or p.get("total_weight_g")
        return {"keyword": re.sub(r"\s+", " ", kw).strip()[:50], "brand": svc, "name": name, "mall_name": name + (f" {float(g):g}g" if g else ""), "volume": "", "maker": p.get("manufacturer") or ""}
    maker = short_maker(p.get("manufacturer"))
    generic = len(norm(name)) <= 5
    kw = f"{maker} {name}" if generic and maker and norm(maker) not in norm(name) else name
    g = p.get("serving_size_g") or p.get("total_weight_g")
    return {"keyword": kw.strip()[:50], "brand": maker if generic else "", "name": name, "mall_name": name + (f" {float(g):g}g" if g else ""), "volume": "", "maker": p.get("manufacturer") or ""}

gap = 60.0 / a.per_minute
found = 0; done = 0; t0 = time.time(); stop = False; out_of_time = False; batch = [None]
NOW = lambda: time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

def next_batch():
    if not QSTATE["kurly"]:
        QSTATE["kurly"] = True
        b = kurly_batch()
        if b:
            print("대기열(컬리 확인)에서", len(b), "개 받음", flush=True)
            return b
    while QSTATE["tier"] < len(TIERS):
        label, flt = TIERS[QSTATE["tier"]]
        b = rest("GET", f"products?select={QCOLS}&coupang_lookups=is.null&is_active=eq.true{flt}&id=gt.{QSTATE['last']}&order=id.asc&limit=1000") or []
        if b:
            QSTATE["last"] = b[-1]["id"]
            for p in b: p.pop("coupang_lookups", None)
            print(f"대기열({label})에서", len(b), "개 받음", flush=True)
            return b
        QSTATE["tier"] += 1; QSTATE["last"] = "00000000-0000-0000-0000-000000000000"
    print("대기열이 비었어요", flush=True)
    return []

SEEN = set()
def items():
    """기록에 실패한 제품이 대기열에 남아도 같은 실행에서 다시 돌지 않게. 대기열이 비면 재확인 대상으로."""
    global batch, stop
    # 0) 다시 확인할 것 (coupang_recheck.py --apply 가 표시) — 지금 규칙으로 다시 검색해 맞는 것으로 바꾸거나 숨긴다
    while not stop:
        looks = [l for l in (rest("GET", "coupang_lookups?status=eq.recheck&select=product_id&order=product_id.asc&limit=300") or []) if l["product_id"] not in SEEN]
        if not looks: break
        print("다시 확인", len(looks), "개", flush=True)
        ids = ",".join(l["product_id"] for l in looks)
        prods = {p["id"]: p for p in (rest("GET", f"products?id=in.({ids})&select=id,name,manufacturer,serving_size_g,total_weight_g") or [])}
        for k in rest("GET", f"kurly_products?select=matched_product_id,name,volume&verify_status=in.(same,relink)&matched_product_id=in.({ids})") or []:
            if k["matched_product_id"] in prods: prods[k["matched_product_id"]].update({"mall_name": k["name"], "volume": k.get("volume")})
        for l in looks:
            if stop: return
            SEEN.add(l["product_id"])
            p = prods.get(l["product_id"])
            if p: yield p, {"recheck": True}
    while not stop:
        raw = next_batch()
        if not raw: break
        batch = [p for p in raw if p["id"] not in SEEN]
        for p in batch:
            if stop: return
            SEEN.add(p["id"])
            yield p, None
    if a.refresh_days <= 0: return
    cutoff = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - a.refresh_days * 86400))
    while not stop:
        looks = [l for l in (rest("GET", f"coupang_lookups?status=in.(found,miss1)&checked_at=lt.{cutoff}&select=product_id,keyword,coupang_product_id,status&order=checked_at.asc&limit=500") or []) if l["product_id"] not in SEEN]
        print("재확인 대상", len(looks), "개", flush=True)
        if not looks: return
        ids = ",".join(l["product_id"] for l in looks)
        prods = {p["id"]: p for p in (rest("GET", f"products?id=in.({ids})&select=id,name,manufacturer,serving_size_g,total_weight_g") or [])}
        for l in looks:
            if stop: return
            SEEN.add(l["product_id"])
            p = prods.get(l["product_id"])
            if p: yield p, l

class Paused(Exception): pass
class ServerBusy(Exception): pass
def do_search(kw):
    # 쿠팡 쪽 5xx(504 등)는 잠깐의 서버 문제 — 20초·1분·2분 쉬고 다시. 그래도 안 되면 이 제품만 넘긴다
    for wait in (20, 60, 120, None):
        try:
            d = search(kw, 10); break
        except urllib.error.HTTPError as e:
            if e.code < 500: raise
            if wait is None: raise ServerBusy(f"HTTP {e.code}")
            print(f"쿠팡 HTTP {e.code} — {wait}초 뒤 다시", flush=True); time.sleep(wait)
    rc = str(d.get("rCode"))
    if rc != "0":
        msg = f"rCode {rc} {d.get('rMessage')}"
        if rc in ("401", "403", "429") or "limit" in str(d.get("rMessage")).lower(): raise Paused(msg)
        raise ValueError(msg)  # 검색어 문제 등 — 이 제품만 건너뛴다
    return ((d.get("data") or {}).get("productData")) or []

busy_streak = 0
for p, old in items():
    started = time.time()
    skip = False
    rechk = bool(old and old.get("recheck"))
    if rechk: old = None
    tg = target(p)
    old_keyword = old["keyword"] if old else None
    if old_keyword: tg["keyword"] = old_keyword  # 재확인: 처음 찾을 때 쓴 검색어 그대로
    look = {"product_id": p["id"], "keyword": tg["keyword"], "checked_at": NOW()}
    try:
        results = do_search(tg["keyword"])
        busy_streak = 0
        if old:
            # 재확인: 처음 찾은 그 쿠팡 상품이 검색 결과에 아직 있는지로 판단 (이름 규칙을 다시 적용하지 않음)
            ok = [it for it in results if str(it.get("productId")) == str(old.get("coupang_product_id"))]
        else:
            checks = [(it, accept(tg, it)) for it in results]
            ok = [it for it, (good, _) in checks if good]
            maker = short_maker(p.get("manufacturer"))
            # 이름은 맞는데 쿠팡 쪽 브랜드가 달라 빠진 것만 있으면, 제조사 이름을 붙여 한 번 더 찾는다 (롯데 슈크림빵 ↔ 삼립 슈크림빵)
            if not ok and maker and re.search(r"[가-힣]", maker) and norm(maker) not in norm(tg["keyword"]) and any(w.startswith("브랜드 다름") for _, (_, w) in checks):
                time.sleep(gap)
                tg2 = dict(tg, keyword=f"{maker} {tg['keyword']}"[:50])
                ok = [it for it in do_search(tg2["keyword"]) if accept(tg2, it)[0]]
                if ok: tg = tg2; look["keyword"] = tg2["keyword"]
        if ok:
            best = min(ok, key=lambda x: float(x.get("productPrice") or 9e9))
            look.update({"status": "found", "coupang_product_id": best.get("productId"), "coupang_name": (best.get("productName") or "")[:200],
                         "price": int(float(best.get("productPrice") or 0)), "reason": None})
            if not a.dry:
                rest("POST", "product_prices?on_conflict=product_id,platform", {
                    "product_id": p["id"], "platform": "coupang", "price": look["price"], "url": best.get("productUrl"),
                    "image_url": best.get("productImage"), "is_available": True, "last_crawled_at": NOW()},
                    prefer="resolution=merge-duplicates,return=minimal")
                # 가격이 생겼으니 탐색 '구매 가능만'·AI 추천에 나오게
                rest("PATCH", f"products?id=eq.{p['id']}&is_purchasable=eq.false", {"is_purchasable": True}, prefer="return=minimal")
            found += 1
        elif old and old.get("status") == "found":
            # 재확인에서 한 번 못 찾음 — 검색 순위에서 밀렸을 수도 있어 가격은 두고 다음 재확인 때 한 번 더 본다
            look.update({"status": "miss1", "coupang_product_id": old.get("coupang_product_id"), "reason": f"재확인 1회 못 찾음 (결과 {len(results)}개)"})
        elif old:
            # 두 번 연속 못 찾음 — 품절·판매 종료로 보고 쿠팡 가격을 숨긴다
            look.update({"status": "gone", "coupang_product_id": old.get("coupang_product_id"), "reason": f"재확인 2회 연속 못 찾음 (결과 {len(results)}개)"})
            if not a.dry:
                rest("PATCH", f"product_prices?product_id=eq.{p['id']}&platform=eq.coupang", {"is_available": False, "last_crawled_at": NOW()}, prefer="return=minimal")
        elif rechk:
            # 예전 규칙으로 붙인 쿠팡 상품이 지금 규칙으로는 다른 상품 — 숨긴다 (지우지 않아 되돌릴 수 있다)
            look.update({"status": "rejected", "reason": f"다시 확인: 결과 {len(results)}개 중 맞는 것 없음"})
            if not a.dry:
                rest("PATCH", f"product_prices?product_id=eq.{p['id']}&platform=eq.coupang", {"is_available": False, "last_crawled_at": NOW()}, prefer="return=minimal")
        else:
            look.update({"status": "none", "reason": f"결과 {len(results)}개 중 맞는 것 없음"})
    except Paused as e:
        pause(6, str(e)); stop = True; break
    except ServerBusy as e:
        # 기록을 남기지 않는다 → 원래 상태(찾음·다시 확인 등)가 그대로 남아 다음 실행에서 다시 본다
        busy_streak += 1; skip = True
        print(f"쿠팡 {e} — 이 제품은 다음 실행으로", flush=True)
        if busy_streak >= 5:  # 계속 5xx 면 쿠팡이 오래 아픈 것 — 30분만 쉰다
            pause(0.5, f"{e} 연속 {busy_streak}번"); stop = True; break
    except urllib.error.HTTPError as e:
        if "coupang" in (e.url or "") or e.code in (401, 403, 429):
            pause(6, f"HTTP {e.code}"); stop = True; break
        look.update({"status": "error", "reason": f"HTTP {e.code}"})
    except Exception as e:
        look.update({"status": "error", "reason": str(e)[:200]})
    if skip: time.sleep(gap); continue
    if not a.dry:
        rest("POST", "coupang_lookups?on_conflict=product_id", look, prefer="resolution=merge-duplicates,return=minimal")
    done += 1
    if done % 100 == 0: print(f"{done} · 찾음 {found} · {time.time()-t0:.0f}s", flush=True)
    if (a.minutes and time.time() - t0 > a.minutes * 60) or done >= a.max:
        print("시간·개수가 다 돼서 남은 것은 다음 실행으로"); out_of_time = True; stop = True; break
    time.sleep(max(0, gap - (time.time() - started)))
print("끝", f"{done}개 검색 · 찾음 {found}", f"{time.time()-t0:.0f}s")
# 쉬지 않았고 대기열이 남았으면 다음 실행을 이어서 (Actions 가 이 파일을 보고 다시 시작)
if not PAUSED and out_of_time:
    open("coupang-continue", "w").write("1")
