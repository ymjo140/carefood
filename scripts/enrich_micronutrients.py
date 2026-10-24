"""
건강기능식품 영양성분 데이터로 기존 products의 미량영양소 보강

data.go.kr 전국건강기능식품영양성분정보표준데이터 (15155983)를 활용해
기존 MFDS products 테이블의 vitamin_c_mg, iron_mg, calcium_mg 등을 채움.

사용법:
  MFDS_API_KEY=... SUPABASE_URL=... SUPABASE_KEY=... python enrich_micronutrients.py

참고:
  - 기존 products와 식품코드 또는 이름 기반 매칭
  - 이미 값이 있는 컬럼은 덮어쓰지 않음 (0이면 보강)
"""

import os
import re
import sys
import time
import logging
from typing import Optional

import requests
from supabase import create_client, Client

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

API_KEY = os.environ.get("MFDS_API_KEY", "")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "") or os.environ.get("SUPABASE_KEY", "")

# 건강기능식품 영양성분 API 엔드포인트
# 표준데이터 파일 다운로드를 사용 (API보다 안정적)
FILE_URL = "https://www.data.go.kr/data/15155983/standard.do"

# data.go.kr OpenAPI 엔드포인트 (건강기능식품)
API_BASE = "https://apis.data.go.kr/1471000/HtfbInfoService02/getHtfbInfo02"


def safe_float(val) -> Optional[float]:
    if val is None or val == "" or val == "-" or val == "N/A":
        return None
    try:
        v = float(str(val).replace(",", ""))
        return v if v >= 0 else None
    except (ValueError, TypeError):
        return None


def fetch_page(page_no: int, num_rows: int = 100) -> list:
    """API에서 1페이지 조회"""
    params = {
        "serviceKey": API_KEY,
        "pageNo": page_no,
        "numOfRows": num_rows,
        "type": "json",
    }
    for attempt in range(3):
        try:
            resp = requests.get(API_BASE, params=params, timeout=30)
            if resp.status_code == 200:
                data = resp.json()
                body = data.get("body", {})
                items = body.get("items", [])
                return items if isinstance(items, list) else []
            log.warning(f"  API 응답 {resp.status_code}, 재시도 {attempt+1}/3")
            time.sleep(2 * (attempt + 1))
        except Exception as e:
            log.warning(f"  요청 실패: {e}, 재시도 {attempt+1}/3")
            time.sleep(2 * (attempt + 1))
    return []


def transform_item(item: dict) -> dict:
    """API 응답 → 영양소 딕셔너리"""
    return {
        "name": item.get("PRDLST_NM") or item.get("FOOD_NM_KR") or "",
        "food_code": item.get("FOOD_CD") or item.get("PRDLST_REPORT_NO") or "",
        "manufacturer": item.get("BSSH_NM") or item.get("MAKER_NM") or "",
        "calcium_mg": safe_float(item.get("CALCIUM") or item.get("AMT_NUM12")),
        "iron_mg": safe_float(item.get("IRON") or item.get("AMT_NUM13")),
        "potassium_mg": safe_float(item.get("POTASSIUM") or item.get("AMT_NUM14")),
        "phosphorus_mg": safe_float(item.get("PHOSPHORUS") or item.get("AMT_NUM15")),
        "vitamin_a_ug": safe_float(item.get("VITAMIN_A") or item.get("AMT_NUM16")),
        "vitamin_c_mg": safe_float(item.get("VITAMIN_C") or item.get("AMT_NUM20")),
        "vitamin_d_ug": safe_float(item.get("VITAMIN_D") or item.get("AMT_NUM21")),
    }


def main():
    if not API_KEY:
        log.error("MFDS_API_KEY 환경변수가 필요합니다")
        sys.exit(1)
    if not SUPABASE_URL or not SUPABASE_KEY:
        log.error("SUPABASE_URL, SUPABASE_KEY 환경변수가 필요합니다")
        sys.exit(1)

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    log.info("=== 건강기능식품 미량영양소 보강 시작 ===")

    # 1. 기존 products에서 미량영양소가 비어있는 제품 목록 로드
    log.info("미량영양소 없는 제품 로드 중...")
    offset = 0
    products_to_enrich = {}
    while True:
        result = (
            supabase.table("products")
            .select("id, name, food_code")
            .eq("is_active", True)
            .eq("category_large", "상용제품")
            .is_("vitamin_c_mg", "null")
            .is_("calcium_mg", "null")
            .is_("iron_mg", "null")
            .order("name")
            .range(offset, offset + 999)
            .execute()
        )
        batch = result.data or []
        for p in batch:
            # 이름 정규화 (매칭용)
            normalized = re.sub(r"\s+", " ", p["name"].lower().strip())
            products_to_enrich[normalized] = p["id"]
            if p.get("food_code"):
                products_to_enrich[f"code:{p['food_code']}"] = p["id"]
        if len(batch) < 1000:
            break
        offset += 1000

    log.info(f"보강 대상: {len(products_to_enrich)}개 제품")

    # 2. 건강기능식품 API 페이징 조회
    page_no = 1
    total_fetched = 0
    matched = 0
    update_buffer = []

    while True:
        items = fetch_page(page_no, num_rows=100)
        if not items:
            break

        total_fetched += len(items)
        log.info(f"  페이지 {page_no}: {len(items)}건 ({total_fetched}건 누적)")

        for item in items:
            nutrient = transform_item(item)
            name = nutrient["name"]
            if not name:
                continue

            # 이름 매칭
            normalized = re.sub(r"\s+", " ", name.lower().strip())
            product_id = products_to_enrich.get(normalized)

            # 식품코드 매칭
            if not product_id and nutrient["food_code"]:
                product_id = products_to_enrich.get(f"code:{nutrient['food_code']}")

            if not product_id:
                continue

            # 보강할 데이터 구성 (null이 아닌 것만)
            update_data = {}
            for field in ["calcium_mg", "iron_mg", "potassium_mg", "phosphorus_mg",
                          "vitamin_a_ug", "vitamin_c_mg", "vitamin_d_ug"]:
                val = nutrient.get(field)
                if val is not None and val > 0:
                    update_data[field] = val

            if update_data:
                update_buffer.append({"id": product_id, **update_data})
                matched += 1

        # 100건마다 배치 업데이트
        if len(update_buffer) >= 100:
            _flush_updates(supabase, update_buffer)
            update_buffer = []

        page_no += 1
        time.sleep(0.3)  # API 속도 제한

        # 안전 장치: 최대 500페이지
        if page_no > 500:
            break

    # 남은 버퍼 플러시
    if update_buffer:
        _flush_updates(supabase, update_buffer)

    log.info(f"=== 완료: {total_fetched}건 조회 → {matched}건 매칭·보강 ===")


def _flush_updates(supabase: Client, updates: list):
    """배치 업데이트"""
    ok = 0
    for u in updates:
        pid = u.pop("id")
        try:
            supabase.table("products").update(u).eq("id", pid).execute()
            ok += 1
        except Exception as e:
            log.warning(f"  업데이트 실패 {pid}: {e}")
    log.info(f"  {ok}/{len(updates)}건 업데이트 완료")


if __name__ == "__main__":
    main()
