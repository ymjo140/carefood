"""
번호를 못 읽은 상품: 라벨의 제조원 · 100g kcal 로 우리 제품 DB 에서 진짜 제품을 찾는다 (읽기 전용 — 결과는 CSV).

  python3 scripts/verify/label_namematch.py <폴더> <judged_all.csv> <ocr.jsonl ...> --out namematch.csv [--sample N]

후보: products.name 에 판매처 핵심 이름이 들어 있는 제품 (최대 40개)
통과: 후보 제조사 ≈ 라벨 제조원(글자 2개씩 겹침 0.6 이상)
      + 판매처 브랜드가 후보 이름·제조사에 있음(브랜드가 있으면)
      + 라벨 kcal 이 있으면 후보 100g kcal 과 6% 안
통과한 후보가 하나면 → same(지금 연결) / relink(다른 제품). 여럿이거나 없으면 unresolved.
"""
import argparse, csv, json, os, random, re, sys, time, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, os.path.dirname(__file__))

ap = argparse.ArgumentParser()
ap.add_argument("dir"); ap.add_argument("judged"); ap.add_argument("ocr", nargs="+")
ap.add_argument("--out", default="namematch.csv"); ap.add_argument("--sample", type=int, default=0)
a = ap.parse_args()

SB = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/") + "/rest/v1/"
K = os.environ["SUPABASE_SERVICE_ROLE_KEY"]; H = {"apikey": K, "Authorization": f"Bearer {K}"}

def get(q):
    for i in range(3):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(SB + q, headers=H), timeout=60))
        except Exception:
            if i == 2: raise
            time.sleep(1.5)

def nm(s): return re.sub(r"[^0-9a-z가-힣]", "", (s or "").lower())
def cleanmaker(s):
    s = re.sub(r"\(주\)|㈜|주식회사|유한회사|농업회사법인|영농조합법인|\(유\)|co\.?,?\s*ltd\.?|[0-9]+공장|공장|본사", " ", (s or "").lower())
    s = re.split(r"(?:경기|서울|부산|대구|인천|광주|대전|울산|세종|강원|충청|충북|충남|전라|전북|전남|경상|경북|경남|제주)\S*[도시]", s)[0]
    return nm(s)
bg = lambda x: {x[i:i+2] for i in range(len(x) - 1)}
def sim(a_, b_):
    A, B = bg(cleanmaker(a_)), bg(cleanmaker(b_))
    return len(A & B) / max(1, min(len(A), len(B))) if A and B else 0.0

def core(name):
    s = re.sub(r"\[[^\]]*\]|\([^)]*\)", " ", name or "")
    s = re.sub(r"\d+(\.\d+)?\s*(kg|g|ml|l|개입|개|입|팩|봉|캔|병|포|구|매|인분)\b", " ", s, flags=re.I)
    s = re.sub(r"\d+\s*종|택\s*\d|x\s*\d+|\*\s*\d+|선물세트|리뉴얼", " ", s, flags=re.I)
    return re.sub(r"\s+", " ", s).strip()

from label_judge_parse import parse  # 같은 규칙으로 제조원·kcal 를 다시 뽑는다

PRODS = json.load(open(os.path.join(a.dir, "matches.json")))["products"]
rows = [r for r in csv.DictReader(open(a.judged, encoding="utf-8-sig")) if r["verdict"] in ("unknown", "maker_kcal_diff", "maker_kcal_same")]
if a.sample: random.seed(9); rows = random.sample(rows, a.sample)
ocr = {}
for p in a.ocr:
    for line in open(p, encoding="utf8"):
        rec = json.loads(line); ocr[rec["goods_no"]] = rec.get("text") or ""

def one(r):
    out = dict(r); out.update({"nm_verdict": "unresolved", "nm_product_id": "", "nm_name": "", "nm_maker": "", "nm_note": ""})
    nums, maker, kcal = parse(ocr.get(r["goods_no"], ""))
    if not maker:
        out["nm_note"] = "라벨 제조원 없음"; return out
    c = core(r["kurly_name"])
    words = [w for w in c.split(" ") if len(w) >= 2]
    if not words: out["nm_note"] = "이름 없음"; return out
    key = max(words, key=len)  # 가장 긴 낱말로 후보를 모은다
    pattern = "*" + "*".join(urllib.parse.quote(w) for w in words[:4]) + "*"
    cands = get(f"products?select=id,name,manufacturer,calories&name=ilike.{pattern}&limit=60")
    if len(cands) < 3:
        cands += get(f"products?select=id,name,manufacturer,calories&name=ilike.*{urllib.parse.quote(key)}*&limit=60")
    cur = PRODS.get(r["matched_product_id"])  # 지금 연결된 제품은 늘 후보에
    if cur and all(c["id"] != cur["id"] for c in cands): cands.append(cur)
    m = re.match(r"\s*\[([^\]]+)\]", r["kurly_name"]); brand = nm(m.group(1)) if m else ""
    good = []
    for p in cands:
        s = sim(maker, p.get("manufacturer"))
        if s < 0.6: continue
        # 제조원이 맞으면 브랜드는 보지 않는다 (OEM: 고래사 ← 늘푸른바다)
        cal = p.get("calories")
        if kcal and cal not in (None, "") and abs(float(cal) - kcal) > max(5, 0.06 * kcal): continue
        # 핵심 이름 낱말이 후보 이름에 많이 들어 있어야
        hit = sum(1 for w in words if nm(w) in nm(p.get("name")))
        if hit < max(1, len(words) // 2): continue
        good.append((hit, p))
    if not good: out["nm_note"] = f"후보 {len(cands)}개 중 제조원·kcal 맞는 것 없음 (라벨 제조원 '{maker[:20]}')"; return out
    good.sort(key=lambda x: -x[0])
    if len(good) > 1 and good[0][0] == good[1][0] and r["matched_product_id"] not in [g[1]["id"] for g in good if g[0] == good[0][0]]:
        out["nm_note"] = f"맞는 후보 {len(good)}개 — 하나로 못 정함"; return out
    best = next((g[1] for g in good if g[1]["id"] == r["matched_product_id"] and g[0] == good[0][0]), good[0][1])
    out.update({"nm_product_id": best["id"], "nm_name": best["name"], "nm_maker": best.get("manufacturer") or "",
                "nm_verdict": "same" if best["id"] == r["matched_product_id"] else "relink",
                "nm_note": f"라벨 제조원 '{maker[:20]}' · kcal {kcal}"})
    return out

t0 = time.time()
with ThreadPoolExecutor(8) as ex: res = list(ex.map(one, rows))
with open(os.path.join(a.dir, a.out), "w", newline="", encoding="utf-8-sig") as f:
    w = csv.DictWriter(f, fieldnames=list(res[0].keys())); w.writeheader(); w.writerows(res)
from collections import Counter
print("done", len(res), f"{time.time()-t0:.0f}s", dict(Counter(r["nm_verdict"] for r in res)))
