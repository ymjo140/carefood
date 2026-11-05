"""
컬리 상품 ↔ 식약처 제품 연결을 품목보고번호로 확인한다 (읽기 전용 — 결과는 CSV).

  python3 scripts/verify/verify_kurly.py <작업폴더> [--limit N] [--sample N] [--workers 6]

순서 (상품마다)
  1. 컬리 상품 페이지(__NEXT_DATA__) → 상품정보 표시 이미지(noticeImages)
  2. 이미지 OCR(tesseract kor) → 품목보고번호 · 제조원 · 100g 당 kcal
  3. 식약처 API(FoodNtrCpntDbInfo03, ITEM_REPORT_NO) → 식약처 코드(FOOD_CD)
  4. 우리 products.food_code 로 진짜 제품 id
  5. 지금 연결된 제품과 비교 → same | relink(진짜 제품이 따로 있음) | not_in_db | no_number

필요: tesseract + kor 데이터(TESSDATA_PREFIX), MFDS_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
"""
import argparse, csv, io, json, os, random, re, subprocess, sys, tempfile, threading, time, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor

ap = argparse.ArgumentParser()
ap.add_argument("dir"); ap.add_argument("--limit", type=int, default=0); ap.add_argument("--sample", type=int, default=0)
ap.add_argument("--workers", type=int, default=6); ap.add_argument("--out", default="kurly_verified.csv")
args = ap.parse_args()

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36"}
MFDS = "https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo03/getFoodNtrCpntDbInq03"
MKEY = urllib.parse.quote(os.environ["MFDS_API_KEY"], safe="")
SB = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/") + "/rest/v1/"
SKEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
SH = {"apikey": SKEY, "Authorization": f"Bearer {SKEY}"}

def get(url, headers=UA, timeout=30, tries=3):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=timeout) as r:
                return r.read()
        except Exception:
            if i == tries - 1: raise
            time.sleep(1.5 * (i + 1))

def notice_images(goods_no):
    html = get(f"https://www.kurly.com/goods/{goods_no}").decode("utf8", "ignore")
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
    if not m: return []
    nd = json.loads(m.group(1))
    urls = []
    def walk(o):
        if isinstance(o, dict):
            for k, v in o.items():
                if k == "noticeImages" and isinstance(v, list):
                    for it in v:
                        p = ((it or {}).get("image") or {}).get("path")
                        if p and p not in urls: urls.append(p)
                elif k == "legacyPiImages":  # 예전 상품: 상품정보 이미지가 여기 (JSON 문자열일 수도)
                    lst = v
                    if isinstance(v, str):
                        try: lst = json.loads(v)
                        except Exception: lst = []
                    for p in lst or []:
                        if isinstance(p, str) and p not in urls: urls.append(p)
                else: walk(v)
        elif isinstance(o, list):
            for v in o: walk(v)
    walk(nd)
    return urls

def ocr(url):
    from PIL import Image
    im = Image.open(io.BytesIO(get(url, timeout=40))).convert("L")
    scale = 2 if im.width < 1400 else 1
    if scale > 1: im = im.resize((im.width * scale, im.height * scale))
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
        im.save(f.name); path = f.name
    try:
        out = subprocess.run(["tesseract", path, "-", "-l", "kor+eng", "--psm", "6"], capture_output=True, timeout=120)
        return out.stdout.decode("utf8", "ignore")
    finally:
        os.unlink(path)

REPORT_RE = re.compile(r"(?:품목\s*(?:제조)?\s*보고\s*번호|보고\s*번호)[^0-9]{0,12}([0-9][0-9\s\-]{8,20}[0-9])")
ANY_NUM_RE = re.compile(r"(?<!\d)(\d{8,11}-?\d{1,6})(?!\d)")

def parse(text):
    t = text.replace("|", " ")
    m = REPORT_RE.search(t)
    nums = []
    if m: nums.append(re.sub(r"[\s\-]", "", m.group(1)))
    for n in ANY_NUM_RE.findall(t):
        n2 = n.replace("-", "")
        if 10 <= len(n2) <= 16 and n2.startswith(("19", "20")) and n2 not in nums: nums.append(n2)
    maker = ""
    mm = re.search(r"(?:제조원|제조업소[^\n]{0,10}|제조사|생산자)\s*[:：]?\s*([^\n/]{2,30})", t)
    if mm: maker = mm.group(1).strip()
    kcal = None
    km = re.search(r"(\d{1,4})\s*kcal", t, re.I)
    if km: kcal = int(km.group(1))
    return nums, maker, kcal

