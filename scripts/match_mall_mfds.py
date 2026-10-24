"""
쇼핑몰 상품 ↔ MFDS(식약처) 영양DB 매칭 스크립트 (범용) v2
- kurly_products, oasis_products, homeplus_products, st11_products 공용
- Supabase에서 데이터 가져와서 로컬에서 유사도 계산 → 결과 업로드

v2 개선:
- 제조사/브랜드 비교 추가 (쇼핑몰 [브랜드] ↔ MFDS manufacturer)
- 중량/용량 불일치 감점
- 임계값 0.35 → 0.7 상향
- low_score 아이템도 재매칭 대상

사용법:
  python match_mall_mfds.py --table oasis_products --id-col oasis_id
  python match_mall_mfds.py --table homeplus_products --id-col homeplus_id
  python match_mall_mfds.py --table kurly_products --id-col kurly_id
  python match_mall_mfds.py --table st11_products --id-col st11_id
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
MATCH_THRESHOLD = 0.7


# ──────────────── 텍스트 정제 ────────────────

def extract_brand(name: str) -> str:
    """상품명에서 [브랜드] 추출"""
    m = re.match(r"^\[(.+?)\]", name)
    return m.group(1).strip() if m else ""


def extract_weight(name: str) -> tuple:
    """상품명에서 중량/용량 추출 → (값_g_or_ml, 단위종류)"""
    m = re.search(r"(\d+(?:\.\d+)?)\s*(g|kg|ml|l|mL|리터)\b", name, re.I)
    if not m:
        return None, None
    val = float(m.group(1))
    unit = m.group(2).lower()
    if unit in ("kg", "리터", "l"):
        val *= 1000
        unit = "g" if unit == "kg" else "ml"
    if unit == "ml":
        unit = "ml"
    else:
        unit = "g"
    return val, unit


def clean_name(name: str) -> str:
    """상품명 정제 — 핵심 제품명만 남기기"""
    s = re.sub(r"^\[.*?\]\s*", "", name)           # [브랜드] 제거
    s = re.sub(r"\s*\(.*?\)\s*", " ", s)           # (부가정보) 제거
    # "x 12개입", "X 3종", "× 24" 등 수량 표현 먼저 제거
    s = re.sub(r"\s*[xX×\*]\s*\d+\s*(개입|입|팩|봉|ea|개)?", " ", s)
    s = re.sub(r"\s*\d+\s*(개입|입|팩|봉|ea)\s*", " ", s)
    s = re.sub(r"\s*\d+종\s*", " ", s)
    s = re.sub(r"\s*(택1|택\d+)\s*", "", s)
    s = re.sub(r"\s*\d+(?:\.\d+)?\s*(g|kg|ml|l|mL|리터)\b", " ", s, flags=re.I)
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def normalize_manufacturer(name: str) -> str:
    """제조사명 정규화 (비교용)"""
    s = name.lower().strip()
    # 법인 유형 제거
    s = re.sub(r"[㈜]", "", s)
    s = re.sub(r"\(주\)|\(유\)|\(합\)", "", s)
    s = re.sub(r"주식회사|유한회사|합자회사|사단법인|재단법인|농업회사법인", "", s)
    # 공장/지점 제거
    s = re.sub(r"\s*(제?\d*공장|본사|지점|센터|본점)\s*$", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def manufacturer_match_score(brand: str, manufacturer: str) -> float:
    """쇼핑몰 브랜드 ↔ MFDS 제조사 유사도 (0~1)"""
    if not brand or not manufacturer:
        return 0.0
    b = normalize_manufacturer(brand)
    m = normalize_manufacturer(manufacturer)
    if not b or not m:
        return 0.0
    # 포함 관계 체크 (한쪽이 다른 쪽에 포함)
    if len(b) >= 2 and len(m) >= 2:
        if b in m or m in b:
            return 1.0
    return SequenceMatcher(None, b, m).ratio()


def weight_penalty(w1: tuple, w2: tuple) -> float:
    """중량 불일치 시 감점 (0 ~ -0.15)"""
    val1, unit1 = w1
    val2, unit2 = w2
    if val1 is None or val2 is None:
        return 0.0  # 비교 불가 → 감점 없음
    if unit1 != unit2:
        return -0.1  # 단위 종류 다름
    ratio = max(val1, val2) / max(min(val1, val2), 0.1)
    if ratio > 3:
        return -0.15  # 3배 이상 차이
    elif ratio > 1.5:
        return -0.1   # 1.5배 이상 차이
    return 0.0


# ──────────────── 데이터 로딩 ────────────────

def fetch_all_paginated(table: str, select: str, filters: str = "", page_size: int = 1000):
    """Supabase REST API로 커서 기반 페이징 조회"""
    all_rows = []
    last_id = ""
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
            log.error(f"  {table}: {len(all_rows)}건까지 로드 후 중단")
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


# ──────────────── 매칭 엔진 ────────────────

def build_token_index(mfds_products: list) -> dict:
    """MFDS 상품명 토큰 역인덱스"""
    index = {}
    for i, p in enumerate(mfds_products):
        tokens = set(p["clean_name"].lower().split())
        for t in tokens:
            if len(t) >= 2:
                if t not in index:
                    index[t] = []
                index[t].append(i)
    return index


def find_best_match(
    product_name: str,
    mfds_products: list,
    token_index: dict,
) -> tuple:
    """개선된 매칭: 이름 유사도 + 제조사 비교 + 중량 비교"""
    brand = extract_brand(product_name)
    cleaned = clean_name(product_name)
    mall_weight = extract_weight(product_name)

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

    # 토큰 2개 이상 겹쳐야 후보 (1개만 겹치면 제외)
    min_tokens = max(1, len(query_tokens) // 2)
    candidates = [
        (idx, cnt) for idx, cnt in candidate_counts.items() if cnt >= min_tokens
    ]
    candidates.sort(key=lambda x: x[1], reverse=True)
    candidates = candidates[:80]

    best_id = None
    best_score = 0.0

    for idx, _ in candidates:
        p = mfds_products[idx]

        # (1) 이름 유사도 (SequenceMatcher)
        name_sim = SequenceMatcher(None, cleaned.lower(), p["clean_name"].lower()).ratio()

        # (2) 토큰 오버랩
        p_tokens = set(p["clean_name"].lower().split())
        if query_tokens and p_tokens:
            overlap = len(query_tokens & p_tokens) / max(len(query_tokens), len(p_tokens))
        else:
            overlap = 0.0

        # (3) 제조사 보너스 (0 ~ +0.15)
        mfr_bonus = 0.0
        if brand and p.get("manufacturer"):
            mfr_sim = manufacturer_match_score(brand, p["manufacturer"])
            if mfr_sim >= 0.6:
                mfr_bonus = 0.15
            elif mfr_sim >= 0.4:
                mfr_bonus = 0.08

        # (4) 중량 감점 (0 ~ -0.15)
        mfds_weight = extract_weight(p["name"])
        w_penalty = weight_penalty(mall_weight, mfds_weight)

        # 종합 점수: 이름유사도 50% + 토큰오버랩 30% + 제조사보너스 + 중량감점
        combined = name_sim * 0.5 + overlap * 0.3 + mfr_bonus + w_penalty

        # 추가 보정: 핵심 토큰이 전부 포함되면 보너스
        if len(query_tokens) >= 2 and query_tokens.issubset(p_tokens):
            combined += 0.1

        if combined > best_score:
            best_score = combined
            best_id = p["id"]

    return best_id, best_score


# ──────────────── 업데이트 ────────────────

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
        else:
            data["matched_product_id"] = None
            data["match_score"] = None
        for attempt in range(3):
            try:
                resp = SESSION.patch(url, json=data, timeout=15)
                resp.raise_for_status()
                break
            except Exception:
                if attempt < 2:
                    time.sleep(1 * (attempt + 1))


# ──────────────── 메인 ────────────────

def main():
    parser = argparse.ArgumentParser(description="쇼핑몰 ↔ MFDS 매칭 v2")
    parser.add_argument("--table", required=True, help="쇼핑몰 테이블명")
    parser.add_argument("--id-col", required=True, help="쇼핑몰 고유ID 컬럼")
    args = parser.parse_args()

    if not SUPABASE_URL or not SUPABASE_KEY:
        log.error("SUPABASE_URL, SUPABASE_KEY 환경변수 필요")
        sys.exit(1)

    table = args.table
    id_col = args.id_col

    log.info(f"=== {table} MFDS 매칭 v2 시작 ===")
    log.info(f"임계값: {MATCH_THRESHOLD}")

    # 1. MFDS products 로드 (제조사 포함)
    log.info("MFDS 상품 데이터 로드 중 (상용제품만, 제조사 포함)...")
    mfds = fetch_all_paginated(
        "products",
        "id,name,manufacturer",
        "calories=not.is.null&is_active=eq.true&category_large=eq.상용제품",
        page_size=1000,
    )
    log.info(f"MFDS 상품: {len(mfds)}개 로드 완료")

    # clean_name 전처리
    for p in mfds:
        p["clean_name"] = clean_name(p["name"])

    # 2. 매칭 대기 상품 로드 (pending + low_score 포함)
    log.info(f"{table} 매칭 대기 상품 로드 중...")
    pending = fetch_all_paginated(
        table,
        f"id,{id_col},name",
        "or=(match_status.is.null,match_status.eq.pending,match_status.eq.error,match_status.eq.low_score)",
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
            if i % 500 == 0:
                log.info(f"  진행: {i}/{total} (매칭 {matched_count}, 미매칭 {no_match_count})")

    if updates_buffer:
        batch_update(updates_buffer, table, id_col)

    log.info(f"=== {table} 매칭 v2 완료 ===")
    log.info(f"총: {total}개 | 매칭: {matched_count}개 ({matched_count/total*100:.1f}%) | 미매칭: {no_match_count}개")


if __name__ == "__main__":
    main()
