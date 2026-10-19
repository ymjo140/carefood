"""
컬리 상품 ↔ MFDS(식약처) 영양DB 매칭 스크립트
- Supabase에서 데이터 가져와서 로컬에서 유사도 계산
- 결과를 다시 Supabase에 업로드
"""
import os, re, sys, time, logging
from difflib import SequenceMatcher
from concurrent.futures import ThreadPoolExecutor, as_completed

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
BATCH_SIZE = 1000
MATCH_THRESHOLD = 0.35
WORKERS = 8


def clean_name(name: str) -> str:
    """컬리 상품명 정제"""
    s = re.sub(r"^\[.*?\]\s*", "", name)
    s = re.sub(r"\s*\(.*?\)\s*$", "", s)
    s = re.sub(r"\s*\d+개입\s*", " ", s)
    s = re.sub(r"\s*\d+종\s*", " ", s)
    s = re.sub(r"\s*(택1|택\d+)\s*", "", s)
    return s.strip()


def fetch_all_paginated(table: str, select: str, filters: str = "", page_size: int = 1000):
    """Supabase REST API로 Range 헤더 기반 페이징 조회"""
    all_rows = []
    offset = 0
    while True:
        url = f"{SUPABASE_URL}/rest/v1/{table}?select={select}&limit={page_size}&offset={offset}"
        if filters:
            url += f"&{filters}"
        hdrs = {**HEADERS, "Prefer": "return=representation"}
        for attempt in range(3):
            resp = requests.get(url, headers=hdrs, timeout=30)
            if resp.status_code < 500:
                break
            time.sleep(2 * (attempt + 1))
        resp.raise_for_status()
        rows = resp.json()
        if not rows:
            break
        all_rows.extend(rows)
        offset += page_size
        if len(rows) < page_size:
            break
        if len(all_rows) % 10000 < page_size:
            log.info(f"  {table}: {len(all_rows)}건 로드...")
    return all_rows


def similarity(a: str, b: str) -> float:
    """SequenceMatcher 기반 유사도 (0~1)"""
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def token_overlap(a: str, b: str) -> float:
    """토큰 겹침 비율"""
    tokens_a = set(a.lower().split())
    tokens_b = set(b.lower().split())
    if not tokens_a or not tokens_b:
        return 0.0
    intersection = tokens_a & tokens_b
    return len(intersection) / min(len(tokens_a), len(tokens_b))


def build_token_index(mfds_products: list) -> dict:
    """MFDS 상품을 토큰별로 인덱싱 (빠른 후보 필터링용)"""
    index = {}  # token -> list of product indices
    for i, p in enumerate(mfds_products):
        tokens = set(p["name"].lower().split())
        for t in tokens:
            if len(t) >= 2:  # 1글자 토큰 무시
                if t not in index:
                    index[t] = []
                index[t].append(i)
    return index


def find_best_match(kurly_name: str, mfds_products: list, token_index: dict) -> tuple:
    """컬리 상품명에 가장 잘 맞는 MFDS 상품 찾기 (인덱스 기반)"""
    cleaned = clean_name(kurly_name)
    if not cleaned:
        return None, 0.0

    # 토큰 인덱스로 후보 수집
    query_tokens = set(cleaned.lower().split())
    candidate_counts = {}  # product_index -> matching token count
    for t in query_tokens:
        if len(t) >= 2 and t in token_index:
            for idx in token_index[t]:
                candidate_counts[idx] = candidate_counts.get(idx, 0) + 1

    if not candidate_counts:
        return None, 0.0

    # 최소 1개 토큰 겹치는 후보만, 겹침 많은 순 상위 100개
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


def batch_update(updates: list):
    """배치로 매칭 결과 업데이트 (개별 PATCH with retry)"""
    for u in updates:
        url = f"{SUPABASE_URL}/rest/v1/kurly_products?kurly_id=eq.{u['kurly_id']}"
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
                # 마지막 시도도 실패하면 무시하고 계속


def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        log.error("SUPABASE_URL, SUPABASE_KEY 환경변수 필요")
        sys.exit(1)

    log.info("=== MFDS 매칭 시작 ===")

    # 1. MFDS products 로드 (칼로리 있는 것만)
    log.info("MFDS 상품 데이터 로드 중 (상용제품만)...")
    mfds = fetch_all_paginated(
        "products",
        "id,name",
        "calories=not.is.null&is_active=eq.true&category_large=eq.상용제품",
        page_size=1000,
    )
    log.info(f"MFDS 상품: {len(mfds)}개 로드 완료")

    # 2. 매칭 대기 중인 컬리 상품 로드
    log.info("매칭 대기 컬리 상품 로드 중...")
    pending = fetch_all_paginated(
        "kurly_products",
        "id,kurly_id,name",
        "or=(match_status.is.null,match_status.eq.pending,match_status.eq.error)",
        page_size=1000,
    )
    log.info(f"매칭 대기 컬리 상품: {len(pending)}개")

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

    for i, kp in enumerate(pending, 1):
        product_id, score = find_best_match(kp["name"], mfds, token_index)

        if product_id and score >= MATCH_THRESHOLD:
            updates_buffer.append({
                "kurly_id": kp["kurly_id"],
                "product_id": product_id,
                "score": score,
                "status": "matched",
            })
            matched_count += 1
        else:
            updates_buffer.append({
                "kurly_id": kp["kurly_id"],
                "status": "no_match",
            })
            no_match_count += 1

        # 100개마다 업로드 + 진행 로그
        if len(updates_buffer) >= 100:
            batch_update(updates_buffer)
            updates_buffer = []
            log.info(f"  진행: {i}/{total} (매칭 {matched_count}, 미매칭 {no_match_count})")

    # 남은 것 업로드
    if updates_buffer:
        batch_update(updates_buffer)
        log.info(f"  진행: {total}/{total} (매칭 {matched_count}, 미매칭 {no_match_count})")

    log.info("=== 매칭 완료 ===")
    log.info(f"총: {total}개 | 매칭: {matched_count}개 ({matched_count/total*100:.1f}%) | 미매칭: {no_match_count}개")


if __name__ == "__main__":
    main()
