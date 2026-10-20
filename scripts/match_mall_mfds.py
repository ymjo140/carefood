"""
쇼핑몰 상품 ↔ MFDS(식약처) 영양DB 매칭 스크립트 (범용)
- kurly_products, oasis_products, homeplus_products 공용
- Supabase에서 데이터 가져와서 로컬에서 유사도 계산 → 결과 업로드

사용법:
  python match_mall_mfds.py --table oasis_products --id-col oasis_id
  python match_mall_mfds.py --table homeplus_products --id-col homeplus_id
  python match_mall_mfds.py --table kurly_products --id-col kurly_id
"""
import os, re, sys, time, logging, argparse
from difflib import SequenceMatcher

import requests

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")
HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}
MATCH_THRESHOLD = 0.35


def clean_name(name: str) -> str:
    """상품명 정제 (브랜드 태그, 수량 등 제거)"""
    s = re.sub(r"^\[.*?\]\s*", "", name)
    s = re.sub(r"\s*\(.*?\)\s*$", "", s)
    s = re.sub(r"\s*\d+개입\s*", " ", s)
    s = re.sub(r"\s*\d+종\s*", " ", s)
    s = re.sub(r"\s*(택1|택\d+)\s*", "", s)
    s = re.sub(r"\s*\d+(g|kg|ml|l|L)\s*", " ", s)
    return s.strip()


def fetch_all_paginated(table: str, select: str, filters: str = "", page_size: int = 1000):
    """Supabase REST API로 커서 기반 페이징 조회 (대용량 테이블 대응)"""
    all_rows = []
    last_id = ""  # UUID 커서 기반 페이징
    hdrs = {**HEADERS, "Prefer": "return=representation"}

    while True:
        url = f"{SUPABASE_URL}/rest/v1/{table}?select={select}&limit={page_size}&order=id.asc"
        if filters:
            url += f"&{filters}"
        if last_id:
            url += f"&id=gt.{last_id}"

        rows = None
        for attempt in range(5):
            try:
                resp = requests.get(url, headers=hdrs, timeout=60)
                if resp.status_code == 200:
                    rows = resp.json()
                    break
                if resp.status_code >= 500:
                    log.warning(f"  {table}: 서버 에러 {resp.status_code}, 재시도 {attempt+1}/5...")
                    time.sleep(3 * (attempt + 1))
                    continue
                resp.raise_for_status()
            except requests.exceptions.Timeout:
                log.warning(f"  {table}: 타임아웃, 재시도 {attempt+1}/5...")
                time.sleep(3 * (attempt + 1))
            except Exception as e:
                log.warning(f"  {table}: 요청 실패 ({e}), 재시도 {attempt+1}/5...")
                time.sleep(3 * (attempt + 1))

        if rows is None:
            log.error(f"  {table}: {len(all_rows)}건까지 로드 후 중단 (마지막 시도 실패)")
            break
        if not rows:
            break

        all_rows.extend(rows)
        last_id = rows[-1]["id"]

        if len(rows) < page_size:
            break
        if len(all_rows) % 10000 < page_size:
            log.info(f"  {table}: {len(all_rows)}건 로드...")

    return all_rows


def similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def build_token_index(mfds_products: list) -> dict:
    index = {}
    for i, p in enumerate(mfds_products):
        tokens = set(p["name"].lower().split())
        for t in tokens:
            if len(t) >= 2:
                if t not in index:
                    index[t] = []
                index[t].append(i)
    return index


