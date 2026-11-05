"""
OCR 결과(label_ocr.py 의 JSONL)로 연결을 판정한다 (읽기 전용 — 결과는 CSV).

  python3 scripts/verify/label_judge.py <matches.json 폴더> <ocr.jsonl ...> --out judged.csv

판정 (우선순위)
  same        라벨 품목보고번호 → 식약처 → 우리 제품 = 지금 연결
  relink      번호로 찾은 진짜 제품이 우리 DB 에 따로 있음 → 그 제품으로 바꿀 후보
  not_in_db   번호로 식약처 제품은 찾았는데 우리 DB 에는 없음 → 연결 끊을 후보
  maker_kcal_same / maker_kcal_diff   번호가 없을 때(수입식품 등) 라벨 제조원·100g kcal 로 비교
  unknown     라벨을 못 읽음
필요: MFDS_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
"""
import argparse, csv, json, os, re, threading, time, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor

ap = argparse.ArgumentParser()
ap.add_argument("dir"); ap.add_argument("ocr", nargs="+"); ap.add_argument("--out", default="judged.csv")
ap.add_argument("--workers", type=int, default=6)
a = ap.parse_args()

MFDS = "https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo03/getFoodNtrCpntDbInq03"
MKEY = urllib.parse.quote(os.environ["MFDS_API_KEY"], safe="")
SB = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/") + "/rest/v1/"
SKEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]; SH = {"apikey": SKEY, "Authorization": f"Bearer {SKEY}"}

def get(url, headers=None, timeout=30, tries=3):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers or {}), timeout=timeout) as r:
                return r.read()
        except Exception:
            if i == tries - 1: raise
            time.sleep(1.5 * (i + 1))

# OCR 이 '품목'을 '품복·품옥·풍목'으로 읽는 일이 잦다
REPORT_RE = re.compile(r"(?:[품풍][목복옥묵]\s*(?:제조)?\s*[보브]고\s*[번빈]호|보고\s*번호|품목보고)[^0-9]{0,14}([0-9][0-9\s\-]{8,22}[0-9])")
ANY_NUM_RE = re.compile(r"(?<!\d)(\d{8,12}-?\d{1,6})(?!\d)")

def parse(text):
    t = (text or "").replace("|", " ")
    nums = []
    for m in REPORT_RE.finditer(t):
        n = re.sub(r"[\s\-]", "", m.group(1))
        if n not in nums: nums.append(n)
    for n in ANY_NUM_RE.findall(t):
        n2 = n.replace("-", "")
        if 10 <= len(n2) <= 16 and n2.startswith(("19", "20")) and n2 not in nums: nums.append(n2)
    maker = ""
    mm = re.search(r"(?:제조원|제조\s*[·및]?\s*판매원|제조업소[^\n:]{0,12}|업소명[^\n:]{0,8}|제조사|제조자|생산자)\s*[:：_]?\s*([^\n/]{2,40})", t)
    if mm: maker = re.sub(r"^(및\s*소재지|명)\s*[:：]?\s*", "", mm.group(1).strip())
    kcal = None
    KC = r"k\s*[ce]\s*a\s*[l1I|]"
    km = re.search(r"100\s*m?[lg]\s*(?:당|기준)?[^\n]{0,30}?(\d{1,4})\s*" + KC, t, re.I) or re.search(r"(\d{1,4})\s*" + KC, t, re.I)
    if km and int(km.group(1)) > 0: kcal = int(km.group(1))
    return nums, maker, kcal

def norm(s):
    s = (s or "").lower()
    s = re.sub(r"\(주\)|㈜|\(%|주식회사|유한회사|농업회사법인|영농조합법인|co\.?,?\s*ltd\.?", " ", s)
    return re.sub(r"[^0-9a-z가-힣]", "", s)

def maker_sim(a_, b_):
    a_, b_ = norm(a_), norm(b_)
    if not a_ or not b_: return 0.0
    bg = lambda s: {s[i:i+2] for i in range(len(s) - 1)}
    A, B = bg(a_), bg(b_)
    return len(A & B) / max(1, min(len(A), len(B)))