_mfds_cache, _lock = {}, threading.Lock()
def mfds_by_report(no):
    with _lock:
        if no in _mfds_cache: return _mfds_cache[no]
    try:
        d = json.loads(get(f"{MFDS}?serviceKey={MKEY}&type=json&numOfRows=5&pageNo=1&ITEM_REPORT_NO={no}", headers={}, timeout=30))
        items = (d.get("body") or {}).get("items") or []
    except Exception:
        items = None
    with _lock: _mfds_cache[no] = items
    return items

def product_by_food_code(code):
    q = f"{SB}products?select=id,name,manufacturer&food_code=eq.{urllib.parse.quote(code)}&limit=1"
    rows = json.loads(get(q, headers=SH))
    return rows[0] if rows else None

data = json.load(open(os.path.join(args.dir, "matches.json")))
PRODS = data["products"]
rows = data["malls"]["kurly"]
if args.sample:
    random.seed(42); rows = random.sample(rows, args.sample)
if args.limit: rows = rows[: args.limit]

def check(row):
    res = {"kurly_id": row["id"], "goods_no": "", "kurly_name": row["name"], "matched_product_id": row["matched_product_id"],
           "matched_name": (PRODS.get(row["matched_product_id"]) or {}).get("name", ""),
           "matched_maker": (PRODS.get(row["matched_product_id"]) or {}).get("manufacturer", ""),
           "label_report_no": "", "label_maker": "", "label_kcal_100g": "", "true_food_code": "", "true_product_id": "",
           "true_name": "", "true_maker": "", "verdict": "", "note": ""}
    try:
        m = re.search(r"goods/(\d+)", row.get("url") or "")
        if not m: res["verdict"] = "error"; res["note"] = "url"; return res
        res["goods_no"] = m.group(1)
        imgs = notice_images(m.group(1))
        if not imgs: res["verdict"] = "no_label"; res["note"] = "상품정보 이미지 없음"; return res
        nums, maker, kcal = [], "", None
        for u in imgs[:3]:
            n, mk, kc = parse(ocr(u))
            nums += [x for x in n if x not in nums]; maker = maker or mk; kcal = kcal or kc
        res["label_maker"] = maker; res["label_kcal_100g"] = kcal or ""
        if not nums: res["verdict"] = "no_number"; res["note"] = "번호를 읽지 못함 (수입식품이면 번호 대신 수입자)"; return res
        for no in nums:
            items = mfds_by_report(no)
            if items:
                it = items[0]
                res["label_report_no"] = no; res["true_food_code"] = it["FOOD_CD"]
                res["true_name"] = it["FOOD_NM_KR"]; res["true_maker"] = it.get("MAKER_NM") or ""
                p = product_by_food_code(it["FOOD_CD"])
                if not p: res["verdict"] = "not_in_db"; return res
                res["true_product_id"] = p["id"]
                res["verdict"] = "same" if p["id"] == row["matched_product_id"] else "relink"
                return res
        res["label_report_no"] = nums[0]; res["verdict"] = "no_mfds"; res["note"] = "식약처에 없는 번호 (OCR 오독 가능)"
        return res
    except Exception as e:
        res["verdict"] = "error"; res["note"] = str(e)[:120]; return res

t0 = time.time()
out_path = os.path.join(args.dir, args.out)
done = 0
with open(out_path, "w", newline="", encoding="utf-8-sig") as f, ThreadPoolExecutor(args.workers) as ex:
    w = None
    for res in ex.map(check, rows):
        if w is None:
            w = csv.DictWriter(f, fieldnames=list(res.keys())); w.writeheader()
        w.writerow(res); f.flush(); done += 1
        if done % 25 == 0: print(f"{done}/{len(rows)} · {time.time()-t0:.0f}s", flush=True)

from collections import Counter
c = Counter(r["verdict"] for r in csv.DictReader(open(out_path, encoding="utf-8-sig")))
print("done", len(rows), f"{time.time()-t0:.0f}s", dict(c))
