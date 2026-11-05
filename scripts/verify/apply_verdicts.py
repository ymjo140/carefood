"""
판정 결과(label_judge.py 의 CSV)를 운영 DB 에 반영한다.

  python3 scripts/verify/apply_verdicts.py <judged.csv> --table kurly_products [--apply] [--unlink maker_kcal_diff]

기본은 미리보기(아무것도 쓰지 않음). --apply 를 붙여야 쓴다.

모든 행: verify_status · verify_note · label_report_no · true_product_id · verified_at 기록
relink     : prev_matched_product_id ← 지금 값, matched_product_id ← 진짜 제품   (match_status 는 matched 그대로)
not_in_db  : prev_matched_product_id ← 지금 값, matched_product_id ← null, match_status ← 'verify_unlinked'
--unlink 로 지정한 판정(예: maker_kcal_diff)도 not_in_db 와 같이 연결을 끊는다.
'verify_unlinked' 는 기존 매칭 스크립트가 다시 붙이지 않는 상태값이다 (pending·error·low_score 만 다시 본다).
되돌리기: prev_matched_product_id 를 matched_product_id 로, match_status 를 matched 로.
"""
import argparse, csv, json, os, time, urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor

ap = argparse.ArgumentParser()
ap.add_argument("csv"); ap.add_argument("--table", required=True)
ap.add_argument("--apply", action="store_true"); ap.add_argument("--unlink", nargs="*", default=[])
ap.add_argument("--id-col", default="kurly_id")
a = ap.parse_args()

SB = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/") + "/rest/v1/"
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json", "Prefer": "return=minimal"}
NOW = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

rows = list(csv.DictReader(open(a.csv, encoding="utf-8-sig")))
plan = []
for r in rows:
    v = r["verdict"]
    body = {"verify_status": v, "verify_note": (r.get("note") or "")[:300] or None,
            "label_report_no": r.get("label_report_no") or None, "true_product_id": r.get("true_product_id") or None,
            "verified_at": NOW}
    action = "record"
    if v == "relink" and r.get("true_product_id"):
        body.update({"prev_matched_product_id": r["matched_product_id"], "matched_product_id": r["true_product_id"]})
        action = "relink"
    elif v == "not_in_db" or v in a.unlink:
        body.update({"prev_matched_product_id": r["matched_product_id"], "matched_product_id": None, "match_status": "verify_unlinked"})
        action = "unlink"
    plan.append((r[a.id_col], body, action))

print("미리보기" if not a.apply else "반영", a.table, dict(Counter(p[2] for p in plan)), "· 판정", dict(Counter(r["verdict"] for r in rows)))
if not a.apply:
    raise SystemExit(0)

def patch(item):
    rid, body, _ = item
    req = urllib.request.Request(f"{SB}{a.table}?id=eq.{rid}", data=json.dumps(body).encode(), headers=H, method="PATCH")
    for i in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30): return True
        except Exception as e:
            if i == 2: print("실패", rid, e); return False
            time.sleep(1.5 * (i + 1))

with ThreadPoolExecutor(8) as ex:
    ok = sum(ex.map(patch, plan))
print("반영", ok, "/", len(plan))
