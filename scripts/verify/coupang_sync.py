"""
쿠팡 가격 자동 검색 — GitHub Actions 가 1시간마다 실행 (비밀값 COUPANG_*, SUPABASE_*)

  python3 scripts/verify/coupang_sync.py --max 1700 --per-minute 30

1. coupang_sync_state 가 쉬는 중이면 끝낸다
2. coupang_queue(아직 안 찾아본 제품, 우선순위 순)에서 max 개를 가져온다
3. 쿠팡 파트너스 검색(1분 per-minute 회) → 이름·총중량이 맞는 것 중 가장 싼 것
4. 찾으면 product_prices(platform=coupang) 에 넣고, 찾든 못 찾든 coupang_lookups 에 기록
5. 403·rCode 오류면 6시간 쉬게 표시하고 끝낸다 (반복되면 API 가 제한될 수 있음)
"""
import argparse, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request
sys.path.insert(0, os.path.dirname(__file__))
from coupang import search
from coupang_match import accept

ap = argparse.ArgumentParser()
ap.add_argument("--max", type=int, default=1700); ap.add_argument("--per-minute", type=float, default=30)
ap.add_argument("--dry", action="store_true", help="DB 에 쓰지 않음")
ap.add_argument("--minutes", type=float, default=0, help="이 시간이 지나면 남은 것은 다음 실행으로 (0 = 끝까지)")
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
    raise SystemExit(f"쉬는 중 ({state['paused_until']} 까지): {state.get('note')}")

QUEUE_SQL = "coupang_queue?select=id,name,manufacturer,serving_size_g,total_weight_g,mall_name,volume,priority&order=priority.asc,id.asc&limit=1000"
# Supabase 는 한 번에 1,000줄까지만 준다 → 1,000개씩 받아 가며 계속 (처리한 제품은 coupang_lookups 에 기록돼 대기열에서 빠진다)

def short_maker(m):
    s = re.sub(r"\(주\)|㈜|주식회사|유한회사|농업회사법인|영농조합법인|\(유\)|[0-9]*\s*공장|본사|지점|센터", " ", m or "")
    s = re.sub(r"\s+", " ", s).strip()
    return s.split(" ")[0] if s else ""

def norm(s): return re.sub(r"[^0-9a-z가-힣]", "", (s or "").lower())

def target(p):
    if p.get("mall_name"):  # 컬리 라벨로 확인된 제품 — 판매처 이름(브랜드 포함)으로 찾는다
        mall = p["mall_name"]
        brand = (re.match(r"\s*\[([^\]]+)\]", mall) or [None, ""])[1]
        kw = re.sub(r"\(택\s*\d\)|\d+\s*종|\s*\([^)]*[xX×*][^)]*\)", " ", mall).replace("[", " ").replace("]", " ")
        return {"keyword": re.sub(r"\s+", " ", kw).strip()[:50], "brand": brand, "name": p["name"], "mall_name": mall, "volume": p.get("volume") or ""}
    name = p.get("name") or ""
    maker = short_maker(p.get("manufacturer"))
    generic = len(norm(name)) <= 5
    kw = f"{maker} {name}" if generic and maker and norm(maker) not in norm(name) else name
    g = p.get("serving_size_g") or p.get("total_weight_g")
    return {"keyword": kw.strip()[:50], "brand": maker if generic else "", "name": name, "mall_name": name + (f" {float(g):g}g" if g else ""), "volume": ""}

gap = 60.0 / a.per_minute
found = 0; done = 0; t0 = time.time(); stop = False; out_of_time = False; batch = [None]
NOW = lambda: time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

def next_batch():
    b = rest("GET", QUEUE_SQL) or []
    print("대기열에서", len(b), "개 받음", flush=True)
    return b

SEEN = set()
def items():
    """기록에 실패한 제품이 대기열에 남아도 같은 실행에서 다시 돌지 않게"""
    global batch, stop
    while not stop:
        batch = [p for p in next_batch() if p["id"] not in SEEN]
        if not batch: return
        for p in batch:
            if stop: return
            SEEN.add(p["id"])
            yield p

for p in items():
    started = time.time()
    tg = target(p)
    look = {"product_id": p["id"], "keyword": tg["keyword"], "checked_at": NOW()}
    try:
        d = search(tg["keyword"], 10)
        rc = str(d.get("rCode"))
        if rc != "0":
            msg = f"rCode {rc} {d.get('rMessage')}"
            if rc in ("401", "403", "429") or "limit" in str(d.get("rMessage")).lower():
                pause(6, msg); stop = True; break
            raise ValueError(msg)  # 검색어 문제 등 — 이 제품만 건너뛴다
        items = ((d.get("data") or {}).get("productData")) or []
        ok = [it for it in items if accept(tg, it)[0]]
        if ok:
            best = min(ok, key=lambda x: float(x.get("productPrice") or 9e9))
            look.update({"status": "found", "coupang_product_id": best.get("productId"), "coupang_name": (best.get("productName") or "")[:200],
                         "price": int(float(best.get("productPrice") or 0)), "reason": None})
            if not a.dry:
                rest("POST", "product_prices?on_conflict=product_id,platform", {
                    "product_id": p["id"], "platform": "coupang", "price": look["price"], "url": best.get("productUrl"),
                    "image_url": best.get("productImage"), "is_available": True, "last_crawled_at": NOW()},
                    prefer="resolution=merge-duplicates,return=minimal")
            found += 1
        else:
            look.update({"status": "none", "reason": f"결과 {len(items)}개 중 맞는 것 없음"})
    except urllib.error.HTTPError as e:
        if "coupang" in (e.url or "") or e.code in (401, 403, 429):
            pause(6, f"HTTP {e.code}"); stop = True; break
        look.update({"status": "error", "reason": f"HTTP {e.code}"})
    except Exception as e:
        look.update({"status": "error", "reason": str(e)[:200]})
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