def find_best_match(product_name: str, mfds_products: list, token_index: dict) -> tuple:
    cleaned = clean_name(product_name)
    if not cleaned:
        return None, 0.0

    query_tokens = set(cleaned.lower().split())
    candidate_counts = {}
    for t in query_tokens:
        if len(t) >= 2 and t in token_index:
            for idx in token_index[t]:
                candidate_counts[idx] = candidate_counts.get(idx, 0) + 1

    if not candidate_counts:
        return None, 0.0

    min_tokens = max(1, len(query_tokens) // 3)
    candidates = [
        (idx, cnt) for idx, cnt in candidate_counts.items() if cnt >= min_tokens
    ]
    candidates.sort(key=lambda x: x[1], reverse=True)
    candidates = candidates[:100]

    best_id = None
    best_score = 0.0

    for idx, _ in candidates:
        p = mfds_products[idx]
        score = similarity(cleaned, p["name"])
        p_tokens = set(p["name"].lower().split())
        if query_tokens and p_tokens:
            overlap = len(query_tokens & p_tokens) / min(len(query_tokens), len(p_tokens))
        else:
            overlap = 0.0
        combined = score * 0.6 + overlap * 0.4
        if combined > best_score:
            best_score = combined
            best_id = p["id"]

    return best_id, best_score


SESSION = requests.Session()
SESSION.headers.update(HEADERS)


def batch_update(updates: list, table: str, id_col: str):
    """매칭 결과를 개별 PATCH로 업데이트"""
    for u in updates:
        url = f"{SUPABASE_URL}/rest/v1/{table}?{id_col}=eq.{u['item_id']}"
        data = {"match_status": u["status"]}
        if u.get("product_id"):
            data["matched_product_id"] = u["product_id"]
            data["match_score"] = round(u.get("score", 0), 4)
        for attempt in range(3):
            try:
                resp = SESSION.patch(url, json=data, timeout=15)
                resp.raise_for_status()
                break
            except Exception:
                if attempt < 2:
                    time.sleep(1 * (attempt + 1))


def main():
    parser = argparse.ArgumentParser(description="쇼핑몰 ↔ MFDS 매칭")
    parser.add_argument("--table", required=True, help="쇼핑몰 테이블명 (예: oasis_products)")
    parser.add_argument("--id-col", required=True, help="쇼핑몰 고유ID 컬럼 (예: oasis_id)")
    args = parser.parse_args()

    if not SUPABASE_URL or not SUPABASE_KEY:
        log.error("SUPABASE_URL, SUPABASE_KEY 환경변수 필요")
        sys.exit(1)

    table = args.table
    id_col = args.id_col

    log.info(f"=== {table} MFDS 매칭 시작 ===")

    # 1. MFDS products 로드
    log.info("MFDS 상품 데이터 로드 중 (상용제품만)...")
    mfds = fetch_all_paginated(
        "products",
        "id,name",
        "calories=not.is.null&is_active=eq.true&category_large=eq.상용제품",
        page_size=1000,
    )
    log.info(f"MFDS 상품: {len(mfds)}개 로드 완료")

    # 2. 매칭 대기 상품 로드
    log.info(f"{table} 매칭 대기 상품 로드 중...")
    pending = fetch_all_paginated(
        table,
        f"id,{id_col},name",
        "or=(match_status.is.null,match_status.eq.pending,match_status.eq.error)",
        page_size=1000,
    )
    log.info(f"매칭 대기: {len(pending)}개")

    if not pending:
        log.info("매칭할 상품 없음")
        return

    # 3. 토큰 인덱스 구축
    log.info("토큰 인덱스 구축 중...")
    token_index = build_token_index(mfds)
    log.info(f"인덱스 완료: {len(token_index)}개 토큰")

    # 4. 매칭 실행
    matched_count = 0
    no_match_count = 0
    total = len(pending)
    updates_buffer = []

    for i, item in enumerate(pending, 1):
        product_id, score = find_best_match(item["name"], mfds, token_index)

        if product_id and score >= MATCH_THRESHOLD:
            updates_buffer.append({
                "item_id": item[id_col],
                "product_id": product_id,
                "score": score,
                "status": "matched",
            })
            matched_count += 1
        else:
            updates_buffer.append({
                "item_id": item[id_col],
                "status": "no_match",
            })
            no_match_count += 1

        if len(updates_buffer) >= 100:
            batch_update(updates_buffer, table, id_col)
            updates_buffer = []
            log.info(f"  진행: {i}/{total} (매칭 {matched_count}, 미매칭 {no_match_count})")

    if updates_buffer:
        batch_update(updates_buffer, table, id_col)
        log.info(f"  완료: {total}/{total} (매칭 {matched_count}, 미매칭 {no_match_count})")

    log.info(f"=== {table} 매칭 완료 ===")
    log.info(f"총: {total}개 | 매칭: {matched_count}개 ({matched_count/total*100:.1f}%) | 미매칭: {no_match_count}개")


if __name__ == "__main__":
    main()
