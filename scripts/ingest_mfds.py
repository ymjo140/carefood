"""
식약처 식품영양성분DB → Supabase 적재 파이프라인
=====================================================
사용법:
  1. .env 파일에 API 키 설정
  2. pip install requests supabase python-dotenv
  3. python ingest_mfds.py

환경변수:
  MFDS_API_KEY      - 공공데이터포털(data.go.kr) 서비스키
                      (https://www.data.go.kr/data/15127578/openapi.do)
  SUPABASE_URL      - Supabase 프로젝트 URL
  SUPABASE_KEY      - Supabase service_role 키 (anon 아님 — RLS 우회 필요)

참고:
  - 이 스크립트는 공공데이터포털(data.go.kr) API를 사용합니다
  - 서비스: 식품의약품안전처_식품영양성분DB정보 (서비스번호 15127578)
  - 엔드포인트: FoodNtrCpntDbInfo02 / FoodNtrCpntDbInfo03

옵션:
  --discover     1건 조회 후 응답 필드를 출력하고 종료 (디버깅용)
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

# ─── data.go.kr API 설정 ────────────────────────────────
BASE_URL = "https://apis.data.go.kr/1471000"
# 서비스 버전 후보 (02가 현재 주력, 03은 최신)
SERVICE_CANDIDATES = [
    ("FoodNtrCpntDbInfo02", "getFoodNtrCpntDbInq02"),
    ("FoodNtrCpntDbInfo03", "getFoodNtrCpntDbInq03"),
]
ACTIVE_ENDPOINT = None   # 런타임에 자동 탐지
PAGE_SIZE = 500          # 한 페이지당 최대 건수 (API 제한: 500)
UPSERT_CHUNK = 500       # Supabase upsert 단위

# ─── 매운맛 키워드 사전 ──────────────────────────────────
SPICY_KEYWORDS = [
    ("청양고추", 5, 1.5),
    ("하바네로", 5, 1.5),
    ("캡사이신", 4, 1.3),
    ("고춧가루", 3, 1.0),
    ("고추장",   3, 0.8),
    ("고추",     3, 1.0),
    ("칠리",     3, 1.0),
    ("할라피뇨", 3, 1.2),
    ("라유",     2, 0.8),
    ("와사비",   2, 0.8),
    ("후추",     1, 0.5),
    ("겨자",     1, 0.5),
    ("생강",     1, 0.3),
]


# ═══════════════════════════════════════════════════════
#  1. data.go.kr API 호출
# ═══════════════════════════════════════════════════════

def detect_endpoint(api_key: str) -> str:
    """사용 가능한 API 엔드포인트를 자동 탐지한다."""
    global ACTIVE_ENDPOINT
    if ACTIVE_ENDPOINT is not None:
        return ACTIVE_ENDPOINT

    for svc_name, op_name in SERVICE_CANDIDATES:
        url = f"{BASE_URL}/{svc_name}/{op_name}"
        params = {
            "serviceKey": api_key,
            "pageNo": "1",
            "numOfRows": "1",
            "type": "json",
        }
        try:
            resp = requests.get(url, params=params, timeout=30)
            data = resp.json()

            # 에러 응답 체크
            err_header = (
                data.get("OpenAPI_ServiceResponse", {})
                    .get("cmmMsgHeader", {})
            )
            if err_header:
                err_msg = err_header.get("errMsg", "")
                auth_msg = err_header.get("returnAuthMsg", "")
                log.warning(f"서비스 {svc_name} 오류: {err_msg} - {auth_msg}")
                continue

            # 정상 응답 확인 (body.items 존재)
            body = data.get("body", {})
            if not body or not isinstance(body, dict) or not body.keys():
                resp_wrapper = data.get("response", {})
                if isinstance(resp_wrapper, dict) and resp_wrapper:
                    body = resp_wrapper.get("body", {})
            if body.get("totalCount") is not None or body.get("items") is not None:
                ACTIVE_ENDPOINT = f"{BASE_URL}/{svc_name}/{op_name}"
                log.info(f"서비스 탐지 성공: {svc_name}/{op_name}")
                return ACTIVE_ENDPOINT

            log.warning(f"서비스 {svc_name} 응답 구조 불일치: {list(data.keys())}")

        except Exception as e:
            log.warning(f"서비스 {svc_name} 연결 실패: {e}")

    raise RuntimeError(
        "사용 가능한 식품영양성분 서비스를 찾을 수 없습니다.\n"
        f"시도한 서비스: {[s[0] for s in SERVICE_CANDIDATES]}\n"
        "해결 방법:\n"
        "  1. https://www.data.go.kr/data/15127578/openapi.do 에서 활용신청\n"
        "  2. 발급받은 일반 인증키를 MFDS_API_KEY에 설정\n"
        "  3. 키 발급 후 1~2시간 후 활성화됨"
    )


def discover_fields(api_key: str):
    """API에서 1건을 조회해 응답 필드 목록을 출력한다 (디버깅용)."""
    endpoint = detect_endpoint(api_key)
    params = {
        "serviceKey": api_key,
        "pageNo": "1",
        "numOfRows": "1",
        "type": "json",
    }
    resp = requests.get(endpoint, params=params, timeout=30)
    data = resp.json()

    body = data.get("body", {})
    if not body or not isinstance(body, dict) or not body.keys():
        resp_wrapper = data.get("response", {})
        if isinstance(resp_wrapper, dict) and resp_wrapper:
            body = resp_wrapper.get("body", {})
    total = body.get("totalCount", "?")
    items = body.get("items", [])
    # data.go.kr: body.items는 dict이고 실제 리스트는 body.items.item
    if isinstance(items, dict):
        items = items.get("item", [])
    if isinstance(items, dict):
        items = [items]

    log.info(f"=== 필드 디스커버리 (총 {total}건) ===")
    log.info(f"엔드포인트: {endpoint}")
    log.info(f"data top keys: {list(data.keys())}")
    log.info(f"body 키: {list(body.keys())}")

    if items:
        row = items[0]
        log.info(f"항목 필드 수: {len(row)}")
        log.info("-" * 60)
        for key, val in sorted(row.items()):
            display_val = str(val)[:80] if val else "(empty)"
            log.info(f"  {key:30s} = {display_val}")
        log.info("-" * 60)

        # JSON으로도 저장
        with open("field_discovery.json", "w", encoding="utf-8") as f:
            json.dump({"totalCount": total, "sample_row": row}, f,
                      ensure_ascii=False, indent=2)
        log.info("필드 목록 저장: field_discovery.json")
    else:
        log.warning("응답에 데이터가 없습니다")
        log.info(f"전체 응답: {json.dumps(data, ensure_ascii=False)[:500]}")


def fetch_total_count(api_key: str) -> int:
    """전체 데이터 건수 조회."""
    endpoint = detect_endpoint(api_key)
    params = {
        "serviceKey": api_key,
        "pageNo": "1",
        "numOfRows": "1",
        "type": "json",
    }
    resp = requests.get(endpoint, params=params, timeout=30)
    resp.raise_for_status()
    data = resp.json()

    # 에러 체크
    err_header = (
        data.get("OpenAPI_ServiceResponse", {})
            .get("cmmMsgHeader", {})
    )
    if err_header:
        raise RuntimeError(
            f"API 오류: {err_header.get('errMsg')} - "
            f"{err_header.get('returnAuthMsg')}"
        )

    # body 탐색: data.body 또는 data.response.body
    body = data.get("body", {})
    if not body or not isinstance(body, dict) or not body.keys():
        resp_wrapper = data.get("response", {})
        if isinstance(resp_wrapper, dict) and resp_wrapper:
            body = resp_wrapper.get("body", {})

    total = int(body.get("totalCount", 0))
    log.info(f"전체 데이터 건수: {total:,}")
    return total


def fetch_page(api_key: str, page_no: int, num_rows: int) -> list[dict]:
    """지정 페이지의 데이터를 가져온다."""
    endpoint = ACTIVE_ENDPOINT
    params = {
        "serviceKey": api_key,
        "pageNo": str(page_no),
        "numOfRows": str(num_rows),
        "type": "json",
    }
    for attempt in range(3):
        try:
            resp = requests.get(endpoint, params=params, timeout=60)
            resp.raise_for_status()
            data = resp.json()

            # 에러 응답 체크 1: OpenAPI_ServiceResponse (키 미등록 등)
            err_header = (
                data.get("OpenAPI_ServiceResponse", {})
                    .get("cmmMsgHeader", {})
            )
            if err_header:
                err_msg = err_header.get("errMsg", "")
                log.warning(f"API 경고: {err_msg}")
                return []

            # 에러 응답 체크 2: header.resultCode (파라미터 오류 등)
            result_header = data.get("header", {})
            result_code = result_header.get("resultCode", "00")
            if result_code != "00":
                log.warning(
                    f"API 응답 오류 (code={result_code}): "
                    f"{result_header.get('resultMsg', '')}"
                )
                return []

            # body 탐색: data.body 또는 data.response.body
            body = data.get("body", {})
            if not body or not isinstance(body, dict) or not body.keys():
                # response 래퍼가 있는 경우
                resp_wrapper = data.get("response", {})
                if isinstance(resp_wrapper, dict) and resp_wrapper:
                    body = resp_wrapper.get("body", {})

            raw_items = body.get("items", [])

            # 첫 페이지에서 응답 구조 디버그 로깅
            if page_no == 1 and attempt == 0:
                log.info(f"[DEBUG] data top keys: {list(data.keys()) if isinstance(data, dict) else type(data)}")
                log.info(f"[DEBUG] data snippet: {json.dumps(data, ensure_ascii=False)[:500]}")
                log.info(f"[DEBUG] body keys: {list(body.keys()) if isinstance(body, dict) else type(body)}")
                log.info(f"[DEBUG] items type: {type(raw_items).__name__}")
                if isinstance(raw_items, dict):
                    log.info(f"[DEBUG] items keys: {list(raw_items.keys())}")
                    inner = raw_items.get("item")
                    if inner is not None:
                        log.info(f"[DEBUG] items.item type: {type(inner).__name__}, len: {len(inner) if isinstance(inner, list) else 'N/A'}")
                        if isinstance(inner, list) and inner:
                            log.info(f"[DEBUG] 첫 항목 keys: {list(inner[0].keys()) if isinstance(inner[0], dict) else 'not dict'}")

            # data.go.kr 응답 구조: body.items는 dict이고,
            # 실제 데이터 리스트는 body.items.item에 있음
            items = raw_items
            if isinstance(items, dict):
                items = items.get("item", [])
            # 1건만 있으면 리스트가 아닌 dict로 올 수 있음
            if isinstance(items, dict):
                items = [items]
            if items is None:
                items = []

            return items

        except (requests.RequestException, json.JSONDecodeError) as e:
            log.warning(f"요청 실패 (시도 {attempt+1}/3, 페이지 {page_no}): {e}")
            time.sleep(2 ** attempt)

    log.error(f"3회 재시도 실패: 페이지 {page_no}")
    return []


class StatsAccumulator:
    """메모리 절약: 전체 데이터를 저장하지 않고 카운터만 누적."""

    def __init__(self):
        self.total = 0
        self.skipped = 0
        self.has_sodium = 0
        self.has_sugar = 0
        self.has_fat = 0
        self.has_calories = 0
        self.has_fiber = 0
        self.spicy_gt0 = 0
        self.sodium_buckets = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
        self.first_row_keys: Optional[list] = None
        self.upserted = 0
        self.upsert_errors = 0

    def add(self, product: dict):
        self.total += 1
        if product["calories"] is not None:
            self.has_calories += 1
        if product["fat_g"] is not None:
            self.has_fat += 1
        if product["sugar_g"] is not None:
            self.has_sugar += 1
        if product["fiber_g"] is not None:
            self.has_fiber += 1
        if product["spicy_score"] > 0:
            self.spicy_gt0 += 1
        na = product["sodium_mg"]
        if na is not None:
            self.has_sodium += 1
            if na < 300:
                self.sodium_buckets[1] += 1
            elif na < 500:
                self.sodium_buckets[2] += 1
            elif na < 800:
                self.sodium_buckets[3] += 1
            elif na < 1200:
                self.sodium_buckets[4] += 1
            else:
                self.sodium_buckets[5] += 1

    def print_report(self):
        """적재 후 데이터 품질 리포트 출력."""
        total = self.total
        if total == 0:
            log.warning("통계 리포트 생략: 데이터 없음")
            return

        log.info("=" * 50)
        log.info("데이터 품질 리포트")
        log.info("=" * 50)
        log.info(f"  전체 제품수:           {total:>8,}")
        log.info(f"  열량 데이터 있음:      {self.has_calories:>8,} ({self.has_calories/total*100:.1f}%)")
        log.info(f"  나트륨 데이터 있음:    {self.has_sodium:>8,} ({self.has_sodium/total*100:.1f}%)")
        log.info(f"  당류 데이터 있음:      {self.has_sugar:>8,} ({self.has_sugar/total*100:.1f}%)")
        log.info(f"  지방 데이터 있음:      {self.has_fat:>8,} ({self.has_fat/total*100:.1f}%)")
        log.info(f"  식이섬유 있음:         {self.has_fiber:>8,} ({self.has_fiber/total*100:.1f}%)")
        log.info(f"  매운맛 점수 > 0:       {self.spicy_gt0:>8,} ({self.spicy_gt0/total*100:.1f}%)")
        log.info(f"  스킵 (이름 없음):      {self.skipped:>8,}")
        log.info("=" * 50)

        # 나트륨 분포 (맛 매핑 기초 데이터)
        if self.has_sodium > 0:
            log.info("나트륨 분포 (짠맛 레벨별):")
            labels = {
                1: "싱거운 (0~300mg)",
                2: "약한   (300~500mg)",
                3: "보통   (500~800mg)",
                4: "짠     (800~1200mg)",
                5: "매우짠 (1200mg+)",
            }
            for level, count in self.sodium_buckets.items():
                pct = count / max(self.has_sodium, 1) * 100
                bar = "█" * int(pct / 2)
                log.info(f"  레벨 {level} {labels[level]}: {count:>6,} ({pct:>5.1f}%) {bar}")
        else:
            log.warning("나트륨 데이터가 0건입니다 — 필드 매핑을 확인하세요 (--discover)")


def ingest_streaming(api_key: str, supabase: Optional[Client]) -> StatsAccumulator:
    """스트리밍 적재: 페이지별로 fetch → transform → upsert → 메모리 해제.

    341K+ 행을 512MB 메모리 내에서 처리하기 위해
    전체 데이터를 누적하지 않고 페이지 단위로 처리 후 즉시 폐기한다.
    """
    total = fetch_total_count(api_key)
    total_pages = (total + PAGE_SIZE - 1) // PAGE_SIZE
    stats = StatsAccumulator()
    total_fetched = 0

    log.info(f"총 {total:,}건, {total_pages}페이지 스트리밍 처리 시작")

    for page_no in range(1, total_pages + 1):
        # ── fetch ──
        items = fetch_page(api_key, page_no, PAGE_SIZE)
        total_fetched += len(items)

        if not items:
            log.warning(f"  페이지 {page_no}: 빈 응답, 건너뜀")
            time.sleep(0.3)
            continue

        # 첫 페이지 필드 목록 기록
        if stats.first_row_keys is None:
            stats.first_row_keys = sorted(items[0].keys())
            log.info(f"응답 필드 목록: {stats.first_row_keys}")

        # ── transform ──
        page_products = []
        for row in items:
            name = _get_field(row, "FOOD_NM_KR", "DESC_KOR", "FOOD_NM") or ""
            if not name:
                stats.skipped += 1
                continue
            product = transform_row(row)
            stats.add(product)
            page_products.append(product)

        # ── upsert (페이지 단위) ──
        if supabase and page_products:
            try:
                supabase.table("products").upsert(
                    page_products, on_conflict="food_code"
                ).execute()
                stats.upserted += len(page_products)
            except Exception as e:
                stats.upsert_errors += len(page_products)
                log.error(f"  upsert 실패 (페이지 {page_no}): {e}")

        # ── 로깅 (10페이지마다 또는 마지막 페이지) ──
        if page_no % 10 == 0 or page_no == total_pages:
            log.info(
                f"  처리: {page_no:>4}/{total_pages}페이지"
                f"  누적 fetch={total_fetched:,}"
                f"  변환={stats.total:,}"
                f"  적재={stats.upserted:,}"
            )

        # ── 메모리 해제 ──
        del items, page_products

        time.sleep(0.3)  # 서버 부하 방지

    log.info(
        f"스트리밍 완료: fetch={total_fetched:,}"
        f"  변환={stats.total:,}  스킵={stats.skipped}"
        f"  적재={stats.upserted:,}  실패={stats.upsert_errors}"
    )
    return stats


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
    # 단위 문자 제거 (예: "260.000g" → "260.000")
    s = re.sub(r"[^\d.\-]", "", s.replace(",", ""))
    if not s:
        return None
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
            position_weight = 1.3 if (idx / max(text_len, 1)) < 0.5 else 1.0
            total_weighted += base_score * weight * position_weight
            match_count += 1

    if match_count == 0:
        return 0

    raw = total_weighted / match_count
    score = min(round(raw), 5)
    return max(score, 1) if match_count > 0 else 0


def _get_field(row: dict, *candidates: str) -> Optional[str]:
    """여러 후보 필드명 중 값이 있는 첫 번째를 반환."""
    for key in candidates:
        val = row.get(key)
        if val is not None and str(val).strip():
            return str(val).strip()
    return None


def transform_row(row: dict) -> dict:
    """API 응답 1건 → products 테이블 레코드로 변환.

    data.go.kr FoodNtrCpntDbInfo02 필드 매핑:
    ─────────────────────────────────────────
    확인된 필드:
      FOOD_NM_KR  = 식품명
      AMT_NUM1    = 에너지 (kcal)
      AMT_NUM3    = 단백질 (g)
      AMT_NUM4    = 지방 (g)
      AMT_NUM6    = 탄수화물 (g)
      Z10500      = 1회 섭취참고량 (g)
      영양성분함량기준량 = 영양값 기준량 (보통 100g)
      식품중량    = 전체 제품 무게 (g)
      DB_CLASS_CM = 분류코드 (01=원재료, 02=가공식품, 03=외식)
      FOOD_REF_NM = 참고음식명

    영양성분 표시 공식:
      1회 섭취 영양값 = DB영양값 × (1회섭취참고량 / 영양성분함량기준량)
      예: 녹차 단백질 = 27.9g × (2g / 100g) = 0.56g

    추정 필드 (실제 응답으로 확인 필요 → --discover 참고):
      AMT_NUM7    = 당류 (g)
      AMT_NUM8    = 나트륨 (mg)
      AMT_NUM9    = 콜레스테롤 (mg)
      AMT_NUM10   = 포화지방산 (g)
      AMT_NUM11   = 트랜스지방산 (g)
      AMT_NUM2    = 수분 또는 식이섬유 (g)
      FOOD_CD     = 식품코드
      MAKER_NM    = 제조사명
      RAWMTRL_NM  = 원재료명
    """
    # 식품명
    name = _get_field(row, "FOOD_NM_KR", "DESC_KOR", "FOOD_NM") or ""

    # 식품코드 — 여러 후보 시도
    food_code = _get_field(
        row, "FOOD_CD", "FOOD_CODE", "NUM",
        "FOOD_NM_CD", "FOOD_OR_CD",
    )
    # food_code가 없으면 식품명 기반 해시 생성
    if not food_code and name:
        import hashlib
        food_code = "HASH_" + hashlib.md5(name.encode()).hexdigest()[:12]

    # 제조사
    manufacturer = _get_field(
        row, "MAKER_NM", "MAKER_NAME", "MFR_NM",
        "CMPNY_NM", "ENTRPS_NM",
    )

    # 카테고리
    category = _get_field(
        row, "DB_CLASS_NM", "GROUP_NM", "GROUP_NAME",
        "FOOD_CAT", "FOOD_CTGRY_NM",
    )
    # 분류코드로 대체
    if not category:
        code = row.get("DB_CLASS_CM")
        if code == "01":
            category = "품목대표"
        elif code == "02":
            category = "가공식품"
        elif code == "03":
            category = "외식"

    # 원재료명
    ingredients_raw = _get_field(
        row, "RAWMTRL_NM", "SUB_REF_NAME", "SUB_REF_NM",
        "RAWMTRL_INFO",
    )

    return {
        "food_code":        food_code,
        "name":             name,
        "manufacturer":     manufacturer,
        "category_large":   category,

        # 제공량/중량 필드
        # Z10500 = 1회 섭취참고량, 영양성분함량기준량 = 영양값 기준, 식품중량 = 전체 제품
        "serving_size_g":   safe_numeric(row.get("Z10500")
                            or row.get("SERVING_SIZE")
                            or row.get("1회섭취참고량")),
        "nutrient_base_g":  safe_numeric(row.get("SERVING_WT")
                            or row.get("영양성분함량기준량")
                            or row.get("NUTRI_AMOUNT_SERVING")),
        "total_weight_g":   safe_numeric(row.get("FOOD_SIZE")
                            or row.get("식품중량")
                            or row.get("Z10000")),

        # 영양성분 — 확인된 필드 (AMT_NUM 기반)
        "calories":         safe_numeric(row.get("AMT_NUM1")
                            or row.get("NUTR_CONT1")),
        "carbs_g":          safe_numeric(row.get("AMT_NUM6")
                            or row.get("NUTR_CONT2")),
        "protein_g":        safe_numeric(row.get("AMT_NUM3")
                            or row.get("NUTR_CONT3")),
        "fat_g":            safe_numeric(row.get("AMT_NUM4")
                            or row.get("NUTR_CONT4")),

        # 추정 필드 — 다수 후보 시도
        "sugar_g":          safe_numeric(row.get("AMT_NUM7")
                            or row.get("AMT_NUM5")
                            or row.get("NUTR_CONT5")),
        "sodium_mg":        safe_numeric(row.get("AMT_NUM8")
                            or row.get("AMT_NUM13")
                            or row.get("NUTR_CONT6")),
        "cholesterol_mg":   safe_numeric(row.get("AMT_NUM9")
                            or row.get("AMT_NUM14")
                            or row.get("NUTR_CONT7")),
        "saturated_fat_g":  safe_numeric(row.get("AMT_NUM10")
                            or row.get("AMT_NUM15")
                            or row.get("NUTR_CONT8")),
        "trans_fat_g":      safe_numeric(row.get("AMT_NUM11")
                            or row.get("AMT_NUM16")
                            or row.get("NUTR_CONT9")),

        # 미제공 → null (추후 보강)
        "potassium_mg":     None,
        "calcium_mg":       None,
        "phosphorus_mg":    None,
        "iron_mg":          None,
        "fiber_g":          safe_numeric(row.get("AMT_NUM2")
                            or row.get("AMT_NUM12")),
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


# (transform_all / upsert_to_supabase / print_stats 는 StatsAccumulator +
#  ingest_streaming 으로 통합됨 — 메모리 512MB 제한 대응)


# ═══════════════════════════════════════════════════════
#  5. 메인 실행
# ═══════════════════════════════════════════════════════

def main():
    # 환경변수 체크
    if not MFDS_API_KEY:
        log.error("MFDS_API_KEY가 설정되지 않았습니다. .env 파일을 확인하세요.")
        log.info(
            "API 키 발급: https://www.data.go.kr/data/15127578/openapi.do"
            " → 활용신청 → 일반 인증키 발급"
        )
        sys.exit(1)

    # --discover 모드: 필드 디스커버리
    if "--discover" in sys.argv:
        log.info("=== 필드 디스커버리 모드 ===")
        discover_fields(MFDS_API_KEY)
        return

    log.info("=" * 50)
    log.info("식약처 식품영양성분DB → Supabase 적재 시작 (스트리밍 모드)")
    log.info(f"API: data.go.kr (공공데이터포털)")
    log.info(f"페이지 크기: {PAGE_SIZE}건, upsert 단위: 페이지별")
    log.info(f"시작 시간: {datetime.now().isoformat()}")
    log.info("=" * 50)

    # Supabase 클라이언트 준비
    supabase = None
    if SUPABASE_URL and SUPABASE_KEY:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        log.info("Supabase 연결 완료")
    else:
        log.warning("SUPABASE_URL/KEY 미설정 — 변환·통계만 수행 (적재 스킵)")

    # 서비스 탐지
    log.info("[1/2] data.go.kr API 서비스 탐지 중...")
    detect_endpoint(MFDS_API_KEY)

    # 스트리밍 적재: fetch → transform → upsert 를 페이지 단위로 반복
    log.info("[2/2] 스트리밍 수집·변환·적재 시작...")
    stats = ingest_streaming(MFDS_API_KEY, supabase)

    if stats.total == 0:
        log.error("수집된 데이터가 없습니다. API 키와 네트워크를 확인하세요.")
        sys.exit(1)

    # 통계 리포트
    stats.print_report()

    log.info("=" * 50)
    log.info(
        f"완료! 변환 {stats.total:,}건"
        f" / 적재 {stats.upserted:,}건"
        f" / 실패 {stats.upsert_errors}"
    )
    log.info(f"종료 시간: {datetime.now().isoformat()}")
    log.info("=" * 50)


if __name__ == "__main__":
    main()
