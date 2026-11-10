"""
식약처 식품영양성분DB(FoodNtrCpntDbInfo03)에서 식이섬유·포화지방·트랜스지방·콜레스테롤을 받아 온다.

Info03 의 성분 번호 (2026-11 실제 응답으로 확인 — 찐고구마: 수분 64.6 · 식이섬유 2.9 · 칼륨 402 · 나트륨 10,
달걀찜: 콜레스테롤 169.58, 도넛: 포화지방 11.49)
  AMT_NUM1 에너지 kcal · 2 수분 g · 3 단백질 g · 4 지방 g · 5 회분 g · 6 탄수화물 g · 7 당류 g · 8 식이섬유 g
  9 칼슘 mg · 10 철 mg · 11 인 mg · 12 칼륨 mg · 13 나트륨 mg · 23 콜레스테롤 mg · 24 포화지방산 g · 25 트랜스지방산 g

  python3 scripts/enrich_mfds03.py fetch --out /tmp/mfds03.jsonl   # 전체 페이지(100개씩)를 받아 JSONL 로
  python3 scripts/enrich_mfds03.py check --in /tmp/mfds03.jsonl    # 우리 DB 나트륨과 맞춰 보고 채울 개수
  python3 scripts/enrich_mfds03.py apply --in /tmp/mfds03.jsonl    # products_nutrient_patch 에 올린 뒤 SQL 로 반영

환경 변수: MFDS_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
"""
import argparse, json, os, sys, time, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor

BASE = "https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo03/getFoodNtrCpntDbInq03"
FIELDS = {"fiber_g": "AMT_NUM8", "sodium_mg": "AMT_NUM13", "cholesterol_mg": "AMT_NUM23", "saturated_fat_g": "AMT_NUM24", "trans_fat_g": "AMT_NUM25"}


def num(v):
    if v in (None, "", "-"): return None
    try: return float(str(v).replace(",", ""))
    except ValueError: return None


def page(key, n, rows=100, tries=4):
    url = f"{BASE}?serviceKey={urllib.parse.quote(key, safe='')}&pageNo={n}&numOfRows={rows}&type=json"
    for t in range(tries):
        try:
            d = json.load(urllib.request.urlopen(url, timeout=60))
            return d["body"]
        except Exception as e:  # 잠깐의 오류는 다시
            if t == tries - 1: raise RuntimeError(f"page {n}: {e}")
            time.sleep(3 * (t + 1))


def fetch(out):
    key = os.environ["MFDS_API_KEY"]
    total = int(page(key, 1)["totalCount"])
    pages = (total + 99) // 100
    done = set()
    if os.path.exists(out):  # 이어 받기
        for line in open(out):
            done.add(json.loads(line)["_page"])
    todo = [n for n in range(1, pages + 1) if n not in done]
    print(f"전체 {total}개 · {pages}쪽 · 남은 {len(todo)}쪽", flush=True)
    with open(out, "a") as f, ThreadPoolExecutor(4) as ex:
        for i, (n, body) in enumerate(ex.map(lambda n: (n, page(key, n)), todo), 1):
            items = body.get("items") or []
            for it in items:
                rec = {"_page": n, "code": it.get("FOOD_CD"), "basis": it.get("SERVING_SIZE")}
                for k, fld in FIELDS.items(): rec[k] = num(it.get(fld))
                f.write(json.dumps(rec, ensure_ascii=False) + "\n")
            if not items:  # 빈 쪽도 표시해 이어 받기에서 건너뛴다
                f.write(json.dumps({"_page": n, "code": None}) + "\n")
            if i % 100 == 0: print(f"{i}/{len(todo)}", flush=True); f.flush()
    print("끝", flush=True)


def rest(method, path, body=None):
    url = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/") + "/rest/v1/" + path
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    req = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json", "Prefer": "return=minimal,resolution=merge-duplicates"})
    with urllib.request.urlopen(req, timeout=120) as r:
        t = r.read()
        return json.loads(t) if t else None


def load(path):
    recs = {}
    for line in open(path):
        r = json.loads(line)
        if r.get("code"): recs[r["code"]] = r
    return recs


def ours():
    """우리 제품 food_code → (id, sodium_mg) — 1000개씩"""
    out, last = {}, ""
    while True:
        rows = rest("GET", f"products?select=id,food_code,sodium_mg&food_code=gt.{urllib.parse.quote(last)}&order=food_code.asc&limit=1000")
        if not rows: break
        for r in rows:
            if r["food_code"]: out[r["food_code"]] = (r["id"], r["sodium_mg"])
        last = rows[-1]["food_code"]
    return out


