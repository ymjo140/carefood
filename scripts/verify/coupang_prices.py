"""
쿠팡 파트너스 검색으로 확인된 제품의 쿠팡 가격·링크를 찾는다 (GitHub Actions — 비밀값 COUPANG_*)

  python3 scripts/verify/coupang_prices.py <targets.json> <출력.jsonl> [--per-minute 15] [--max 1500]

- 천천히 부른다 (기본 1분 15회 — 안내된 한도 1분 50회보다 한참 아래).
- 403 이나 rCode 가 0 이 아니면 그 자리에서 멈춘다 (반복되면 API 가 제한될 수 있음).
- 결과 중 브랜드·이름·총중량이 맞는 것만 받고, 그중 가장 싼 것 하나.
  (묶음 수가 다른 상품 — 예: 2개입 ↔ 6개입 — 은 총중량이 달라 걸러진다)
출력은 key 로만 — 내부 제품 id 는 저장소에 두지 않는다.
"""
import argparse, json, re, sys, time, urllib.error
sys.path.insert(0, __file__.rsplit("/", 1)[0])
from coupang import search

ap = argparse.ArgumentParser()
ap.add_argument("targets"); ap.add_argument("out")
ap.add_argument("--per-minute", type=float, default=15); ap.add_argument("--max", type=int, default=1500)
a = ap.parse_args()

def norm(s):
    return re.sub(r"[^0-9a-z가-힣]", "", (s or "").lower())

def bigrams(s):
    return {s[i:i+2] for i in range(len(s) - 1)}

UNIT = r"(kg|g|ml|l)"
def total_grams(text):
    t = (text or "").lower().replace(",", "").replace("×", "x").replace("*", "x")
    m = re.search(r"(\d+(?:\.\d+)?)\s*" + UNIT + r"\s*x\s*(\d+)", t)
    if m:
        v = float(m.group(1)) * (1000 if m.group(2) in ("kg", "l") else 1); return v * int(m.group(3))
    m = re.search(r"(\d+(?:\.\d+)?)\s*" + UNIT + r"[^0-9]{0,8}?(\d+)\s*(개입|개|입|팩|봉|병|캔|구)", t)
    if m:
        v = float(m.group(1)) * (1000 if m.group(2) in ("kg", "l") else 1); return v * int(m.group(3))
    m = re.search(r"(\d+(?:\.\d+)?)\s*" + UNIT + r"\b", t)
    if m: return float(m.group(1)) * (1000 if m.group(2) in ("kg", "l") else 1)
    return None

def has_count(text):
    t = (text or "").lower()
    return bool(re.search(r"x\s*\d+|\d+\s*(개입|개|입|팩|봉|병|캔|세트|박스)", t))

def accept(tg, it):
    name = it.get("productName") or ""
    nn = norm(name)
    brand = norm(tg.get("brand"))
    if brand and len(brand) >= 2 and brand not in nn: return False, "브랜드 없음"
    core = norm(re.sub(r"\[[^\]]*\]", "", tg.get("name") or ""))
    if brand and core.startswith(brand): core = core[len(brand):]
    B = bigrams(core)
    ov = len(B & bigrams(nn)) / max(1, len(B))
    if ov < 0.6: return False, f"이름 겹침 {ov:.2f}"
    tg_total = total_grams(tg.get("mall_name")) or total_grams(tg.get("volume"))
    cp_total = total_grams(name)
    if tg_total and cp_total:
        if abs(tg_total - cp_total) / max(tg_total, cp_total) > 0.12: return False, f"총중량 {tg_total:g}↔{cp_total:g}"
    elif has_count(name) != has_count(tg.get("mall_name") + " " + (tg.get("volume") or "")):
        return False, "묶음 수 다름"
    return True, f"이름 겹침 {ov:.2f}"

targets = json.load(open(a.targets))[: a.max]
gap = 60.0 / a.per_minute
found = 0; t0 = time.time()
with open(a.out, "w", encoding="utf8") as f:
    for i, tg in enumerate(targets):
        started = time.time()
        rec = {"key": tg["key"], "keyword": tg["keyword"], "status": "", "item": None, "reason": ""}
        try:
            d = search(tg["keyword"], 10)
            if str(d.get("rCode")) != "0":
                rec["status"] = "stop"; rec["reason"] = f"rCode {d.get('rCode')} {d.get('rMessage')}"[:200]
                f.write(json.dumps(rec, ensure_ascii=False) + "\n"); print("멈춤:", rec["reason"]); break
            items = ((d.get("data") or {}).get("productData")) or []
            ok = []
            for it in items:
                good, why = accept(tg, it)
                if good: ok.append(it)
            if ok:
                best = min(ok, key=lambda x: float(x.get("productPrice") or 9e9))
                rec["status"] = "found"; found += 1
                rec["item"] = {k: best.get(k) for k in ("productId", "productName", "productPrice", "productUrl", "productImage", "isRocket")}
            else:
                rec["status"] = "none"; rec["reason"] = f"결과 {len(items)}개 중 맞는 것 없음"
        except urllib.error.HTTPError as e:
            rec["status"] = "stop"; rec["reason"] = f"HTTP {e.code}"
            f.write(json.dumps(rec, ensure_ascii=False) + "\n"); print("멈춤:", rec["reason"]); break
        except Exception as e:
            rec["status"] = "error"; rec["reason"] = str(e)[:200]
        f.write(json.dumps(rec, ensure_ascii=False) + "\n"); f.flush()
        if (i + 1) % 50 == 0: print(f"{i+1}/{len(targets)} · 찾음 {found} · {time.time()-t0:.0f}s", flush=True)
        time.sleep(max(0, gap - (time.time() - started)))
print("끝", f"찾음 {found}", f"{time.time()-t0:.0f}s")
