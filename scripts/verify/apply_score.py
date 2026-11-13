"""
score_matches.py 의 판정(scored.csv)을 운영 DB 에 반영한다 — 사람이 판정 파일을 본 뒤에만.

  python3 scripts/verify/apply_score.py <scored.csv> --batch <이름> [--apply]

기본은 미리보기(쓰지 않음). --apply 를 붙이면 apply_link_rescore(batch, rows) 를 1,000 건씩 부르고
끝에 finish_link_rescore(batch) 로 11번가 가격을 내리고 구매 가능 여부를 다시 계산한다.

  relink : 판정이 relink 이고 새 후보 이름이 판매처 이름과 거의 같을 때(겹침 0.9 이상)만.
           후보 이름이 5글자 미만이거나 브랜드와 같으면("서울우유", "야쿠르트") 옮기지 않고 끊는다.
  unlink : 판정이 mismatch, 또는 위 조건을 못 넘은 relink.
  나머지(confirmed·risky·suspect)는 그대로. 라벨로 확인한 연결은 DB 함수가 건너뛴다.
되돌리기: select public.undo_link_rescore('<이름>');
"""
import argparse, csv, json, os, re, urllib.request
from collections import Counter

ap = argparse.ArgumentParser()
ap.add_argument("csv"); ap.add_argument("--batch", required=True); ap.add_argument("--apply", action="store_true")
a = ap.parse_args()

norm = lambda s: re.sub(r"[^0-9a-z가-힣]", "", (s or "").lower())


def action(r):
    if r["status"] == "relink":
        nn = norm(r.get("new_name"))
        if r.get("new_product_id") and float(r.get("new_jac") or 0) >= 0.9 and len(nn) >= 5 and nn != norm(r.get("brand")):
            return "relink"
        return "unlink"
    if r["status"] == "mismatch":
        return "unlink"
    return None


rows = []
for r in csv.DictReader(open(a.csv, encoding="utf-8-sig")):
    act = action(r)
    if not act:
        continue
    note = r.get("reason") or ""
    if act == "unlink" and r["status"] == "relink":
        note = "다시 이을 후보가 확실하지 않음 — " + note
    rows.append({"mall": r["mall"], "id": r["id"], "old": r["product_id"], "new": r.get("new_product_id") if act == "relink" else None,
                 "action": act, "reason": ("다시 판정: " + note)[:300]})

print("미리보기" if not a.apply else "반영", a.batch, dict(Counter((x["mall"], x["action"]) for x in rows)))
if not a.apply:
    raise SystemExit(0)

SB = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/") + "/rest/v1/rpc/"
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
H = {"apikey": KEY, **({"Authorization": f"Bearer {KEY}"} if KEY.startswith("eyJ") else {}), "Content-Type": "application/json"}


def rpc(fn, body):
    req = urllib.request.Request(SB + fn, data=json.dumps(body).encode(), headers=H, method="POST")
    with urllib.request.urlopen(req, timeout=300) as res:
        return json.loads(res.read() or "null")


done = 0
for i in range(0, len(rows), 1000):
    done += rpc("apply_link_rescore", {"p_batch": a.batch, "p_rows": rows[i:i + 1000]})
    print(f"  {min(i + 1000, len(rows))}/{len(rows)} 보냄 · 바꾼 행 {done}", flush=True)
print("마무리", rpc("finish_link_rescore", {"p_batch": a.batch}))
