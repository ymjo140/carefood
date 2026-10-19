"""
마켓컬리(Kurly) 전체 식품 크롤러
================================================================
카테고리별 상품 목록 → 상품 상세 정보 수집 → Supabase 적재

수집 흐름:
  1) Playwright로 카테고리 페이지 순회 → 상품 ID 목록 수집
  2) requests + SSR(__NEXT_DATA__)로 상품 상세 추출 (병렬 4 workers)
  3) Supabase kurly_products 테이블에 upsert
  4) MFDS 영양 DB 매칭 + 매운맛 점수 산출

대상 카테고리 (전체 식품):
  907: 채소 / 908: 과일·견과·쌀 / 909: 수산·해산·건어물
  910: 정육·가공육·달걀 / 911: 국·반찬·메인요리
  912: 간편식·밀키트·샐러드 / 913: 면·양념·오일
  914: 생수·음료 / 383: 커피·차 / 249: 간식·과자·떡
  915: 베이커리 / 018: 유제품 / 032: 건강식품

사용법:
  python crawl_kurly.py                  # 전체 크롤링
  python crawl_kurly.py --test           # 테스트 (1 카테고리, 5 상품)
  python crawl_kurly.py --categories 912,911  # 특정 카테고리만
  python crawl_kurly.py --workers 8      # 병렬 워커 수 조절

환경변수:
  SUPABASE_URL  - Supabase 프로젝트 URL
  SUPABASE_KEY  - Supabase service_role 키
"""

import os
import re
import sys
import json
import time
import random
import logging
import asyncio
import argparse
from datetime import datetime, timezone
from typing import Optional

from concurrent.futures import ThreadPoolExecutor, as_completed

import requests
from bs4 import BeautifulSoup

# ── 로깅 ──────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("crawl_kurly.log", encoding="utf-8"),
    ],
)
log = logging.getLogger(__name__)

# ── 설정 ──────────────────────────────────────────────────────
KURLY_BASE = "https://www.kurly.com"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)

# 크롤링 대상 카테고리 (전체 식품)
CATEGORIES = {
    "907": "채소",
    "908": "과일·견과·쌀",
    "909": "수산·해산·건어물",
    "910": "정육·가공육·달걀",
    "911": "국·반찬·메인요리",
    "912": "간편식·밀키트·샐러드",
    "913": "면·양념·오일",
    "914": "생수·음료",
    "383": "커피·차",
    "249": "간식·과자·떡",
    "915": "베이커리",
    "018": "유제품",
    "032": "건강식품",
}

# 하위 카테고리 (개별 지정 시 사용)
SUB_CATEGORIES = {
    "912001": "밀키트",
    "912002": "샐러드·샌드위치",
    "912003": "도시락·볶음밥",
    "912004": "죽·스프·시리얼",
    "912005": "간편국·탕·찌개",
    "911001": "국·탕·찌개",
    "911002": "밑반찬",
    "911003": "김치·젓갈·장류",
    "911004": "메인요리",
}

CHROMIUM_PATH = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
REQUEST_DELAY = (0.3, 1.0)  # 상품 상세 요청 간 랜덤 딜레이 (초)
MAX_PAGES_PER_CATEGORY = 50  # 카테고리당 최대 페이지
DEFAULT_WORKERS = 6  # 병렬 워커 수


# ── Playwright: 카테고리 → 상품 ID 수집 ──────────────────────
async def collect_product_ids(categories: dict, max_pages: int = MAX_PAGES_PER_CATEGORY) -> dict:
    """카테고리별 상품 ID 목록 수집 (Playwright)"""
    from playwright.async_api import async_playwright

    all_products = {}  # category_id -> [product_id, ...]

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            executable_path=CHROMIUM_PATH,
            args=["--no-sandbox", "--disable-setuid-sandbox"],
        )
        page = await browser.new_page(
            user_agent=USER_AGENT,
            locale="ko-KR",
        )

        for cat_id, cat_name in categories.items():
            log.info(f"카테고리 수집 시작: {cat_name} ({cat_id})")
            product_ids = set()

            for page_num in range(1, max_pages + 1):
                url = f"{KURLY_BASE}/categories/{cat_id}?page={page_num}"
                try:
                    resp = await page.goto(url, timeout=30000)
                    if resp.status != 200:
                        log.warning(f"  페이지 {page_num} 응답 {resp.status}, 중단")
                        break

                    await page.wait_for_timeout(2000)

                    ids = await page.evaluate("""() => {
                        const links = document.querySelectorAll('a[href*="/goods/"]');
                        const seen = new Set();
                        for (const link of links) {
                            const m = link.getAttribute('href').match(/\\/goods\\/(\\d+)/);
                            if (m) seen.add(m[1]);
                        }
                        return [...seen];
                    }""")

                    if not ids:
                        log.info(f"  페이지 {page_num}: 상품 없음, 종료")
                        break

                    new_count = len(set(ids) - product_ids)
                    product_ids.update(ids)
                    log.info(f"  페이지 {page_num}: {len(ids)}개 발견 (신규 {new_count}개, 누적 {len(product_ids)}개)")

                    if new_count == 0:
                        break

                except Exception as e:
                    log.error(f"  페이지 {page_num} 오류: {e}")
                    break

            all_products[cat_id] = list(product_ids)
            log.info(f"카테고리 {cat_name}: 총 {len(product_ids)}개 상품 수집 완료")

        await browser.close()

    return all_products


