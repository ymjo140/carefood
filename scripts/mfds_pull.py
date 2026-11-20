"""
식약처 식품영양성분 DB(data.go.kr FoodNtrCpntDbInfo02·03)에서 값을 받아 파일로 남긴다 — DB 는 바꾸지 않는다.
GitHub Actions(.github/workflows/mfds-sodium.yml)가 data/mfds-sodium 갈래에 data/mfds/request.json 을 올리면 돌고,
결과를 data/mfds/out/ 에 같은 갈래로 다시 올린다. 키(MFDS_API_KEY)는 GitHub 비밀값 — 오류·기록에 주소(키)를 남기지 않는다.

request.json
  {"mode": "probe", "svc": ["02", "03"]}                                — 서비스별 개수 + 1·가운데·마지막 쪽 전체 칸
  {"mode": "all", "svc": "02", "rows": 100, "fields": ["AMT_NUM1", ...]} — 모든 쪽의 식품코드 + 고른 칸 (csv.gz)
"""
import csv, gzip, json, os, subprocess, sys, time, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor

BASE = "https://apis.data.go.kr/1471000"
SVC = {"02": ("FoodNtrCpntDbInfo02", "getFoodNtrCpntDbInq02"), "03": ("FoodNtrCpntDbInfo03", "getFoodNtrCpntDbInq03")}
KEEP = ("FOOD_CD", "FOOD_NM_KR", "SERVING_SIZE", "DB_CLASS_NM", "DB_GRP_NM", "MAKER_NM", "Z10500", "NUTR_CONT")
OUT = "data/mfds/out"


def page(svc, n, rows, tries=4):
    key = os.environ["MFDS_API_KEY"]
    s, op = SVC[svc]
    url = f"{BASE}/{s}/{op}?serviceKey={urllib.parse.quote(key, safe='')}&pageNo={n}&numOfRows={rows}&type=json"
    last = ""
    for t in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                d = json.load(r)
            body = d.get("body") or {}
            items = body.get("items") or []
            if isinstance(items, dict): items = items.get("item") or []
            return int(body.get("totalCount") or 0), items
        except Exception as e:  # 주소(키)가 든 문구는 남기지 않는다
            last = type(e).__name__
            time.sleep(3 * (t + 1))
    raise RuntimeError(f"{svc} {n}쪽 실패: {last}")


def slim(it):
    return {k: v for k, v in it.items() if v not in (None, "") and (k.startswith("AMT_NUM") or k.startswith(KEEP))}


