"""
쿠팡/마켓컬리/네이버 가격 크롤러 → product_prices 테이블 적재
================================================================
3개 채널 전략:
  1) 네이버 쇼핑 검색 API (1차): 모든 쇼핑몰 최저가를 한번에 수집
     - /v1/search/shop.json — 상품명/가격/링크 반환
     - 실패 시 graceful skip (크롤러는 계속 작동)
  2) 쿠팡 파트너스 API (2차): 쿠팡 어필리에이트 링크 생성 (수수료 수익)
  3) 마켓컬리 (3차): 검색 URL 기반 아웃링크 생성

추가 기능:
  --trends 모드: 네이버 쇼핑인사이트 API로 키워드 트렌드 수집
     - /v1/datalab/shopping/category/keywords — 검색 클릭 추이 (상대 비율)
     - 케어푸드 관련 키워드 인기도 분석용

사용법:
  pip install requests supabase python-dotenv
  cp .env.example .env   # 키 채우기
  python crawl_prices.py              # 가격 크롤링
  python crawl_prices.py --trends     # 트렌드 분석
  python crawl_prices.py --test '저염 도시락'  # 단일 테스트

환경변수:
  NAVER_CLIENT_ID      - 네이버 개발자 Client ID
  NAVER_CLIENT_SECRET  - 네이버 개발자 Client Secret
  COUPANG_ACCESS_KEY   - 쿠팡 파트너스 ACCESS KEY
  COUPANG_SECRET_KEY   - 쿠팡 파트너스 SECRET KEY
  SUPABASE_URL         - Supabase 프로젝트 URL
  SUPABASE_KEY         - Supabase service_role 키
"""

import os
import re
import sys
import json
import hmac
import hashlib
import time
import logging
import urllib.parse
from typing import Optional
from datetime import datetime
from time import gmtime, strftime

import requests
from dotenv import load_dotenv
from supabase import create_client, Client

# ─── 로깅 ──────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("crawl_prices.log", encoding="utf-8"),
    ],
)
log = logging.getLogger(__name__)

# ─── 환경변수 ────────────────────────────────────────────
load_dotenv()

NAVER_CLIENT_ID     = os.getenv("NAVER_CLIENT_ID", "")
NAVER_CLIENT_SECRET = os.getenv("NAVER_CLIENT_SECRET", "")
COUPANG_ACCESS_KEY  = os.getenv("COUPANG_ACCESS_KEY", "")
COUPANG_SECRET_KEY  = os.getenv("COUPANG_SECRET_KEY", "")
SUPABASE_URL        = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY        = os.getenv("SUPABASE_KEY", "")

UPSERT_CHUNK = 200


# ═══════════════════════════════════════════════════════
#  1. 네이버 쇼핑 검색 API
# ═══════════════════════════════════════════════════════
#  - 한번에 모든 쇼핑몰 최저가 수집
#  - 일 25,000건 호출 가능 (넉넉)
#  - 응답: title, link, image, lprice, mallName 등

NAVER_SHOP_URL = "https://openapi.naver.com/v1/search/shop.json"
NAVER_INSIGHT_URL = "https://openapi.naver.com/v1/datalab/shopping/category/keywords"
NAVER_INSIGHT_CATEGORY_URL = "https://openapi.naver.com/v1/datalab/shopping/categories"

# 네이버 쇼핑 검색 API 가용 여부 (첫 호출 시 자동 판단)
_naver_search_available: Optional[bool] = None

def strip_html(text: str) -> str:
    """네이버 API 응답의 <b> 태그 제거."""
    return re.sub(r"</?b>", "", text or "")


