"""
오아시스마켓(oasis.co.kr) 식품 크롤러
================================================================
카테고리별 상품 목록 HTML 파싱 → Supabase oasis_products 적재

수집 흐름:
  1) requests + Referer 헤더로 카테고리 페이지 순회
  2) BeautifulSoup으로 상품 정보 파싱 (SSR)
  3) Supabase oasis_products 테이블에 upsert
  4) 매운맛 점수 산출

사용법:
  python crawl_oasis.py                  # 전체 크롤링
  python crawl_oasis.py --test           # 테스트 (1 카테고리, 1 페이지)
  python crawl_oasis.py --categories 111,112  # 특정 카테고리만

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
import argparse
from datetime import datetime, timezone

import requests
from bs4 import BeautifulSoup

# ── 로깅 ──────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("crawl_oasis.log", encoding="utf-8"),
    ],
)
log = logging.getLogger(__name__)

# ── 설정 ──────────────────────────────────────────────────────
OASIS_BASE = "https://www.oasis.co.kr"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)
REFERER = "https://www.oasis.co.kr/main"

# 식품 카테고리 (카테고리ID: 이름)
CATEGORIES = {
    "111": "간편가정식",
    "112": "채소",
    "113": "과일",
    "114": "수산·해산",
    "213": "축산",
    "214": "달걀·유제품",
    "117": "간식·빵·떡",
    "118": "건강·음료",
    "119": "쌀·잡곡·견과",
    "120": "양념·오일",
    "121": "국·반찬·김치",
    "215": "면·통조림·가공식품",
}

ROWS_PER_PAGE = 60
MAX_PAGES = 30
REQUEST_DELAY = (0.5, 1.5)

# ── 매운맛 키워드 ─────────────────────────────────────────────
SPICY_KEYWORDS = {
    5: re.compile(r"핵불|핵매운|지옥|극한매운"),
    4: re.compile(r"불닭|불맛|엑스트라핫"),
    3: re.compile(
        r"청양|매운|매콤|얼큰|칼칼|화끈|짬뽕|마라|할라피뇨|칠리|핫|닭발|"
        r"쭈꾸미|주꾸미|낙지볶음|다대기|라볶이|부대찌개|부대전골|김치찌개|"
        r"김치볶음|김치전|돼지불백|불백|육개장|해장국|타바스코|스리라차|"
        r"삼발|핫칠리|칠리소스|핫페퍼|레드페퍼|카이엔|탄두리|빈달루"
    ),
    2: re.compile(
        r"고추|고춧|떡볶이|카레|겨자|와사비|고추냉이|머스타드|페퍼|제육|"
        r"비빔밥|비빔면|비빔국수|비빔냉면|고추장|쌈장|닭갈비|닭볶음|"
        r"순대볶음|쫄면|찜닭|오징어볶음|초고추장|양념게장|양념치킨|"
        r"양념소스|양념갈비|순두부찌개|커리|살사"
    ),
    1: re.compile(
        r"김치|불고기|후추|라면|컵라면|봉지라면|인스턴트면|볶음면|비빔|"
        r"깍두기|총각김치|열무김치|파김치|갓김치|감자탕|닭도리탕"
    ),
}


def calc_spicy_score(name: str) -> int:
    for level in (5, 4, 3, 2, 1):
        if SPICY_KEYWORDS[level].search(name):
            return level
    return 0


# ── 크롤링 ────────────────────────────────────────────────────
def create_session() -> requests.Session:
    s = requests.Session()
    s.headers.update({
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9",
    })
    # 메인 페이지에서 쿠키 획득 (필수 — 쿠키 없으면 403)
    log.info("쿠키 획득을 위해 메인 페이지 요청...")
    resp = s.get(f"{OASIS_BASE}/main", timeout=30)
    log.info(f"메인 페이지 응답: {resp.status_code}, 쿠키: {len(s.cookies)}개")
    s.headers["Referer"] = REFERER
    return s


def parse_product_list(html: str) -> list:
    """상품 목록 HTML에서 상품 정보 추출"""
    soup = BeautifulSoup(html, "html.parser")
    products = []

    items = soup.select("[data-productid]")

    for item in items:
        try:
            product_id = item.get("data-productid", "")
            if not product_id:
                continue

            # 상품명: img alt에서 "대표이미지 섬네일" 제거
            name = ""
            img_el = item.select_one("img[alt]")
            if img_el:
                alt = img_el.get("alt", "").strip()
                name = re.sub(r"\s*대표이미지\s*섬네일\s*$", "", alt).strip()
            if not name:
                # wrapInfo 영역에서 텍스트 추출
                info_el = item.select_one(".info_group2, .wrapInfo")
                if info_el:
                    name = info_el.get_text(strip=True).split("쿠폰")[0].strip()

            # 할인가 (price_discount)
            discounted_price = None
            discount_el = item.select_one(".price_discount")
            if discount_el:
                price_text = re.sub(r"[^\d]", "", discount_el.get_text(strip=True))
                if price_text:
                    discounted_price = int(price_text)

            # 원가 (price_original)
            base_price = None
            base_el = item.select_one(".price_original")
            if base_el:
                price_text = re.sub(r"[^\d]", "", base_el.get_text(strip=True))
                if price_text:
                    base_price = int(price_text)

            # 할인가 없으면 info_price에서 가격 추출
            if not discounted_price:
                price_el = item.select_one(".info_price")
                if price_el:
                    price_text = re.sub(r"[^\d]", "", price_el.get_text(strip=True))
                    if price_text:
                        discounted_price = int(price_text)

            # 할인율
            discount_rate = None
            rate_el = item.select_one(".price_discountRate")
            if rate_el:
                rate_text = re.sub(r"[^\d]", "", rate_el.get_text(strip=True))
                if rate_text:
                    discount_rate = int(rate_text)

            # 이미지 — data-src (lazy loaded) 또는 src
            img_url = ""
            if img_el:
                img_url = img_el.get("data-src", "") or img_el.get("src", "")
            if img_url and not img_url.startswith("http"):
                img_url = OASIS_BASE + img_url

            if name and product_id:
                products.append({
                    "oasis_id": str(product_id),
                    "name": name,
                    "base_price": base_price,
                    "discounted_price": discounted_price or base_price,
                    "discount_rate": discount_rate,
                    "main_image_url": img_url,
                    "url": f"{OASIS_BASE}/product/detail/{product_id}",
                })
        except Exception as e:
            log.warning(f"상품 파싱 실패: {e}")
            continue

    return products


def crawl_category(session: requests.Session, cat_id: str, cat_name: str,
                   max_pages: int = MAX_PAGES) -> list:
    """카테고리 전체 페이지 크롤링"""
    all_products = []
    seen_ids = set()

    for page in range(1, max_pages + 1):
        url = (
            f"{OASIS_BASE}/product/list"
            f"?categoryId={cat_id}&page={page}"
            f"&sort=priority&direction=desc&rows={ROWS_PER_PAGE}"
        )

        try:
            resp = session.get(url, timeout=30)
            if resp.status_code == 403:
                log.warning(f"  {cat_name} 페이지 {page}: 403 차단")
                break
            resp.raise_for_status()
        except Exception as e:
            log.warning(f"  {cat_name} 페이지 {page} 요청 실패: {e}")
            break

        products = parse_product_list(resp.text)

        if not products:
            log.info(f"  {cat_name} 페이지 {page}: 상품 없음, 종료")
            break

        new_products = []
        for p in products:
            if p["oasis_id"] not in seen_ids:
                seen_ids.add(p["oasis_id"])
                p["categories"] = json.dumps({"id": cat_id, "name": cat_name}, ensure_ascii=False)
                p["spicy_score"] = calc_spicy_score(p["name"])
                new_products.append(p)

        all_products.extend(new_products)
        log.info(f"  {cat_name} 페이지 {page}: {len(new_products)}개 신규 (누적 {len(all_products)})")

        if len(products) < ROWS_PER_PAGE:
            break

        time.sleep(random.uniform(*REQUEST_DELAY))

    return all_products


# ── Supabase 업로드 ───────────────────────────────────────────
def upsert_to_supabase(products: list, supabase_url: str, supabase_key: str):
    """Supabase oasis_products 테이블에 upsert"""
    session = requests.Session()
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }

    batch_size = 50
    total = len(products)
    success = 0

    for i in range(0, total, batch_size):
        batch = products[i : i + batch_size]
        rows = []
        for p in batch:
            rows.append({
                "oasis_id": p["oasis_id"],
                "name": p["name"],
                "base_price": p.get("base_price"),
                "discounted_price": p.get("discounted_price"),
                "discount_rate": p.get("discount_rate"),
                "categories": json.loads(p["categories"]) if isinstance(p["categories"], str) else p["categories"],
                "main_image_url": p.get("main_image_url"),
                "url": p.get("url"),
                "is_available": True,
                "last_crawled_at": datetime.now(timezone.utc).isoformat(),
                "spicy_score": p.get("spicy_score", 0),
                "match_status": "pending",
            })

        for attempt in range(3):
            try:
                resp = session.post(
                    f"{supabase_url}/rest/v1/oasis_products",
                    json=rows,
                    headers=headers,
                    timeout=30,
                )
                resp.raise_for_status()
                success += len(batch)
                break
            except Exception as e:
                if attempt < 2:
                    time.sleep(2 * (attempt + 1))
                else:
                    log.error(f"배치 upsert 실패: {e}")

        if (i + batch_size) % 200 == 0 or i + batch_size >= total:
            log.info(f"  업로드: {min(i + batch_size, total)}/{total}")

    log.info(f"업로드 완료: {success}/{total}")
    return success


# ── 메인 ──────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="오아시스마켓 크롤러")
    parser.add_argument("--test", action="store_true", help="테스트 모드 (1 카테고리, 1 페이지)")
    parser.add_argument("--categories", type=str, help="크롤링할 카테고리 ID (콤마 구분)")
    args = parser.parse_args()

    supabase_url = os.environ.get("SUPABASE_URL", "")
    supabase_key = os.environ.get("SUPABASE_KEY", "")
    if not supabase_url or not supabase_key:
        log.error("SUPABASE_URL, SUPABASE_KEY 환경변수 필요")
        sys.exit(1)

    # 크롤링 대상 결정
    categories = CATEGORIES.copy()
    if args.categories:
        ids = args.categories.split(",")
        categories = {k: v for k, v in CATEGORIES.items() if k in ids}

    max_pages = 1 if args.test else MAX_PAGES
    if args.test:
        first_key = list(categories.keys())[0]
        categories = {first_key: categories[first_key]}

    log.info(f"=== 오아시스마켓 크롤링 시작 ({len(categories)}개 카테고리) ===")

    session = create_session()
    all_products = []

    for cat_id, cat_name in categories.items():
        log.info(f"카테고리: {cat_name} ({cat_id})")
        products = crawl_category(session, cat_id, cat_name, max_pages)
        all_products.extend(products)
        log.info(f"  → {cat_name}: {len(products)}개 수집")
        time.sleep(random.uniform(1.0, 2.0))

    log.info(f"총 수집: {len(all_products)}개 상품")

    if not all_products:
        log.warning("수집된 상품 없음")
        return

    # 통계
    prices = [p["discounted_price"] for p in all_products if p.get("discounted_price")]
    if prices:
        log.info(f"가격 통계: 평균 {sum(prices)//len(prices):,}원, "
                 f"최저 {min(prices):,}원, 최고 {max(prices):,}원")

    spicy_dist = {}
    for p in all_products:
        s = p.get("spicy_score", 0)
        spicy_dist[s] = spicy_dist.get(s, 0) + 1
    log.info(f"매운맛 분포: {dict(sorted(spicy_dist.items()))}")

    # Supabase 업로드
    log.info("Supabase 업로드 시작...")
    upsert_to_supabase(all_products, supabase_url, supabase_key)

    log.info("=== 오아시스마켓 크롤링 완료 ===")


if __name__ == "__main__":
    main()