def probe(svcs):
    out = {}
    for svc in svcs:
        try:
            total, first = page(svc, 1, 100)
        except RuntimeError as e:
            out[svc] = {"error": str(e)}; continue
        last = max(1, (total + 99) // 100)
        picks = sorted({1, last // 4, last // 2, (last * 3) // 4, last} - {0})
        items = []
        for n in picks:
            items += [dict(slim(it), _page=n) for it in (first if n == 1 else page(svc, n, 100)[1])]
        out[svc] = {"total": total, "pages_100": last, "sampled_pages": picks, "items": items}
        print(f"{svc}: 전체 {total} · 견본 {len(items)}", flush=True)
    with open(f"{OUT}/probe.json", "w") as f:
        json.dump(out, f, ensure_ascii=False)


def push(msg):
    """조각 하나를 끝낼 때마다 갈래에 올린다 — 작업 시간이 다 돼 끊겨도 받은 만큼은 남는다."""
    if not os.environ.get("GITHUB_ACTIONS"): return
    subprocess.run(["git", "add", OUT], check=False)
    if subprocess.run(["git", "diff", "--cached", "--quiet"]).returncode == 0: return
    subprocess.run(["git", "commit", "-q", "-m", msg], check=False)
    for _ in range(3):
        if subprocess.run(["git", "push", "-q"]).returncode == 0: return
        subprocess.run(["git", "pull", "-q", "--rebase"], check=False)


def pull_all(svc, rows, fields, chunk=300, minutes=100, start=1):
    """chunk 쪽씩 {svc}.part-{첫쪽}.csv.gz 로 나눠 쓰고, 이미 있는 조각은 건너뛴다(다시 돌리면 이어 받기)."""
    started = time.time()
    total, _ = page(svc, 1, rows)
    pages = (total + rows - 1) // rows
    print(f"{svc}: 전체 {total} · {pages}쪽 · 조각 {chunk}쪽", flush=True)
    meta_path = f"{OUT}/{svc}.meta.json"
    meta = json.load(open(meta_path)) if os.path.exists(meta_path) else {}
    fail = set(meta.get("failed_pages") or [])
    def one(n):
        try: return n, page(svc, n, rows)[1]
        except RuntimeError as e: return n, e
    for a in range(start, pages + 1, chunk):
        b = min(pages, a + chunk - 1)
        path = f"{OUT}/{svc}.part-{a:05d}.csv.gz"
        if os.path.exists(path): continue
        if (time.time() - started) / 60 > minutes:
            print(f"시간이 다 돼 {a}쪽부터는 다음 번에 — request.json 을 다시 올리면 이어 받는다", flush=True); break
        with gzip.open(path + ".tmp", "wt", newline="") as gz, ThreadPoolExecutor(6) as ex:
            w = csv.writer(gz)
            w.writerow(["page", "FOOD_CD", "FOOD_NM_KR", *fields])
            for n, items in ex.map(one, range(a, b + 1)):
                if isinstance(items, Exception): fail.add(n); continue
                fail.discard(n)
                for it in items:
                    w.writerow([n, it.get("FOOD_CD"), it.get("FOOD_NM_KR"), *[it.get(k) for k in fields]])
        os.replace(path + ".tmp", path)
        parts = sorted(p for p in os.listdir(OUT) if p.startswith(f"{svc}.part-") and p.endswith(".csv.gz"))
        with open(meta_path, "w") as f:
            json.dump({"svc": svc, "total": total, "rows": rows, "pages": pages, "chunk": chunk, "parts": len(parts),
                       "parts_needed": (pages - start + chunk) // chunk, "start": start, "failed_pages": sorted(fail), "fields": fields}, f)
        print(f"{b}/{pages}쪽 · 실패 {len(fail)} · {round((time.time() - started) / 60)}분", flush=True)
        push(f"식약처 받은 값 {svc} {a}~{b}쪽")
    # 조각을 다 받았으면 실패한 쪽만 다시 받아 따로 쓴다
    parts = [p for p in os.listdir(OUT) if p.startswith(f"{svc}.part-") and p.endswith(".csv.gz")]
    if fail and len(parts) >= (pages - start + chunk) // chunk and (time.time() - started) / 60 <= minutes:
        n_retry = 0
        path = f"{OUT}/{svc}.retry-{int(time.time())}.csv.gz"
        with gzip.open(path, "wt", newline="") as gz:
            w = csv.writer(gz)
            w.writerow(["page", "FOOD_CD", "FOOD_NM_KR", *fields])
            for n in sorted(fail):
                _, items = one(n)
                if isinstance(items, Exception): continue
                fail.discard(n); n_retry += 1
                for it in items:
                    w.writerow([n, it.get("FOOD_CD"), it.get("FOOD_NM_KR"), *[it.get(k) for k in fields]])
        if not n_retry: os.remove(path)
        meta = json.load(open(meta_path)); meta["failed_pages"] = sorted(fail)
        with open(meta_path, "w") as f: json.dump(meta, f)
        push(f"식약처 받은 값 {svc} 다시 받은 쪽 {n_retry}")
    print(f"끝 · 실패 {len(fail)}쪽", flush=True)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    req = json.load(open("data/mfds/request.json"))
    if req.get("mode") == "all":
        pull_all(req.get("svc", "02"), int(req.get("rows", 100)), req.get("fields") or ["AMT_NUM1", "AMT_NUM3", "AMT_NUM7", "AMT_NUM8", "AMT_NUM13"],
                 start=int(req.get("from", 1)))
    else:
        svcs = req.get("svc") or ["02", "03"]
        probe(svcs if isinstance(svcs, list) else [svcs])
