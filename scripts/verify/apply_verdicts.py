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
import argparse, csv, json, os, re, time, urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor

ap = argparse.ArgumentParser()
ap.add_argument("csv"); ap.add_argument("--table", required=True)
ap.add_argument("--apply", action="store_true"); ap.add_argument("--unlink", nargs="*", default=[])
ap.add_argument("--id-col", default="kurly_id")
ap.add_argument("--sql", default="", help="DB 에 쓰지 않고 같은 내용을 SQL 파일로")
a = ap.parse_args()

SB = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/") + "/rest/v1/"
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
H = {"apikey": KEY, **({"Authorization": f"Bearer {KEY}"} if KEY.startswith("eyJ") else {}), "Content-Type": "application/json", "Prefer": "return=minimal"}
NOW = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

rows = list(csv.DictReader(open(a.csv, encoding="utf-8-sig")))

def _n(s):
    s = re.sub(r"\[[^\]]*\]|\([^)]*\)", " ", s or "").lower()
    return re.sub(r"[^0-9a-z가-힣]", "", s)

def name_overlap(mall_name, true_name):
    """진짜 제품 이름의 글자 2개씩 중 판매처 이름에 있는 비율 — 여러 맛 묶음에서 다른 맛 번호를 읽은 경우를 거른다"""
    a_, b_ = _n(mall_name), _n(true_name)
    bg = lambda x: {x[i:i+2] for i in range(len(x) - 1)}
    B = bg(b_)
    return len(B & bg(a_)) / max(1, len(B))
def core(name):
    s = re.sub(r"\[[^\]]*\]|\([^)]*\)", " ", name or "")
    s = re.sub(r"\d+(\.\d+)?\s*(kg|g|ml|l|개입|개|입|팩|봉|캔|병|포|구|매|인분)\b", " ", s, flags=re.I)
    s = re.sub(r"\d+\s*종|택\s*\d|x\s*\d+|\*\s*\d+", " ", s, flags=re.I)
    return re.sub(r"[^0-9a-z가-힣]", "", s.lower())

def fwd_ok(r):
    """판매처 이름의 핵심 낱말이 진짜 제품 이름에 다 들어 있고 브랜드도 맞음 (예: [비비고] 미역국 → 비비고 소고기미역국)"""
    nm = lambda x: re.sub(r"[^0-9a-z가-힣]", "", (x or "").lower())
    c = core(r.get("kurly_name") or r.get("mall_name")); bg = lambda x: {x[i:i+2] for i in range(len(x) - 1)}
    B = bg(c); ov = len(B & bg(nm(r.get("true_name")))) / max(1, len(B))
    m = re.match(r"\s*\[([^\]]+)\]", r.get("kurly_name") or r.get("mall_name") or ""); b = nm(m.group(1)) if m else ""
    brand = (not b) or b[:3] in nm(r.get("true_name")) or b[:3] in nm(r.get("true_maker"))
    return ov >= 0.6 and brand

plan = []
for r in rows:
    v = r["verdict"]
    body = {"verify_status": v, "verify_note": (r.get("note") or "")[:300] or None,
            "label_report_no": r.get("label_report_no") or None, "true_product_id": r.get("true_product_id") or None,
            "verified_at": NOW}
    action = "record"
    ov = name_overlap(r.get("kurly_name") or r.get("mall_name"), r.get("true_name"))
    if v == "relink" and r.get("true_product_id") and ov < 0.35 and not fwd_ok(r):
        body["verify_status"] = "relink_check"
        body["verify_note"] = f"라벨 번호의 제품 이름이 판매처 이름과 다름(겹침 {ov:.2f}) — 여러 맛 묶음일 수 있어 사람 확인"
    elif v == "relink" and r.get("true_product_id"):
        body.update({"prev_matched_product_id": r["matched_product_id"], "matched_product_id": r["true_product_id"]})
        action = "relink"
    elif v == "not_in_db" or v in a.unlink:
        body.update({"prev_matched_product_id": r["matched_product_id"], "matched_product_id": None, "match_status": "verify_unlinked"})
        action = "unlink"
    plan.append((r[a.id_col], body, action))

print("미리보기" if not a.apply else "반영", a.table, dict(Counter(p[2] for p in plan)), "· 판정", dict(Counter(r["verdict"] for r in rows)))

def sql_lit(v):
    if v is None: return "null"
    return "'" + str(v).replace("'", "''") + "'"

if a.sql:
    # Supabase SQL Editor 에 붙여 넣어 실행하는 같은 내용 (한 트랜잭션)
    with open(a.sql, "w", encoding="utf8") as f:
        f.write(f"-- {a.table} 검증 반영 · {NOW} · {dict(Counter(p[2] for p in plan))}\n-- 되돌리기: update {a.table} set matched_product_id = prev_matched_product_id, match_status = 'matched' where prev_matched_product_id is not null;\nbegin;\n")
        rec = [p for p in plan]
        for i in range(0, len(rec), 500):
            vals = ",\n".join(
                f"({sql_lit(rid)}::uuid, {sql_lit(b['verify_status'])}, {sql_lit(b.get('verify_note'))}, {sql_lit(b.get('label_report_no'))}, {sql_lit(b.get('true_product_id'))}::uuid)"
                for rid, b, _ in rec[i:i+500])
            f.write(f"update {a.table} t set verify_status = v.s, verify_note = v.n, label_report_no = v.r, true_product_id = v.tp, verified_at = now()\nfrom (values\n{vals}\n) as v(id, s, n, r, tp) where t.id = v.id;\n")
        rel = [(rid, b) for rid, b, act in plan if act == "relink"]
        for i in range(0, len(rel), 500):
            vals = ",\n".join(f"({sql_lit(rid)}::uuid, {sql_lit(b['matched_product_id'])}::uuid)" for rid, b in rel[i:i+500])
            f.write(f"update {a.table} t set prev_matched_product_id = t.matched_product_id, matched_product_id = v.np\nfrom (values\n{vals}\n) as v(id, np) where t.id = v.id and t.prev_matched_product_id is null;\n")
        unl = [rid for rid, b, act in plan if act == "unlink"]
        for i in range(0, len(unl), 500):
            ids = ",".join(sql_lit(x) + "::uuid" for x in unl[i:i+500])
            f.write(f"update {a.table} set prev_matched_product_id = matched_product_id, matched_product_id = null, match_status = 'verify_unlinked' where id in ({ids}) and prev_matched_product_id is null;\n")
        f.write("commit;\n")
    print("SQL 저장", a.sql)

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