def naver_search(query: str, display: int = 20) -> list[dict]:
    """
    네이버 쇼핑 검색 API 호출.
    API가 비활성/미지원인 경우 자동으로 스킵 (크롤러는 계속 작동).

    Returns:
        [{title, link, image, lprice, mallName, productId, ...}, ...]
    """
    global _naver_search_available

    if not NAVER_CLIENT_ID:
        return []

    # 이전 호출에서 API 사용 불가 확인됨 → 즉시 스킵
    if _naver_search_available is False:
        return []

    headers = {
        "X-Naver-Client-Id": NAVER_CLIENT_ID,
        "X-Naver-Client-Secret": NAVER_CLIENT_SECRET,
    }
    params = {
        "query": query,
        "display": min(display, 100),
        "start": 1,
        "sort": "sim",    # sim(정확도) | date | asc(가격↑) | dsc(가격↓)
    }

    try:
        resp = requests.get(NAVER_SHOP_URL, headers=headers, params=params, timeout=10)

        # 401/403 → API 미지원 또는 권한 없음 → 이후 호출 전부 스킵
        if resp.status_code in (401, 403, 404):
            if _naver_search_available is None:
                _naver_search_available = False
                log.warning(
                    f"네이버 쇼핑 검색 API 사용 불가 (HTTP {resp.status_code}). "
                    f"이 API는 더 이상 신규 등록을 지원하지 않을 수 있습니다. "
                    f"쿠팡/컬리 채널로 계속 진행합니다."
                )
            return []

        resp.raise_for_status()
        data = resp.json()
        items = data.get("items", [])

        # 첫 성공 → API 사용 가능 확인
        if _naver_search_available is None:
            _naver_search_available = True
            log.info("네이버 쇼핑 검색 API 사용 가능 확인!")

        # HTML 태그 정리
        for item in items:
            item["title"] = strip_html(item.get("title", ""))

        return items

    except requests.RequestException as e:
        log.error(f"네이버 검색 실패 [{query}]: {e}")
        return []


# ═══════════════════════════════════════════════════════
#  1-B. 네이버 쇼핑인사이트 API (트렌드 분석)
# ═══════════════════════════════════════════════════════
#  - 검색 클릭 추이 (상대 비율 0~100)
#  - 카테고리별, 키워드별, 성별/연령별 분석 가능
#  - 일 1,000회 호출 제한
#  - 가격 정보는 없음 → 제품 인기도/트렌드 분석에 활용

# 케어푸드 관련 네이버쇼핑 카테고리 코드
CAREFOOD_CATEGORIES = {
    "식품": "50000000",
    "건강식품": "50000008",
}

# 케어푸드 주요 트렌드 키워드
CAREFOOD_TREND_KEYWORDS = [
    "저염식",
    "저당 간식",
    "당뇨 식단",
    "케어푸드",
    "다이어트 도시락",
    "저칼로리 간식",
    "고단백 식품",
    "저나트륨",
    "무설탕",
    "글루텐프리",
]


