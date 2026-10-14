"""
식약처 식품영양성분DB(I2790) → Supabase 적재 파이프라인
=====================================================
사용법:
  1. .env 파일에 API 키 설정
  2. pip install requests supabase python-dotenv
  3. python ingest_mfds.py

환경변수:
  MFDS_API_KEY      - 식품안전나라 OpenAPI 인증키 (https://openapi.foodsafetykorea.go.kr)
  SUPABASE_URL      - Supabase 프로젝트 URL
  SUPABASE_KEY      - Supabase service_role 키 (anon 아님 — RLS 우회 필요)
"""

import os
import re
import sys
import json
import time
import logging
from typing import Optional
from datetime import datetime

import requests
from dotenv import load_dotenv
from supabase import create_client, Client

# ─── 로깅 설정 ──────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("ingest.log", encoding="utf-8"),
    ],
)
log = logging.getLogger(__name__)

# ─── 환경변수 ────────────────────────────────────────────
load_dotenv()

MFDS_API_KEY   = os.getenv("MFDS_API_KEY", "")
SUPABASE_URL   = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY   = os.getenv("SUPABASE_KEY", "")   # service_role key

BASE_URL = "https://openapi.foodsafetykorea.go.kr/api"
SERVICE_ID = "I2790"                               # 식품영양성분DB
BATCH_SIZE = 1000                                  # API 최대 1,000건/요청
UPSERT_CHUNK = 500                                 # Supabase upsert 단위

# ─── 매운맛 키워드 사전 ──────────────────────────────────
# DB의 spicy_keywords 시드와 동일 — 인라인으로도 사용 가능
SPICY_KEYWORDS = [
    ("청양고추", 5, 1.5),
    ("하바네로", 5, 1.5),
    ("캡사이신", 4, 1.3),
    ("고춧가루", 3, 1.0),
    ("고추장",   3, 0.8),
    ("고추",     3, 1.0),   # '고추장' 이후에 매칭해야 중복 방지
    ("칠리",     3, 1.0),
    ("할라피뇨", 3, 1.2),
    ("라유",     2, 0.8),
    ("와사비",   2, 0.8),
    ("후추",     1, 0.5),
    ("겨자",     1, 0.5),
    ("생강",     1, 0.3),
]


# ═══════════════════════════════════════════════════════
#  1. 식약처 API 호출
# ═══════════════════════════════════════════════════════

def fetch_total_count(api_key: str) -> int:
    """전체 데이터 건수 조회 (1건만 가져와서 total_count 확인)."""
    url = f"{BASE_URL}/{api_key}/{SERVICE_ID}/json/1/1"
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    data = resp.json()

    result = data.get(SERVICE_ID, {})
    if "RESULT" in result and result["RESULT"].get("CODE") != "INFO-000":
        raise RuntimeError(f"API 오류: {result['RESULT']}")

    total = int(result.get("total_count", 0))
    log.info(f"전체 데이터 건수: {total:,}")
    return total


def fetch_batch(api_key: str, start: int, end: int) -> list[dict]:
    """start~end 범위의 데이터를 JSON으로 가져온다."""
    url = f"{BASE_URL}/{api_key}/{SERVICE_ID}/json/{start}/{end}"
    for attempt in range(3):
        try:
            resp = requests.get(url, timeout=60)
            resp.raise_for_status()
            data = resp.json()
            result = data.get(SERVICE_ID, {})

            if "RESULT" in result:
                code = result["RESULT"].get("CODE", "")
                if code == "INFO-200":
                    # 해당 범위에 데이터 없음
                    return []
                if code != "INFO-000":
                    log.warning(f"API 경고 [{code}]: {result['RESULT'].get('MSG')}")
                    return []

            return result.get("row", [])

        except (requests.RequestException, json.JSONDecodeError) as e:
            log.warning(f"요청 실패 (시도 {attempt+1}/3): {e}")
            time.sleep(2 ** attempt)

    log.error(f"3회 재시도 실패: {start}~{end}")
    return []


def fetch_all(api_key: str) -> list[dict]:
    """전체 데이터를 배치로 가져온다."""
    total = fetch_total_count(api_key)
    all_rows = []

    for start in range(1, total + 1, BATCH_SIZE):
        end = min(start + BATCH_SIZE - 1, total)
        rows = fetch_batch(api_key, start, end)
        all_rows.extend(rows)
        log.info(f"  수집: {start:>6}~{end:>6}  ({len(rows):>4}건)  누적 {len(all_rows):,}")
        time.sleep(0.3)  # 서버 부하 방지

    log.info(f"수집 완료: 총 {len(all_rows):,}건")
    return all_rows


# ═══════════════════════════════════════════════════════
#  2. 데이터 변환
# ═══════════════════════════════════════════════════════

