"""
식품안전나라 품목제조보고(원재료) 수집 스크립트
- API: C002 (식품(첨가물)품목제조보고(원재료))
- 제품별 원재료 목록, 업소명(제조원), 식품유형 등 수집
- Supabase food_reports 테이블에 저장

사용법:
  # 전체 수집 (최초)
  python collect_food_reports.py --full

  # 증분 수집 (최근 7일 변경분)
  python collect_food_reports.py --days 7

  # 특정 품목유형만
  python collect_food_reports.py --food-type "건강기능식품"
"""
import os, sys, time, logging, argparse, json
from datetime import datetime, timedelta

import requests

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

# ── 환경변수 ──
FOOD_REPORT_API_KEY = os.environ.get("FOOD_REPORT_API_KEY", "")
FOOD_INGREDIENT_API_KEY = os.environ.get("FOOD_INGREDIENT_API_KEY", "")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")

# API 키 — 두 키가 같은 서비스를 호출할 수 있으므로 둘 중 하나 사용
API_KEY = FOOD_REPORT_API_KEY or FOOD_INGREDIENT_API_KEY

API_BASE = "http://openapi.foodsafetykorea.go.kr/api"
SERVICE_ID = "C002"
PAGE_SIZE = 1000  # API 최대 1000건/요청
RATE_LIMIT_DELAY = 1.5  # 시간당 100회 제한 → 안전하게 1.5초

SUPABASE_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}


# ── API 호출 ──

def fetch_page(start: int, end: int, params: dict = None) -> dict:
    """식품안전나라 API 페이지 조회"""
    url = f"{API_BASE}/{API_KEY}/{SERVICE_ID}/json/{start}/{end}"
    if params:
        param_str = "/".join(f"{k}={v}" for k, v in params.items() if v)
        if param_str:
            url += f"/{param_str}"

    for attempt in range(5):
        try:
            resp = requests.get(url, timeout=30)
            if resp.status_code == 200:
                data = resp.json()
                return data
            log.warning(f"API 응답 {resp.status_code}, 재시도 {attempt+1}/5")
            time.sleep(3 * (attempt + 1))
        except requests.exceptions.Timeout:
            log.warning(f"API 타임아웃, 재시도 {attempt+1}/5")
            time.sleep(3 * (attempt + 1))
        except Exception as e:
            log.warning(f"API 오류 ({e}), 재시도 {attempt+1}/5")
            time.sleep(3 * (attempt + 1))

    return None


def get_total_count(params: dict = None) -> int:
    """전체 데이터 건수 조회"""
    data = fetch_page(1, 1, params)
    if not data:
        return 0

    # 응답 구조: {SERVICE_ID: {total_count: N, row: [...]}}
    svc = data.get(SERVICE_ID, {})
    total = svc.get("total_count", 0) or svc.get("list_total_count", 0)

    # 에러 체크
    result = svc.get("RESULT", {})
    if result.get("CODE") and result["CODE"] != "INFO-000":
        log.error(f"API 에러: {result.get('CODE')} - {result.get('MSG')}")
        return 0

    return int(total)


def fetch_all_rows(params: dict = None, max_rows: int = 0) -> list:
    """전체 데이터 페이징 조회"""
    total = get_total_count(params)
    if total == 0:
        log.info("데이터 없음")
        return []

    log.info(f"총 {total:,}건 조회 예정")
    if max_rows > 0:
        total = min(total, max_rows)
        log.info(f"최대 {max_rows:,}건으로 제한")

    all_rows = []
    start = 1

    while start <= total:
        end = min(start + PAGE_SIZE - 1, total)
        data = fetch_page(start, end, params)

        if not data:
            log.error(f"페이지 {start}-{end} 조회 실패, 중단")
            break

        svc = data.get(SERVICE_ID, {})
        rows = svc.get("row", [])

        if not rows:
            log.warning(f"페이지 {start}-{end}: 빈 응답")
            break

        all_rows.extend(rows)

        if len(all_rows) % 10000 < PAGE_SIZE:
            log.info(f"  {len(all_rows):,}/{total:,}건 수집...")

        start = end + 1
        time.sleep(RATE_LIMIT_DELAY)

    log.info(f"수집 완료: {len(all_rows):,}건")
    return all_rows


# ── 데이터 변환 ──

def transform_rows(rows: list) -> dict:
    """API 행 데이터를 제품별로 그룹핑 + 원재료 집계"""
    products = {}  # report_no → product info

    for row in rows:
        report_no = row.get("PRDLST_REPORT_NO", "").strip()
        if not report_no:
            continue

        if report_no not in products:
            products[report_no] = {
                "report_no": report_no,
                "name": row.get("PRDLST_NM", "").strip(),
                "manufacturer": row.get("BSSH_NM", "").strip(),
                "license_no": row.get("LCNS_NO", "").strip(),
                "food_type": row.get("PRDLST_DCNM", "").strip(),
                "report_date": row.get("PRMS_DT", "").strip() or None,
                "change_date": row.get("CHNG_DT", "").strip() or None,
                "is_domestic": row.get("ETQTY_XPORT_PRDLST_YN", "N") == "N",
                "ingredients_set": set(),  # 중복 제거용
            }

        # 원재료 추가 — API는 쉼표 구분 문자열로 반환
        raw_str = row.get("RAWMTRL_NM", "").strip()
        if raw_str:
            for ing in raw_str.split(","):
                ing = ing.strip()
                if ing:
                    products[report_no]["ingredients_set"].add(ing)

    # set → 리스트 변환
    for p in products.values():
        p["ingredients"] = sorted(p["ingredients_set"])
        del p["ingredients_set"]

    return products