# ── requests: 상품 상세 정보 추출 (SSR) ──────────────────────
def fetch_product_detail(product_id: str) -> Optional[dict]:
    """SSR __NEXT_DATA__에서 상품 상세 추출"""
    url = f"{KURLY_BASE}/goods/{product_id}"
    headers = {"User-Agent": USER_AGENT}

    try:
        resp = requests.get(url, headers=headers, timeout=15)
        if resp.status_code != 200:
            log.warning(f"상품 {product_id}: HTTP {resp.status_code}")
            return None

        soup = BeautifulSoup(resp.text, "html.parser")
        script = soup.find("script", id="__NEXT_DATA__")
        if not script:
            log.warning(f"상품 {product_id}: __NEXT_DATA__ 없음")
            return None

        data = json.loads(script.string)
        product = data.get("props", {}).get("pageProps", {}).get("product", {})
        if not product:
            log.warning(f"상품 {product_id}: pageProps.product 없음")
            return None

        # 영양 정보 추출
        nutrition = {}
        nutrition_info = product.get("nutritionInformation", {})
        if nutrition_info:
            for item in nutrition_info.get("nutrients", []):
                name = item.get("name", "")
                value = item.get("value", "")
                nutrition[name] = value

        # 카테고리 경로
        categories = product.get("categoryNames", [])
        # 첫 번째 항목 'CATEGORY' 제거
        if categories and categories[0] == "CATEGORY":
            categories = categories[1:]

        result = {
            "kurly_id": str(product.get("no", product_id)),
            "name": product.get("name", ""),
            "base_price": product.get("basePrice"),
            "discounted_price": product.get("discountedPrice"),
            "discount_rate": product.get("discountRate", 0),
            "short_description": product.get("shortDescription", ""),
            "volume": product.get("volume", ""),
            "unit_price_text": product.get("unitPriceText", ""),
            "allergy": product.get("allergy", ""),
            "categories": categories,
            "main_image_url": product.get("mainImageUrl", ""),
            "seller_name": product.get("sellerName", ""),
            "review_count": product.get("reviewCount", 0),
            "delivery_types": product.get("deliveryTypeNames", []),
            "nutrition": nutrition,
            "url": url,
            "is_available": product.get("isSoldOut", False) is False,
        }

        return result

    except requests.RequestException as e:
        log.error(f"상품 {product_id} 요청 실패: {e}")
        return None
    except (json.JSONDecodeError, KeyError) as e:
        log.error(f"상품 {product_id} 파싱 실패: {e}")
        return None


# ── Supabase 적재 ────────────────────────────────────────────
def init_supabase():
    """Supabase 클라이언트 초기화"""
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")

    if not url or not key:
        log.warning("SUPABASE_URL / SUPABASE_KEY 미설정 → DB 적재 건너뜀")
        return None

    try:
        from supabase import create_client
        return create_client(url, key)
    except Exception as e:
        log.error(f"Supabase 연결 실패: {e}")
        return None


def upsert_kurly_products(supabase, products: list[dict]) -> int:
    """kurly_products 테이블에 upsert (kurly_id 기준)"""
    if not supabase or not products:
        return 0

    now = datetime.now(timezone.utc).isoformat()
    rows = []
    for p in products:
        rows.append({
            "kurly_id": p["kurly_id"],
            "name": p["name"],
            "base_price": p["base_price"],
            "discounted_price": p["discounted_price"],
            "discount_rate": p["discount_rate"],
            "short_description": p["short_description"],
            "volume": p["volume"],
            "unit_price_text": p["unit_price_text"],
            "allergy": p["allergy"],
            "categories": p["categories"],
            "main_image_url": p["main_image_url"],
            "seller_name": p["seller_name"],
            "review_count": p["review_count"],
            "delivery_types": p["delivery_types"],
            "nutrition": p["nutrition"],
            "url": p["url"],
            "is_available": p["is_available"],
            "last_crawled_at": now,
        })

    try:
        # 배치 upsert (50개씩)
        upserted = 0
        batch_size = 50
        for i in range(0, len(rows), batch_size):
            batch = rows[i:i + batch_size]
            result = (
                supabase.table("kurly_products")
                .upsert(batch, on_conflict="kurly_id")
                .execute()
            )
            upserted += len(result.data) if result.data else 0

        return upserted
    except Exception as e:
        log.error(f"Supabase upsert 실패: {e}")
        return 0