def safe_numeric(value) -> Optional[float]:
    """빈 문자열, '-', 'N/A' 등을 None으로, 나머지를 float로."""
    if value is None:
        return None
    s = str(value).strip()
    if s in ("", "-", "N/A", "n/a", "없음"):
        return None
    # 쉼표 제거
    s = s.replace(",", "")
    try:
        return float(s)
    except ValueError:
        return None


def calc_spicy_score(ingredients_raw: Optional[str]) -> int:
    """
    원재료명 텍스트에서 매운맛 키워드를 파싱하여 spicy_score(0~5) 산출.

    로직:
    - 각 키워드가 원재료에 등장하면 (base_score × weight) 누적
    - 원재료 앞쪽(상위 50%)에 등장 시 ×1.3 위치 가중치
    - 최종 점수를 0~5 스케일로 클램핑
    """
    if not ingredients_raw:
        return 0

    text = ingredients_raw.lower()
    text_len = len(text)
    total_weighted = 0.0
    match_count = 0

    for keyword, base_score, weight in SPICY_KEYWORDS:
        idx = text.find(keyword)
        if idx >= 0:
            # 위치 가중치: 앞쪽(주재료)에 있을수록 높음
            position_weight = 1.3 if (idx / max(text_len, 1)) < 0.5 else 1.0
            total_weighted += base_score * weight * position_weight
            match_count += 1

    if match_count == 0:
        return 0

    # 정규화: 최대 가능 점수(청양고추+하바네로 앞쪽) 대비 비율 → 1~5
    raw = total_weighted / match_count  # 평균 점수
    score = min(round(raw), 5)
    return max(score, 1) if match_count > 0 else 0


def transform_row(row: dict) -> dict:
    """API 응답 1건 → products 테이블 레코드로 변환."""
    ingredients_raw = row.get("SUB_REF_NAME") or None  # 참고문헌/원재료명

    return {
        "food_code":        row.get("FOOD_CD"),
        "name":             row.get("DESC_KOR", "").strip(),
        "manufacturer":     row.get("MAKER_NAME") or None,
        "category_large":   row.get("GROUP_NAME") or None,

        # 영양성분 (I2790 제공 9개)
        "serving_size_g":   safe_numeric(row.get("SERVING_SIZE")),
        "calories":         safe_numeric(row.get("NUTR_CONT1")),
        "carbs_g":          safe_numeric(row.get("NUTR_CONT2")),
        "protein_g":        safe_numeric(row.get("NUTR_CONT3")),
        "fat_g":            safe_numeric(row.get("NUTR_CONT4")),
        "sugar_g":          safe_numeric(row.get("NUTR_CONT5")),
        "sodium_mg":        safe_numeric(row.get("NUTR_CONT6")),
        "cholesterol_mg":   safe_numeric(row.get("NUTR_CONT7")),
        "saturated_fat_g":  safe_numeric(row.get("NUTR_CONT8")),
        "trans_fat_g":      safe_numeric(row.get("NUTR_CONT9")),

        # I2790에서 미제공 → null (추후 보강 데이터로 채움)
        "potassium_mg":     None,
        "calcium_mg":       None,
        "phosphorus_mg":    None,
        "iron_mg":          None,
        "fiber_g":          None,
        "vitamin_a_ug":     None,
        "vitamin_c_mg":     None,
        "vitamin_d_ug":     None,

        # 원재료 / 매운맛
        "ingredients_raw":  ingredients_raw,
        "spicy_score":      calc_spicy_score(ingredients_raw),
        "spicy_source":     "parsed",

        # 메타
        "data_source":      "mfds_api",
        "is_active":        True,
    }


def transform_all(raw_rows: list[dict]) -> list[dict]:
    """전체 데이터 변환 + 이름 없는 행 제거."""
    products = []
    skipped = 0
    for row in raw_rows:
        name = (row.get("DESC_KOR") or "").strip()
        if not name:
            skipped += 1
            continue
        products.append(transform_row(row))

    log.info(f"변환 완료: {len(products):,}건 (스킵 {skipped}건)")
    return products


# ═══════════════════════════════════════════════════════
#  3. Supabase 적재 (Upsert)
# ═══════════════════════════════════════════════════════

def upsert_to_supabase(supabase: Client, products: list[dict]):
    """food_code 기준 upsert — 기존 데이터 보존, 신규만 추가."""
    total = len(products)
    inserted = 0
    errors = 0

    for i in range(0, total, UPSERT_CHUNK):
        chunk = products[i : i + UPSERT_CHUNK]
        try:
            result = (
                supabase.table("products")
                .upsert(chunk, on_conflict="food_code")
                .execute()
            )
            inserted += len(chunk)
            log.info(f"  upsert {i+1}~{i+len(chunk)} / {total}")
        except Exception as e:
            errors += len(chunk)
            log.error(f"  upsert 실패 ({i+1}~{i+len(chunk)}): {e}")

    log.info(f"적재 완료: 성공 {inserted:,} / 실패 {errors}")