# ── Supabase 저장 ──

SESSION = requests.Session()
SESSION.headers.update(SUPABASE_HEADERS)


def upsert_to_supabase(products: dict, batch_size: int = 200):
    """food_reports 테이블에 upsert"""
    items = list(products.values())
    total = len(items)
    saved = 0
    errors = 0

    for i in range(0, total, batch_size):
        batch = items[i:i + batch_size]
        records = []
        for p in batch:
            records.append({
                "report_no": p["report_no"],
                "name": p["name"],
                "manufacturer": p["manufacturer"],
                "license_no": p["license_no"],
                "food_type": p["food_type"],
                "report_date": p["report_date"],
                "change_date": p["change_date"],
                "is_domestic": p["is_domestic"],
                "ingredients": p["ingredients"],
            })

        # Supabase upsert (report_no 기준)
        url = f"{SUPABASE_URL}/rest/v1/food_reports"
        headers = {**SUPABASE_HEADERS, "Prefer": "resolution=merge-duplicates,return=minimal"}

        for attempt in range(3):
            try:
                resp = SESSION.post(url, json=records, headers=headers, timeout=30)
                if resp.status_code in (200, 201):
                    saved += len(batch)
                    break
                elif resp.status_code == 409:
                    # conflict → 개별 upsert
                    for rec in records:
                        try:
                            SESSION.post(url, json=[rec], headers=headers, timeout=15)
                            saved += 1
                        except Exception:
                            errors += 1
                    break
                else:
                    log.warning(f"Supabase 응답 {resp.status_code}: {resp.text[:200]}, 재시도 {attempt+1}/3")
                    time.sleep(2)
            except Exception as e:
                log.warning(f"Supabase 오류 ({e}), 재시도 {attempt+1}/3")
                time.sleep(2)

        if (i + batch_size) % 2000 < batch_size:
            log.info(f"  저장 진행: {saved:,}/{total:,} (오류: {errors})")

    log.info(f"저장 완료: {saved:,}/{total:,} (오류: {errors})")
    return saved, errors


# ── 메인 ──

def main():
    parser = argparse.ArgumentParser(description="식품안전나라 품목제조보고 수집")
    parser.add_argument("--full", action="store_true", help="전체 수집 (최초)")
    parser.add_argument("--days", type=int, default=0, help="최근 N일 증분 수집")
    parser.add_argument("--food-type", type=str, default="", help="특정 품목유형만 수집")
    parser.add_argument("--max-rows", type=int, default=0, help="최대 수집 건수 (0=무제한)")
    parser.add_argument("--dry-run", action="store_true", help="수집만 하고 저장 안 함")
    args = parser.parse_args()

    if not API_KEY:
        log.error("FOOD_REPORT_API_KEY 또는 FOOD_INGREDIENT_API_KEY 환경변수 필요")
        sys.exit(1)

    if not args.dry_run and (not SUPABASE_URL or not SUPABASE_KEY):
        log.error("SUPABASE_URL, SUPABASE_KEY 환경변수 필요")
        sys.exit(1)

    log.info("=== 식품안전나라 품목제조보고 수집 시작 ===")

    # 요청 파라미터 구성
    params = {}

    if args.days > 0:
        change_date = (datetime.now() - timedelta(days=args.days)).strftime("%Y%m%d")
        params["CHNG_DT"] = change_date
        log.info(f"증분 수집: {change_date} 이후 변경분")
    elif not args.full:
        # 기본: 최근 7일
        change_date = (datetime.now() - timedelta(days=7)).strftime("%Y%m%d")
        params["CHNG_DT"] = change_date
        log.info(f"증분 수집: {change_date} 이후 변경분 (기본)")

    if args.food_type:
        params["PRDLST_DCNM"] = args.food_type
        log.info(f"품목유형 필터: {args.food_type}")

    # 데이터 수집
    rows = fetch_all_rows(params, max_rows=args.max_rows)

    if not rows:
        log.info("수집할 데이터 없음")
        return

    # 제품별 그룹핑
    products = transform_rows(rows)
    log.info(f"제품 수: {len(products):,}개 (원재료 포함)")

    # 통계
    with_ingredients = sum(1 for p in products.values() if p["ingredients"])
    total_ingredients = sum(len(p["ingredients"]) for p in products.values())
    log.info(f"원재료 있는 제품: {with_ingredients:,}개, 총 원재료 항목: {total_ingredients:,}개")

    if args.dry_run:
        log.info("Dry run — 저장 건너뜀")
        # 샘플 출력
        for i, (k, p) in enumerate(products.items()):
            if i >= 5:
                break
            ings = ", ".join(ing["name"] for ing in p["ingredients"][:5])
            log.info(f"  [{p['food_type']}] {p['name']} ({p['manufacturer']}) — 원재료: {ings}...")
        return

    # Supabase 저장
    saved, errors = upsert_to_supabase(products)
    log.info(f"=== 수집 완료: {saved:,}건 저장, {errors}건 오류 ===")


if __name__ == "__main__":
    main()
