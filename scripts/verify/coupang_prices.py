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

from coupang_match import accept, total_grams, has_count, norm  # noqa: E402

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