# ── 병렬 상품 상세 수집 ─────────────────────────────────────
def fetch_products_parallel(product_ids: list, workers: int = DEFAULT_WORKERS) -> tuple[list, int]:
    """ThreadPoolExecutor로 병렬 상품 상세 수집"""
    products = []
    failed = 0
    total = len(product_ids)

    def _fetch_with_delay(pid):
        time.sleep(random.uniform(*REQUEST_DELAY))
        return fetch_product_detail(pid)

    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(_fetch_with_delay, pid): pid for pid in product_ids}
        for i, future in enumerate(as_completed(futures), 1):
            result = future.result()
            if result:
                products.append(result)
            else:
                failed += 1

            if i % 100 == 0 or i == total:
                log.info(f"  진행: {i}/{total} (성공 {len(products)}, 실패 {failed})")

    return products, failed


# ── 메인 실행 ────────────────────────────────────────────────
async def main():
    parser = argparse.ArgumentParser(description="마켓컬리 전체 식품 크롤러")
    parser.add_argument("--test", action="store_true", help="테스트 모드 (1 카테고리, 5 상품)")
    parser.add_argument("--categories", type=str, help="카테고리 ID 콤마 구분 (예: 912,911)")
    parser.add_argument("--max-products", type=int, default=0, help="카테고리당 최대 상품 수 (0=무제한)")
    parser.add_argument("--workers", type=int, default=DEFAULT_WORKERS, help=f"병렬 워커 수 (기본 {DEFAULT_WORKERS})")
    parser.add_argument("--dry-run", action="store_true", help="DB 적재 없이 수집만")
    args = parser.parse_args()

    # 카테고리 결정
    all_cats = {**CATEGORIES, **SUB_CATEGORIES}
    if args.categories:
        cat_ids = args.categories.split(",")
        categories = {cid: all_cats.get(cid, cid) for cid in cat_ids}
    elif args.test:
        categories = {"912": "간편식·밀키트·샐러드"}
    else:
        categories = dict(CATEGORIES)

    log.info(f"=== 마켓컬리 크롤러 시작 ===")
    log.info(f"대상 카테고리: {len(categories)}개 - {list(categories.values())}")
    log.info(f"병렬 워커: {args.workers}개")

    # 1. 카테고리 → 상품 ID 수집
    log.info("--- 1단계: 카테고리 페이지에서 상품 ID 수집 ---")
    max_pages = 2 if args.test else MAX_PAGES_PER_CATEGORY
    all_product_ids = await collect_product_ids(categories, max_pages=max_pages)

    total_ids = sum(len(ids) for ids in all_product_ids.values())
    log.info(f"총 {total_ids}개 상품 ID 수집 완료")

    # 중복 제거 (카테고리 간)
    unique_ids = set()
    for ids in all_product_ids.values():
        unique_ids.update(ids)
    log.info(f"중복 제거 후: {len(unique_ids)}개")

    # 테스트 모드: 5개만
    if args.test:
        unique_ids = set(list(unique_ids)[:5])
        log.info(f"테스트 모드: {len(unique_ids)}개만 처리")

    if args.max_products > 0:
        unique_ids = set(list(unique_ids)[:args.max_products])
        log.info(f"최대 {args.max_products}개 제한: {len(unique_ids)}개 처리")

    # 2. 상품 상세 수집 (병렬)
    log.info(f"--- 2단계: 상품 상세 정보 수집 ({len(unique_ids)}개, {args.workers} workers) ---")
    products, failed = fetch_products_parallel(list(unique_ids), workers=args.workers)
    log.info(f"상세 수집 완료: 성공 {len(products)}개, 실패 {failed}개")

    # 3. 결과 출력 / DB 적재
    if args.dry_run:
        log.info("--- dry-run 모드: DB 적재 건너뜀 ---")
        for p in products[:3]:
            log.info(f"  [{p['kurly_id']}] {p['name']} - {p['base_price']}원")
            if p["nutrition"]:
                log.info(f"    영양: {dict(list(p['nutrition'].items())[:3])}")
    else:
        log.info("--- 3단계: Supabase 적재 ---")
        supabase = init_supabase()
        if supabase:
            upserted = upsert_kurly_products(supabase, products)
            log.info(f"Supabase 적재 완료: {upserted}개")
        else:
            log.info("Supabase 미연결 → JSON 파일로 저장")
            output_file = "kurly_products.json"
            with open(output_file, "w", encoding="utf-8") as f:
                json.dump(products, f, ensure_ascii=False, indent=2)
            log.info(f"저장 완료: {output_file} ({len(products)}개)")

    # 요약
    log.info(f"=== 크롤링 완료 ===")
    log.info(f"카테고리: {len(categories)}개")
    log.info(f"수집 상품: {len(products)}개")
    if products:
        avg_price = sum(p["base_price"] or 0 for p in products) / len(products)
        with_nutrition = sum(1 for p in products if p["nutrition"])
        log.info(f"평균 가격: {avg_price:,.0f}원")
        log.info(f"영양정보 보유: {with_nutrition}/{len(products)}개")

    return products


if __name__ == "__main__":
    asyncio.run(main())