# ═══════════════════════════════════════════════════════
#  4. 통계 리포트
# ═══════════════════════════════════════════════════════

def print_stats(products: list[dict]):
    """적재 전 데이터 품질 리포트."""
    total = len(products)
    has_sodium    = sum(1 for p in products if p["sodium_mg"] is not None)
    has_sugar     = sum(1 for p in products if p["sugar_g"] is not None)
    has_fat       = sum(1 for p in products if p["fat_g"] is not None)
    has_calories  = sum(1 for p in products if p["calories"] is not None)
    spicy_gt0     = sum(1 for p in products if p["spicy_score"] > 0)

    log.info("=" * 50)
    log.info("데이터 품질 리포트")
    log.info("=" * 50)
    log.info(f"  전체 제품수:           {total:>8,}")
    log.info(f"  나트륨 데이터 있음:    {has_sodium:>8,} ({has_sodium/total*100:.1f}%)")
    log.info(f"  당류 데이터 있음:      {has_sugar:>8,} ({has_sugar/total*100:.1f}%)")
    log.info(f"  지방 데이터 있음:      {has_fat:>8,} ({has_fat/total*100:.1f}%)")
    log.info(f"  열량 데이터 있음:      {has_calories:>8,} ({has_calories/total*100:.1f}%)")
    log.info(f"  매운맛 점수 > 0:       {spicy_gt0:>8,} ({spicy_gt0/total*100:.1f}%)")
    log.info("=" * 50)

    # 나트륨 분포 (맛 매핑 기초 데이터)
    sodium_buckets = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
    for p in products:
        na = p["sodium_mg"]
        if na is None:
            continue
        if na < 300:
            sodium_buckets[1] += 1
        elif na < 500:
            sodium_buckets[2] += 1
        elif na < 800:
            sodium_buckets[3] += 1
        elif na < 1200:
            sodium_buckets[4] += 1
        else:
            sodium_buckets[5] += 1

    log.info("나트륨 분포 (짠맛 레벨별):")
    labels = {
        1: "싱거운 (0~300mg)",
        2: "약한   (300~500mg)",
        3: "보통   (500~800mg)",
        4: "짠     (800~1200mg)",
        5: "매우짠 (1200mg+)",
    }
    for level, count in sodium_buckets.items():
        pct = count / max(has_sodium, 1) * 100
        bar = "█" * int(pct / 2)
        log.info(f"  레벨 {level} {labels[level]}: {count:>6,} ({pct:>5.1f}%) {bar}")


# ═══════════════════════════════════════════════════════
#  5. 메인 실행
# ═══════════════════════════════════════════════════════

def main():
    # 환경변수 체크
    if not MFDS_API_KEY:
        log.error("MFDS_API_KEY가 설정되지 않았습니다. .env 파일을 확인하세요.")
        log.info("API 키 발급: https://openapi.foodsafetykorea.go.kr → 회원가입 → 인증키 발급")
        sys.exit(1)

    log.info("=" * 50)
    log.info("식약처 식품영양성분DB → Supabase 적재 시작")
    log.info(f"시작 시간: {datetime.now().isoformat()}")
    log.info("=" * 50)

    # Step 1: API에서 전체 데이터 수집
    log.info("[1/4] 식약처 API 호출 중...")
    raw_rows = fetch_all(MFDS_API_KEY)

    if not raw_rows:
        log.error("수집된 데이터가 없습니다. API 키와 네트워크를 확인하세요.")
        sys.exit(1)

    # Step 2: 변환
    log.info("[2/4] 데이터 변환 중...")
    products = transform_all(raw_rows)

    # Step 3: 통계 리포트
    log.info("[3/4] 데이터 품질 검증 중...")
    print_stats(products)

    # (선택) JSON 백업 저장
    backup_path = f"mfds_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(backup_path, "w", encoding="utf-8") as f:
        json.dump(products, f, ensure_ascii=False, indent=2)
    log.info(f"백업 저장: {backup_path}")

    # Step 4: Supabase 적재
    if not SUPABASE_URL or not SUPABASE_KEY:
        log.warning("SUPABASE_URL/KEY 미설정 — 적재 스킵 (JSON 백업만 저장됨)")
        log.info("Supabase 설정 후 다시 실행하세요.")
        return

    log.info("[4/4] Supabase 적재 중...")
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    upsert_to_supabase(supabase, products)

    log.info("=" * 50)
    log.info(f"완료! 총 {len(products):,}건 처리")
    log.info(f"종료 시간: {datetime.now().isoformat()}")
    log.info("=" * 50)


if __name__ == "__main__":
    main()
