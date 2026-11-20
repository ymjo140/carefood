"""
식약처 식품영양성분 DB(data.go.kr FoodNtrCpntDbInfo02·03)에서 값을 받아 파일로 남긴다 — DB 는 바꾸지 않는다.
GitHub Actions(.github/workflows/mfds-sodium.yml)가 data/mfds-sodium 갈래에 data/mfds/request.json 을 올리면 돌고,
결과를 data/mfds/out/ 에 같은 갈래로 다시 올린다. 키(MFDS_API_KEY)는 GitHub 비밀값 — 오류·기록에 주소(키)를 남기지 않는다.

request.json
  {"mode": "probe", "svc": ["02", "03"]}                                — 서비스별 개수 + 1·가운데·마지막 쪽 전체 칸
  {"mode": "all", "svc": "02", "rows": 100, "fields": ["AMT_NUM1", ...]} — 모든 쪽의 식품코드 + 고른 칸 (csv.gz)
"""
import csv, gzip, json, os, sys, time, urllib.parse, urllib.request
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


def pull_all(svc, rows, fields):
    total, _ = page(svc, 1, rows)
    pages = (total + rows - 1) // rows
    print(f"{svc}: 전체 {total} · {pages}쪽", flush=True)
    path = f"{OUT}/{svc}.csv.gz"
    done, fail = 0, []
    with gzip.open(path, "wt", newline="") as gz, ThreadPoolExecutor(6) as ex:
        w = csv.writer(gz)
        w.writerow(["page", "FOOD_CD", "FOOD_NM_KR", *fields])
        def one(n):
            try: return n, page(svc, n, rows)[1]
            except RuntimeError as e: return n, e
        for n, items in ex.map(one, range(1, pages + 1)):
            if isinstance(items, Exception): fail.append(n); continue
            for it in items:
                w.writerow([n, it.get("FOOD_CD"), it.get("FOOD_NM_KR"), *[it.get(k) for k in fields]])
            done += 1
            if done % 200 == 0: print(f"{done}/{pages}", flush=True)
    with open(f"{OUT}/{svc}.meta.json", "w") as f:
        json.dump({"svc": svc, "total": total, "rows": rows, "pages": pages, "done": done, "failed_pages": fail, "fields": fields}, f)
    print(f"끝 · 성공 {done}쪽 · 실패 {len(fail)}쪽", flush=True)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    req = json.load(open("data/mfds/request.json"))
    if req.get("mode") == "all":
        pull_all(req.get("svc", "02"), int(req.get("rows", 100)), req.get("fields") or ["AMT_NUM1", "AMT_NUM3", "AMT_NUM7", "AMT_NUM8", "AMT_NUM13"])
    else:
        svcs = req.get("svc") or ["02", "03"]
        probe(svcs if isinstance(svcs, list) else [svcs])
