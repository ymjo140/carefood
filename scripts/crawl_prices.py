"""
쿠팡/마켓컬리/네이버 가격 크롤러 → product_prices 테이블 적재
================================================================
3개 채널 전략:
  1) 네이버 쇼핑 API (1차): 모든 쇼핑몰 최저가를 한번에 수집
  2) 쿠팡 파트너스 API (2차): 쿠팡 어필리에이트 링크 생성 (수수료 수익)
  3) 마켓컬리 (3차): 검색 URL 기반 아웃링크 생성

사용법:
  pip install requests supabase python-dotenv
  cp .env.example .env   # 키 채우기
  python crawl_prices.py

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

def strip_html(text: str) -> str:
    """네이버 API 응답의 <b> 태그 제거."""
    return re.sub(r"</?b>", "", text or "")


def naver_search(query: str, display: int = 20) -> list[dict]:
    """
    네이버 쇼핑 검색 API 호출.

    Returns:
        [{title, link, image, lprice, mallName, productId, ...}, ...]
    """
    if not NAVER_CLIENT_ID:
        log.warning("NAVER_CLIENT_ID 미설정 — 네이버 검색 스킵")
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
        resp.raise_for_status()
        data = resp.json()
        items = data.get("items", [])

        # HTML 태그 정리
        for item in items:
            item["title"] = strip_html(item.get("title", ""))

        return items

    except requests.RequestException as e:
        log.error(f"네이버 검색 실패 [{query}]: {e}")
        return []


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
#  4. 메인 파이프라인
# ═══════════════════════════════════════════════════════

def load_products(supabase: Client) -> list[dict]:
    """
    products 테이블에서 검색 대상 제품 로드.
    이름과 ID만 가져온다.
    """
    all_products = []
    page_size = 1000
    offset = 0

    while True:
        result = (
            supabase.table("products")
            .select("id, name, serving_size_g, category_large")
            .eq("is_active", True)
            .range(offset, offset + page_size - 1)
            .execute()
        )
        batch = result.data or []
        all_products.extend(batch)

        if len(batch) < page_size:
            break
        offset += page_size

    log.info(f"검색 대상 제품: {len(all_products):,}건")
    return all_products


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


def crawl_product_prices(
    supabase: Client,
    products: list[dict],
    use_coupang: bool = True,
    max_products: int = 0,
) -> list[dict]:
    """
    제품 목록을 순회하며 가격 정보 수집.

    Args:
        supabase: Supabase 클라이언트
        products: products 테이블 레코드 리스트
        use_coupang: 쿠팡 파트너스 API 사용 여부
        max_products: 최대 처리 건수 (0=전체)
    """
    all_price_records = []
    coupang_calls = 0
    MAX_COUPANG_PER_HOUR = 9  # 안전 마진

    targets = products[:max_products] if max_products > 0 else products
    total = len(targets)

    for i, product in enumerate(targets):
        product_id = product["id"]
        query = build_search_query(product)

        if not query or len(query) < 2:
            continue

        # ─── 네이버 쇼핑 검색 (1차) ───
        naver_items = naver_search(query, display=10)
        if naver_items:
            records = naver_to_price_records(
                product_id,
                naver_items,
                product.get("serving_size_g"),
            )
            all_price_records.extend(records)

        # ─── 쿠팡 파트너스 (2차 — 어필리에이트 링크) ───
        # 쿠팡 결과가 네이버에서 이미 있으면 스킵
        has_coupang = any(r["platform"] == "coupang" for r in all_price_records[-10:])

        if use_coupang and not has_coupang and coupang_calls < MAX_COUPANG_PER_HOUR:
            coupang_items = coupang_search(query, limit=3)
            for item in coupang_items[:1]:  # 최저가 1건만
                record = coupang_to_price_record(product_id, item)
                if record:
                    all_price_records.append(record)
            coupang_calls += 1

        # ─── 진행률 로깅 ───
        if (i + 1) % 50 == 0 or i == total - 1:
            log.info(
                f"  진행: {i+1:>5}/{total}  "
                f"수집 가격: {len(all_price_records):,}건  "
                f"쿠팡API: {coupang_calls}회"
            )

        # 네이버 API 속도 제한 (초당 10회 이내)
        time.sleep(0.15)

    log.info(f"가격 수집 완료: 총 {len(all_price_records):,}건")
    return all_price_records


def upsert_prices(supabase: Client, records: list[dict]):
    """product_prices 테이블에 upsert."""
    total = len(records)
    inserted = 0
    errors = 0

    for i in range(0, total, UPSERT_CHUNK):
        chunk = records[i : i + UPSERT_CHUNK]
        try:
            supabase.table("product_prices").upsert(
                chunk,
                on_conflict="product_id,platform",
            ).execute()
            inserted += len(chunk)
            log.info(f"  upsert {i+1}~{i+len(chunk)} / {total}")
        except Exception as e:
            # on_conflict 컬럼 조합에 unique 제약이 없으면 insert로 대체
            try:
                supabase.table("product_prices").insert(chunk).execute()
                inserted += len(chunk)
            except Exception as e2:
                errors += len(chunk)
                log.error(f"  적재 실패 ({i+1}~{i+len(chunk)}): {e2}")

    log.info(f"적재 완료: 성공 {inserted:,} / 실패 {errors}")


def print_crawl_stats(records: list[dict]):
    """크롤링 결과 통계."""
    from collections import Counter
    platforms = Counter(r["platform"] for r in records)

    log.info("=" * 50)
    log.info("크롤링 결과 통계")
    log.info("=" * 50)
    log.info(f"  총 가격 레코드: {len(records):,}")
    for platform, count in platforms.most_common():
        log.info(f"  {platform:>12}: {count:>6,}건")

    prices = [r["price"] for r in records if r["price"]]
    if prices:
        log.info(f"  가격 범위: {min(prices):,}원 ~ {max(prices):,}원")
        log.info(f"  평균 가격: {sum(prices)//len(prices):,}원")
    log.info("=" * 50)


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

    parser = argparse.ArgumentParser(description="케어푸드 가격 크롤러")
    parser.add_argument(
        "--test", type=str, default=None,
        help="단일 키워드 테스트 (예: --test '저염 도시락')"
    )
    parser.add_argument(
        "--max", type=int, default=0,
        help="최대 처리 제품 수 (0=전체, 테스트 시 50 권장)"
    )
    parser.add_argument(
        "--no-coupang", action="store_true",
        help="쿠팡 파트너스 API 미사용"
    )
    args = parser.parse_args()

    # 테스트 모드
    if args.test:
        test_search(args.test)
        return

    # 풀 모드 — Supabase 필수
    if not SUPABASE_URL or not SUPABASE_KEY:
        log.error("SUPABASE_URL/KEY가 설정되지 않았습니다.")
        log.info("테스트: python crawl_prices.py --test '저염 도시락'")
        sys.exit(1)

    if not NAVER_CLIENT_ID:
        log.error("NAVER_CLIENT_ID가 설정되지 않았습니다.")
        log.info("발급: https://developers.naver.com/apps/#/register → 검색 API 선택")
        sys.exit(1)

    log.info("=" * 50)
    log.info("가격 크롤러 시작")
    log.info(f"시작 시간: {datetime.now().isoformat()}")
    log.info("=" * 50)

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    # Step 1: 검색 대상 제품 로드
    log.info("[1/3] 제품 목록 로드 중...")
    products = load_products(supabase)
    if not products:
        log.error("products 테이블이 비어있습니다. ingest_mfds.py를 먼저 실행하세요.")
        sys.exit(1)

    # Step 2: 가격 크롤링
    log.info("[2/3] 가격 크롤링 중...")
    price_records = crawl_product_prices(
        supabase,
        products,
        use_coupang=not args.no_coupang,
        max_products=args.max,
    )

    if not price_records:
        log.warning("수집된 가격 데이터가 없습니다.")
        return

    # 통계
    print_crawl_stats(price_records)

    # JSON 백업
    backup_path = f"prices_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(backup_path, "w", encoding="utf-8") as f:
        json.dump(price_records, f, ensure_ascii=False, indent=2, default=str)
    log.info(f"백업 저장: {backup_path}")

    # Step 3: Supabase 적재
    log.info("[3/3] Supabase 적재 중...")
    upsert_prices(supabase, price_records)

    log.info("=" * 50)
    log.info(f"완료! {len(price_records):,}건 가격 정보 처리")
    log.info(f"종료 시간: {datetime.now().isoformat()}")
    log.info("=" * 50)


if __name__ == "__main__":
    main()