def naver_insight_keywords(
    category: str,
    keywords: list[str],
    start_date: str,
    end_date: str,
    time_unit: str = "month",
) -> list[dict]:
    """
    네이버 쇼핑인사이트 키워드별 트렌드 조회.

    Args:
        category: 네이버쇼핑 카테고리 코드 (예: "50000000")
        keywords: 비교할 키워드 리스트 (최대 5개)
        start_date: 조회 시작일 (yyyy-mm-dd)
        end_date: 조회 종료일 (yyyy-mm-dd)
        time_unit: 구간 단위 (date/week/month)

    Returns:
        [{title, category, data: [{period, ratio}, ...]}, ...]
    """
    if not NAVER_CLIENT_ID:
        log.warning("NAVER_CLIENT_ID 미설정 — 쇼핑인사이트 스킵")
        return []

    headers = {
        "X-Naver-Client-Id": NAVER_CLIENT_ID,
        "X-Naver-Client-Secret": NAVER_CLIENT_SECRET,
        "Content-Type": "application/json",
    }

    # 키워드를 5개씩 묶어서 요청 (API 제한)
    keyword_groups = [
        {"name": kw, "param": [kw]}
        for kw in keywords[:5]
    ]

    body = {
        "startDate": start_date,
        "endDate": end_date,
        "timeUnit": time_unit,
        "category": category,
        "keyword": keyword_groups,
    }

    try:
        resp = requests.post(
            NAVER_INSIGHT_URL,
            headers=headers,
            json=body,
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("results", [])

    except requests.RequestException as e:
        log.error(f"쇼핑인사이트 키워드 트렌드 실패: {e}")
        return []


def naver_insight_categories(
    categories: list[dict],
    start_date: str,
    end_date: str,
    time_unit: str = "month",
) -> list[dict]:
    """
    네이버 쇼핑인사이트 분야별 트렌드 조회.

    Args:
        categories: [{"name": "분야명", "param": ["코드"]}, ...] (최대 3개)
        start_date: 조회 시작일 (yyyy-mm-dd)
        end_date: 조회 종료일 (yyyy-mm-dd)

    Returns:
        [{title, category, data: [{period, ratio}, ...]}, ...]
    """
    if not NAVER_CLIENT_ID:
        log.warning("NAVER_CLIENT_ID 미설정 — 쇼핑인사이트 스킵")
        return []

    headers = {
        "X-Naver-Client-Id": NAVER_CLIENT_ID,
        "X-Naver-Client-Secret": NAVER_CLIENT_SECRET,
        "Content-Type": "application/json",
    }

    body = {
        "startDate": start_date,
        "endDate": end_date,
        "timeUnit": time_unit,
        "category": categories[:3],
    }

    try:
        resp = requests.post(
            NAVER_INSIGHT_CATEGORY_URL,
            headers=headers,
            json=body,
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("results", [])

    except requests.RequestException as e:
        log.error(f"쇼핑인사이트 카테고리 트렌드 실패: {e}")
        return []


def run_trend_analysis():
    """
    케어푸드 관련 키워드의 네이버 쇼핑 검색 트렌드를 분석.
    --trends 플래그로 실행.
    """
    from datetime import timedelta

    if not NAVER_CLIENT_ID:
        log.error("NAVER_CLIENT_ID가 설정되지 않았습니다.")
        log.info("발급: https://developers.naver.com/apps/#/register")
        sys.exit(1)

    today = datetime.now()
    end_date = today.strftime("%Y-%m-%d")
    start_date_3m = (today - timedelta(days=90)).strftime("%Y-%m-%d")
    start_date_1y = (today - timedelta(days=365)).strftime("%Y-%m-%d")

    log.info("=" * 60)
    log.info("케어푸드 트렌드 분석 (네이버 쇼핑인사이트)")
    log.info("=" * 60)

    # 1) 카테고리 트렌드: 식품 vs 건강식품
    log.info("\n[1] 카테고리별 트렌드 (최근 1년)")
    cat_groups = [
        {"name": name, "param": [code]}
        for name, code in CAREFOOD_CATEGORIES.items()
    ]
    cat_results = naver_insight_categories(cat_groups, start_date_1y, end_date, "month")
    for result in cat_results:
        title = result.get("title", "?")
        data = result.get("data", [])
        if data:
            latest = data[-1]
            log.info(f"  {title}: 최근 ratio={latest.get('ratio', 0):.1f}")
            # 3개월 전 대비 변화
            if len(data) >= 4:
                prev = data[-4]
                change = latest.get("ratio", 0) - prev.get("ratio", 0)
                direction = "↑" if change > 0 else "↓" if change < 0 else "→"
                log.info(f"    3개월 전 대비: {direction} {abs(change):.1f}")

    # 2) 키워드 트렌드 (5개씩 나눠서)
    log.info(f"\n[2] 키워드별 트렌드 (최근 3개월)")
    all_keyword_results = []
    food_cat = CAREFOOD_CATEGORIES.get("식품", "50000000")

    for i in range(0, len(CAREFOOD_TREND_KEYWORDS), 5):
        batch = CAREFOOD_TREND_KEYWORDS[i:i+5]
        results = naver_insight_keywords(food_cat, batch, start_date_3m, end_date, "week")
        all_keyword_results.extend(results)
        time.sleep(0.2)  # rate limit

    # 결과 정리 — 최근 주의 ratio 기준 정렬
    keyword_scores = []
    for result in all_keyword_results:
        title = result.get("title", "?")
        data = result.get("data", [])
        if data:
            latest_ratio = data[-1].get("ratio", 0)
            keyword_scores.append((title, latest_ratio))

    keyword_scores.sort(key=lambda x: x[1], reverse=True)

    log.info(f"  {'키워드':<20s}  {'인기도 (0~100)':>14s}")
    log.info(f"  {'─' * 20}  {'─' * 14}")
    for kw, score in keyword_scores:
        bar = "█" * int(score / 5) + "░" * (20 - int(score / 5))
        log.info(f"  {kw:<20s}  {score:>10.1f}  {bar}")

    # JSON 저장
    trend_data = {
        "analyzed_at": today.isoformat(),
        "period": f"{start_date_3m} ~ {end_date}",
        "category_trends": [
            {
                "title": r.get("title"),
                "data": r.get("data", []),
            }
            for r in cat_results
        ],
        "keyword_trends": [
            {"keyword": kw, "latest_ratio": score}
            for kw, score in keyword_scores
        ],
    }
    trend_path = f"trends_{today.strftime('%Y%m%d')}.json"
    with open(trend_path, "w", encoding="utf-8") as f:
        json.dump(trend_data, f, ensure_ascii=False, indent=2)
    log.info(f"\n트렌드 데이터 저장: {trend_path}")
    log.info("=" * 60)


def classify_platform(mall_name: str, link: str) -> str:
    """쇼핑몰명/URL로 플랫폼 분류."""
    name = (mall_name or "").lower()
    url = (link or "").lower()

    if "쿠팡" in name or "coupang" in url:
        return "coupang"
    if "컬리" in name or "kurly" in url or "마켓컬리" in name:
        return "kurly"
    if "네이버" in name or "smartstore" in url or "shopping.naver" in url:
        return "naver"
    if "gmarket" in url or "지마켓" in name:
        return "gmarket"
    if "ssg" in url or "에스에스지" in name or "이마트" in name:
        return "ssg"
    # 기타 쇼핑몰도 수집 — 아웃링크로 충분
    return name[:20] if name else "other"


def naver_to_price_records(
    product_id: str,
    items: list[dict],
    serving_size_g: Optional[float] = None,
) -> list[dict]:
    """
    네이버 쇼핑 검색 결과 → product_prices 레코드 변환.
    플랫폼별로 최저가 1건씩만 남김.
    """
    # 플랫폼별 최저가 선택
    best_by_platform: dict[str, dict] = {}

    for item in items:
        price = int(item.get("lprice") or 0)
        if price <= 0:
            continue

        platform = classify_platform(
            item.get("mallName", ""),
            item.get("link", ""),
        )

        if platform not in best_by_platform or price < best_by_platform[platform]["price"]:
            best_by_platform[platform] = {
                "product_id": product_id,
                "platform": platform,
                "price": price,
                "price_per_serving": None,   # 아래에서 계산
                "url": item.get("link", ""),
                "image_url": item.get("image", None),
                "is_available": True,
                "last_crawled_at": datetime.utcnow().isoformat(),
            }

    # 1회분당 가격 계산 (serving_size 있으면)
    # 예: 600g 제품, serving_size 200g → 3회분 → 가격/3
    # 단, 총중량 정보가 네이버 API에 없으므로 나중에 보강
    records = list(best_by_platform.values())
    return records


# ═══════════════════════════════════════════════════════
#  2. 쿠팡 파트너스 API
# ═══════════════════════════════════════════════════════
#  - 어필리에이트 링크로 수수료 수익
#  - 1시간 10회 제한 → 대량 수집에는 부적합, 보충용
#  - 응답: productId, productName, productPrice, productImage, productUrl

COUPANG_API_DOMAIN = "https://api-gateway.coupang.com"
COUPANG_SEARCH_PATH = "/v2/providers/affiliate_open_api/apis/openapi/products/search"


def coupang_hmac_auth(method: str, path_with_query: str) -> str:
    """쿠팡 파트너스 API HMAC-SHA256 인증 헤더 생성."""
    signed_date = strftime("%y%m%dT%H%M%SZ", gmtime())
    path, _, query = path_with_query.partition("?")
    message = signed_date + method + path + query

    signature = hmac.new(
        COUPANG_SECRET_KEY.encode("utf-8"),
        message.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    return (
        f"CEA algorithm=HmacSHA256, "
        f"access-key={COUPANG_ACCESS_KEY}, "
        f"signed-date={signed_date}, "
        f"signature={signature}"
    )


def coupang_search(keyword: str, limit: int = 10) -> list[dict]:
    """
    쿠팡 파트너스 상품 검색 API.
    제한: 1시간 10회, 1회 최대 10건.

    Returns:
        [{productId, productName, productPrice, productImage, productUrl, ...}, ...]
    """
    if not COUPANG_ACCESS_KEY:
        return []

    encoded_keyword = urllib.parse.quote(keyword)
    query_string = f"keyword={encoded_keyword}&limit={limit}"
    path_with_query = f"{COUPANG_SEARCH_PATH}?{query_string}"

    authorization = coupang_hmac_auth("GET", path_with_query)

    headers = {
        "Authorization": authorization,
        "Content-Type": "application/json;charset=UTF-8",
    }

    url = f"{COUPANG_API_DOMAIN}{path_with_query}"

    try:
        resp = requests.get(url, headers=headers, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        products = data.get("data", {}).get("productData", [])
        return products

    except requests.RequestException as e:
        log.error(f"쿠팡 검색 실패 [{keyword}]: {e}")
        return []


def coupang_to_price_record(product_id: str, item: dict) -> Optional[dict]:
    """쿠팡 파트너스 결과 → product_prices 레코드."""
    price = item.get("productPrice")
    url = item.get("productUrl")
    if not price or not url:
        return None

    return {
        "product_id": product_id,
        "platform": "coupang",
        "price": int(price),
        "price_per_serving": None,
        "url": url,  # 이미 어필리에이트 링크
        "image_url": item.get("productImage"),
        "is_available": True,
        "last_crawled_at": datetime.utcnow().isoformat(),
    }


# ═══════════════════════════════════════════════════════
#  3. 마켓컬리 검색 URL 생성
# ═══════════════════════════════════════════════════════
#  - 공식 API 없음 → 검색 페이지 URL로 아웃링크
#  - MVP 단계에서는 네이버 검색 결과 중 mallName="컬리" 건으로 충분
#  - 추후 Playwright 크롤러로 정밀 수집 가능

KURLY_SEARCH_URL = "https://www.kurly.com/search?sword={keyword}"


def kurly_search_link(keyword: str) -> str:
    """마켓컬리 검색 결과 페이지 URL 생성."""
    return KURLY_SEARCH_URL.format(keyword=urllib.parse.quote(keyword))


# ═══════════════════════════════════════════════════════
#  4. 스트리밍 파이프라인
# ═══════════════════════════════════════════════════════
#  - 제품을 페이지 단위로 로드 → 검색 → upsert → 해제
#  - 메모리 누적 없음 (512MB Render 환경 안전)
#  - 기존 가격 수집된 제품 자동 스킵

def build_search_query(product: dict) -> str:
    """
    제품 정보로 쇼핑 검색 쿼리 생성.

    식약처 식품명이 길고 영양소 정보를 포함하는 경우가 많으므로,
    핵심 키워드만 추출.
    예: "CJ 햇반 백미밥 210g" → "CJ 햇반 백미밥"
    """
    name = product.get("name", "")

    # 용량 정보 제거 (검색 정확도 향상)
    name = re.sub(r"\d+\.?\d*\s*(g|kg|ml|l|kcal)\b", "", name, flags=re.IGNORECASE)
    # 괄호 내용 제거
    name = re.sub(r"[(\[].*?[)\]]", "", name)
    # 연속 공백 정리
    name = re.sub(r"\s+", " ", name).strip()

    # 너무 긴 검색어 자르기 (핵심 앞부분만)
    words = name.split()
    if len(words) > 5:
        name = " ".join(words[:5])

    return name


def _flush_buffer(supabase: Client, buffer: list[dict]) -> tuple[int, int]:
    """Upsert a buffer of price records. Returns (ok_count, error_count)."""
    if not buffer:
        return 0, 0
    ok = 0
    errors = 0
    for i in range(0, len(buffer), UPSERT_CHUNK):
        chunk = buffer[i : i + UPSERT_CHUNK]
        try:
            supabase.table("product_prices").upsert(
                chunk,
                on_conflict="product_id,platform",
            ).execute()
            ok += len(chunk)
        except Exception as e:
            errors += len(chunk)
            log.error(f"  upsert 실패 ({len(chunk)}건): {e}")
    return ok, errors


def crawl_streaming(
    supabase: Client,
    max_products: int = 2000,
    use_coupang: bool = False,
    skip_crawled: bool = True,
) -> dict:
    """
    스트리밍 가격 크롤러.
    제품을 페이지 단위로 로드 -> 검색 -> upsert -> 해제.
    메모리 누적 없이 동작하여 512MB 환경에서 안전.
    """
    # ─── 기존 가격 수집 제품 ID 로드 (스킵용) ───
    crawled_ids: set[str] = set()
    if skip_crawled:
        offset = 0
        while True:
            result = (
                supabase.table("product_prices")
                .select("product_id")
                .range(offset, offset + 4999)
                .execute()
            )
            batch = result.data or []
            crawled_ids.update(r["product_id"] for r in batch)
            if len(batch) < 5000:
                break
            offset += 5000
        if crawled_ids:
            log.info(f"  이미 가격 수집된 제품: {len(crawled_ids):,}건 (스킵)")

    # ─── 카운터 ───
    processed = 0
    searched = 0
    prices_found = 0
    upserted = 0
    upsert_errors = 0
    skipped_crawled = 0
    skipped_no_query = 0
    platform_counts: dict[str, int] = {}
    coupang_calls = 0
    MAX_COUPANG_PER_HOUR = 9

    # ─── 버퍼 (upsert 배치용) ───
    buffer: list[dict] = []

    page_size = 500
    page_offset = 0
    done = False

    while not done:
        # 상용제품만 페이지 단위 로드
        result = (
            supabase.table("products")
            .select("id, name, serving_size_g, category_large")
            .eq("is_active", True)
            .eq("category_large", "상용제품")
            .order("name")
            .range(page_offset, page_offset + page_size - 1)
            .execute()
        )
        products = result.data or []
        if not products:
            break

        for product in products:
            if max_products > 0 and processed >= max_products:
                done = True
                break

            product_id = product["id"]

            # 이미 수집된 제품 스킵
            if product_id in crawled_ids:
                skipped_crawled += 1
                processed += 1
                continue

            query = build_search_query(product)
            if not query or len(query) < 2:
                skipped_no_query += 1
                processed += 1
                continue

            # ─── 네이버 쇼핑 검색 ───
            naver_items = naver_search(query, display=10)
            searched += 1

            if naver_items:
                records = naver_to_price_records(
                    product_id, naver_items, product.get("serving_size_g")
                )
                buffer.extend(records)
                prices_found += len(records)
                for r in records:
                    p = r["platform"]
                    platform_counts[p] = platform_counts.get(p, 0) + 1

            # ─── 쿠팡 (선택적) ───
            if use_coupang and coupang_calls < MAX_COUPANG_PER_HOUR:
                has_coupang = any(
                    r["platform"] == "coupang" for r in buffer[-10:]
                )
                if not has_coupang:
                    coupang_items = coupang_search(query, limit=3)
                    for item in coupang_items[:1]:
                        record = coupang_to_price_record(product_id, item)
                        if record:
                            buffer.append(record)
                            prices_found += 1
                            platform_counts["coupang"] = (
                                platform_counts.get("coupang", 0) + 1
                            )
                    coupang_calls += 1

            processed += 1

            # 버퍼 플러시
            if len(buffer) >= UPSERT_CHUNK:
                ok, err = _flush_buffer(supabase, buffer)
                upserted += ok
                upsert_errors += err
                buffer.clear()

            # 진행률 (100건마다)
            if searched > 0 and searched % 100 == 0:
                log.info(
                    f"  진행: {processed:,}/{max_products:,}  "
                    f"검색: {searched:,}  가격: {prices_found:,}  "
                    f"DB: {upserted:,}  스킵: {skipped_crawled:,}"
                )

            # 네이버 API 속도 제한 (초당 ~8회)
            time.sleep(0.12)

        if len(products) < page_size:
            break
        page_offset += page_size

    # 남은 버퍼 플러시
    if buffer:
        ok, err = _flush_buffer(supabase, buffer)
        upserted += ok
        upsert_errors += err
        buffer.clear()

    return {
        "processed": processed,
        "searched": searched,
        "prices_found": prices_found,
        "upserted": upserted,
        "errors": upsert_errors,
        "skipped_crawled": skipped_crawled,
        "skipped_no_query": skipped_no_query,
        "platforms": platform_counts,
    }


# ═══════════════════════════════════════════════════════
#  5. 독립 실행 모드 (Supabase 없이 테스트)
# ═══════════════════════════════════════════════════════

def test_search(keyword: str):
    """API 키만으로 단일 검색 테스트."""
    log.info(f"=== 테스트 검색: '{keyword}' ===\n")

    # 네이버
    log.info("[네이버 쇼핑]")
    items = naver_search(keyword, display=5)
    for item in items:
        log.info(
            f"  {item['title'][:30]:30s}  "
            f"{int(item.get('lprice', 0)):>8,}원  "
            f"{item.get('mallName', '?'):>10s}  "
            f"{classify_platform(item.get('mallName',''), item.get('link',''))}"
        )

    # 쿠팡
    if COUPANG_ACCESS_KEY:
        log.info("\n[쿠팡 파트너스]")
        items = coupang_search(keyword, limit=3)
        for item in items:
            log.info(
                f"  {item.get('productName','')[:30]:30s}  "
                f"{int(item.get('productPrice', 0)):>8,}원  "
                f"로켓={'Y' if item.get('isRocket') else 'N'}"
            )

    # 컬리 링크
    log.info(f"\n[마켓컬리 검색 링크]")
    log.info(f"  {kurly_search_link(keyword)}")


# ═══════════════════════════════════════════════════════
#  메인
# ═══════════════════════════════════════════════════════

def main():
    import argparse

    parser = argparse.ArgumentParser(description="케어푸드 가격 크롤러 (스트리밍)")
    parser.add_argument(
        "--test", type=str, default=None,
        help="단일 키워드 테스트 (예: --test '저염 도시락')"
    )
    parser.add_argument(
        "--max", type=int, default=2000,
        help="최대 처리 제품 수 (기본: 2000, 0=전체)"
    )
    parser.add_argument(
        "--no-coupang", action="store_true",
        help="쿠팡 파트너스 API 미사용"
    )
    parser.add_argument(
        "--no-skip", action="store_true",
        help="이미 가격이 수집된 제품도 다시 크롤링"
    )
    parser.add_argument(
        "--trends", action="store_true",
        help="가격 크롤링 대신 쇼핑인사이트 트렌드 분석 실행"
    )
    args = parser.parse_args()

    # 환경변수 CRAWL_MAX가 있으면 --max 오버라이드 (Render 시작 명령 하드코딩 우회)
    crawl_max_env = os.environ.get("CRAWL_MAX")
    if crawl_max_env:
        args.max = int(crawl_max_env)

    # 테스트 모드
    if args.test:
        test_search(args.test)
        return

    # 트렌드 분석 모드
    if args.trends:
        run_trend_analysis()
        return

    # 풀 모드 — Supabase 필수
    if not SUPABASE_URL or not SUPABASE_KEY:
        log.error("SUPABASE_URL/KEY가 설정되지 않았습니다.")
        log.info("테스트: python crawl_prices.py --test '저염 도시락'")
        sys.exit(1)

    # 채널별 API 키 상태
    channels = []
    if NAVER_CLIENT_ID:
        channels.append("네이버")
    else:
        log.warning("NAVER_CLIENT_ID 미설정 — 네이버 채널 스킵")
    if COUPANG_ACCESS_KEY and not args.no_coupang:
        channels.append("쿠팡")

    if not NAVER_CLIENT_ID and not COUPANG_ACCESS_KEY:
        log.error("네이버/쿠팡 API 키가 모두 없습니다.")
        log.info("발급: https://developers.naver.com/apps/#/register")
        sys.exit(1)

    log.info("=" * 50)
    log.info("가격 크롤러 시작 (스트리밍 모드)")
    log.info(f"  활성 채널: {', '.join(channels)}")
    log.info(f"  최대 처리: {args.max if args.max > 0 else '전체'}")
    log.info(f"  기존 스킵: {'아니오' if args.no_skip else '예'}")
    log.info(f"  시작 시간: {datetime.now().isoformat()}")
    log.info("=" * 50)

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    stats = crawl_streaming(
        supabase,
        max_products=args.max,
        use_coupang=bool(COUPANG_ACCESS_KEY) and not args.no_coupang,
        skip_crawled=not args.no_skip,
    )

    # ─── 리포트 ───
    log.info("=" * 50)
    log.info("크롤링 완료 리포트")
    log.info("=" * 50)
    log.info(f"  처리 제품:  {stats['processed']:,}")
    log.info(f"  API 검색:  {stats['searched']:,}")
    log.info(f"  수집 가격:  {stats['prices_found']:,}")
    log.info(f"  DB 적재:   {stats['upserted']:,}")
    log.info(f"  적재 실패:  {stats['errors']:,}")
    log.info(f"  스킵(기존): {stats['skipped_crawled']:,}")
    log.info(f"  스킵(쿼리): {stats['skipped_no_query']:,}")
    if stats["platforms"]:
        log.info("  플랫폼별:")
        for platform, count in sorted(
            stats["platforms"].items(), key=lambda x: -x[1]
        ):
            log.info(f"    {platform:>12}: {count:>6,}건")
    log.info(f"  종료 시간: {datetime.now().isoformat()}")
    log.info("=" * 50)


if __name__ == "__main__":
    main()