_cache, _lock = {}, threading.Lock()
def mfds(no):
    with _lock:
        if no in _cache: return _cache[no]
    try:
        d = json.loads(get(f"{MFDS}?serviceKey={MKEY}&type=json&numOfRows=3&pageNo=1&ITEM_REPORT_NO={no}"))
        items = (d.get("body") or {}).get("items") or []
    except Exception:
        items = None
    with _lock: _cache[no] = items
    return items

def our_product(code):
    rows = json.loads(get(f"{SB}products?select=id,name,manufacturer&food_code=eq.{urllib.parse.quote(code)}&limit=1", headers=SH))
    return rows[0] if rows else None

data = json.load(open(os.path.join(a.dir, "matches.json")))
PRODS = data["products"]
by_goods = {}
for r in data["malls"]["kurly"]:
    m = re.search(r"goods/(\d+)", r.get("url") or "")
    if m: by_goods.setdefault(m.group(1), []).append(r)
ocr = {}
for path in a.ocr:
    for line in open(path, encoding="utf8"):
        rec = json.loads(line); ocr[rec["goods_no"]] = rec

def judge(g):
    rec = ocr[g]; out = []
    nums, maker, kcal = parse(rec.get("text"))
    found = None
    for no in nums[:6]:
        items = mfds(no)
        if items: found = (no, items[0]); break
    true = our_product(found[1]["FOOD_CD"]) if found else None
    for row in by_goods.get(g, []):
        p = PRODS.get(row["matched_product_id"]) or {}
        res = {"kurly_id": row["id"], "goods_no": g, "kurly_name": row["name"], "matched_product_id": row["matched_product_id"],
               "matched_name": p.get("name", ""), "matched_maker": p.get("manufacturer", ""),
               "label_report_no": found[0] if found else (nums[0] if nums else ""), "label_maker": maker,
               "label_kcal": kcal or "", "true_product_id": "", "true_name": "", "true_maker": "", "verdict": "", "note": rec.get("error", "")}
        if found:
            it = found[1]; res["true_name"] = it["FOOD_NM_KR"]; res["true_maker"] = it.get("MAKER_NM") or ""
            if true:
                res["true_product_id"] = true["id"]
                res["verdict"] = "same" if true["id"] == row["matched_product_id"] else "relink"
            else:
                res["verdict"] = "not_in_db"
        elif maker or kcal:
            ms = maker_sim(maker, p.get("manufacturer"))
            cal = p.get("calories")
            has_cal = kcal is not None and cal not in (None, "")
            kcal_ok = has_cal and abs(float(cal) - kcal) <= max(5, 0.06 * kcal)
            kcal_far = has_cal and abs(float(cal) - kcal) > max(15, 0.15 * kcal)
            # 같다: 제조원이 맞고 kcal 가 어긋나지 않음 / 다르다: 제조원이 확실히 다르고 kcal 도 맞지 않음, 또는 kcal 가 크게 다름
            if ms >= 0.5 and not kcal_far: res["verdict"] = "maker_kcal_same"
            elif kcal_ok and not maker: res["verdict"] = "maker_kcal_same"
            elif (maker and ms < 0.2 and not kcal_ok) or kcal_far: res["verdict"] = "maker_kcal_diff"
            else: res["verdict"] = "unknown"
            res["note"] = f"제조원 유사 {ms:.2f} · kcal {kcal} ↔ {cal}"
        else:
            res["verdict"] = "unknown"; res["note"] = res["note"] or "라벨을 읽지 못함"
        out.append(res)
    return out

t0 = time.time()
rows = []
with ThreadPoolExecutor(a.workers) as ex:
    for chunk in ex.map(judge, [g for g in ocr if g in by_goods]): rows += chunk
out_path = os.path.join(a.dir, a.out)
with open(out_path, "w", newline="", encoding="utf-8-sig") as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
from collections import Counter
print("judged", len(rows), f"{time.time()-t0:.0f}s", dict(Counter(r["verdict"] for r in rows)))