def check(path):
    recs, mine = load(path), ours()
    hit = [(c, recs[c], mine[c]) for c in recs if c in mine]
    same = sum(1 for _, r, (_, s) in hit if r["sodium_mg"] is not None and s is not None and abs(float(s) - r["sodium_mg"]) <= max(1, 0.02 * r["sodium_mg"]))
    both = sum(1 for _, r, (_, s) in hit if r["sodium_mg"] is not None and s is not None)
    print(f"받은 {len(recs)} · 우리 {len(mine)} · 겹침 {len(hit)} · 나트륨 같음 {same}/{both}")
    for k in ("fiber_g", "saturated_fat_g", "trans_fat_g", "cholesterol_mg"):
        vals = sorted(r[k] for _, r, _ in hit if r[k] is not None)
        if vals: print(f"  {k}: {len(vals)}개 · 중앙값 {vals[len(vals)//2]} · 90% {vals[int(len(vals)*0.9)]} · 최대 {vals[-1]}")
    return recs, mine, hit


def apply(path):
    recs, mine, hit = check(path)
    rows = []
    for c, r, (pid, our_na) in hit:
        # 같은 제품인지 나트륨으로 확인 — 둘 다 있으면 2% 안에서 같아야 넣는다
        na = r["sodium_mg"]
        if na is not None and our_na is not None and abs(float(our_na) - na) > max(1, 0.02 * na): continue
        row = {"id": pid}
        ok = False
        for k in ("fiber_g", "saturated_fat_g", "trans_fat_g", "cholesterol_mg"):
            v = r[k]
            # 말이 안 되는 값은 넣지 않는다 (100g 당 식이섬유 80g 초과 · 지방류 100g 초과 · 콜레스테롤 3,000mg 초과)
            if v is not None and v >= 0 and ((k == "cholesterol_mg" and v <= 3000) or (k != "cholesterol_mg" and v <= (80 if k == "fiber_g" else 100))):
                row[k] = v; ok = True
            else:
                row[k] = None
        if ok: rows.append(row)
    print(f"올릴 줄 {len(rows)}개", flush=True)
    for i in range(0, len(rows), 1000):
        rest("POST", "products_nutrient_patch?on_conflict=id", rows[i:i + 1000])
        if (i // 1000) % 20 == 0: print(f"  {i + len(rows[i:i+1000])}/{len(rows)}", flush=True)
    print("올림 끝 — 이제 SQL 로 products 에 반영", flush=True)


def bounded(k, v):
    if v is None or v < 0: return None
    if k == "cholesterol_mg": return v if v <= 3000 else None
    return v if v <= (80 if k == "fiber_g" else 100) else None


def sodium(path):
    """나트륨이 Info03 과 다른 제품 → products_sodium_patch (나트륨 + 네 칸).
    예전 가져오기가 나트륨 칸에 AMT_NUM8(식이섬유)을 읽었다 — 그게 비었을 때만 진짜 나트륨으로 넘어갔다."""
    recs, mine = load(path), ours()
    rows = []
    for code, r in recs.items():
        if code not in mine or r["sodium_mg"] is None: continue
        pid, our = mine[code]
        if our is not None and abs(float(our) - r["sodium_mg"]) <= max(1, 0.02 * r["sodium_mg"]): continue
        if our is None: continue  # 비어 있던 것은 이번 범위 밖
        row = {"id": pid, "sodium_mg": r["sodium_mg"]}
        for k in ("fiber_g", "saturated_fat_g", "trans_fat_g", "cholesterol_mg"): row[k] = bounded(k, r[k])
        rows.append(row)
    print(f"나트륨 고칠 제품 {len(rows)}개", flush=True)
    for i in range(0, len(rows), 1000):
        rest("POST", "products_sodium_patch?on_conflict=id", rows[i:i + 1000])
    print("올림 끝", flush=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["fetch", "check", "apply", "sodium"])
    ap.add_argument("--out"); ap.add_argument("--in", dest="inp")
    a = ap.parse_args()
    if a.cmd == "fetch": fetch(a.out)
    elif a.cmd == "check": check(a.inp)
    elif a.cmd == "sodium": sodium(a.inp)
    else: apply(a.inp)
