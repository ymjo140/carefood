"""
홈플러스 온라인(mfront.homeplus.co.kr) 식품 크롤러
================================================================
검색 API를 활용한 카테고리별 상품 수집 → Supabase homeplus_products 적재

수집 흐름:
  1) 카테고리 맵 API로 전체 식품 카테고리 키워드 수집
  2) 검색 API(initSearch.json)로 키워드별 상품 목록 조회
  3) Supabase homeplus_products 테이블에 upsert
  4) 매운맛 점수 산출

사용법:
  python crawl_homeplus.py                  # 전체 크롤링
  python crawl_homeplus.py --test           # 테스트 (5개 키워드만)

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

# ── 로깅 ──────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("crawl_homeplus.log", encoding="utf-8"),
    ],
)
log = logging.getLogger(__name__)

# ── 설정 ──────────────────────────────────────────────────────
HOMEPLUS_BASE = "https://mfront.homeplus.co.kr"
USER_AGENT = (
    "Mozilla/5.0 (Linux; Android 13; SM-G991B) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Mobile Safari/537.36"
)

# 식품 카테고리 검색 키워드 (홈플러스 중분류 기반)
FOOD_KEYWORDS = [
    # 과일
    "사과", "배", "감귤", "딸기", "포도", "수박", "참외", "바나나", "키위", "망고",
    "블루베리", "체리", "복숭아", "자두", "레몬", "오렌지", "아보카도",
    # 채소
    "토마토", "감자", "고구마", "양파", "당근", "브로콜리", "시금치", "상추",
    "배추", "무", "파프리카", "오이", "호박", "대파", "마늘", "버섯", "콩나물",
    # 축산
    "소고기", "돼지고기", "닭고기", "삼겹살", "목살", "안심", "등심", "갈비",
    "불고기", "닭가슴살", "오리고기", "양고기", "소시지", "햄", "베이컨",
    "달걀", "계란",
    # 수산
    "연어", "고등어", "참치", "새우", "오징어", "조개", "미역", "김", "멸치",
    "굴", "전복", "꽃게", "갈치", "삼치", "광어", "우럭",
    # 유제품
    "우유", "요거트", "요구르트", "치즈", "버터", "크림",
    # 간편식
    "밀키트", "도시락", "샐러드", "샌드위치", "냉동밥", "볶음밥", "만두",
    "피자", "치킨너겟", "핫도그", "떡볶이", "순대", "김밥", "즉석국",
    "즉석밥", "죽", "스프",
    # 면류
    "라면", "우동", "파스타", "소면", "냉면", "쌀국수", "잔치국수",
    # 음료
    "생수", "주스", "탄산음료", "커피", "차", "두유", "식혜", "에너지드링크",
    # 간식
    "과자", "초콜릿", "사탕", "젤리", "아이스크림", "떡", "빵", "케이크",
    "쿠키", "견과류", "건과일",
    # 양념/소스
    "간장", "된장", "고추장", "소금", "설탕", "식초", "참기름", "들기름",
    "올리브오일", "케첩", "마요네즈", "카레", "소스",
    # 쌀/잡곡
    "쌀", "현미", "잡곡", "찹쌀", "보리",
    # 건강식품
    "프로바이오틱스", "비타민", "오메가3", "유산균", "홍삼", "꿀",
    # 김치/반찬
    "김치", "배추김치", "깍두기", "젓갈", "장아찌", "반찬", "조림", "볶음",
]

PER_PAGE = 60
MAX_PAGES_PER_KEYWORD = 5
REQUEST_DELAY = (0.3, 1.0)

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
        "Accept": "application/json",
        "Accept-Language": "ko-KR,ko;q=0.9",
        "Referer": f"{HOMEPLUS_BASE}/",
    })
    return s


def search_products(session: requests.Session, keyword: str,
                    max_pages: int = MAX_PAGES_PER_KEYWORD) -> list:
    """홈플러스 검색 API로 상품 목록 조회"""
    all_products = []
    seen_ids = set()

    for page in range(1, max_pages + 1):
        url = (
            f"{HOMEPLUS_BASE}/totalsearch/total/search/initSearch.json"
            f"?keyword={keyword}&page={page}&perPage={PER_PAGE}"
            f"&storeType=HYPER&storeId=37&sortType=POPULAR"
        )

        try:
            resp = session.get(url, timeout=30)
            if resp.status_code != 200:
                break
            data = resp.json()
        except Exception as e:
            log.warning(f"  '{keyword}' 페이지 {page} 요청 실패: {e}")
            break

        # 상품 목록 추출
        items = []
        try:
            search_result = data.get("data", {})
            if isinstance(search_result, dict):
                items = search_result.get("dataList", [])
                if not items:
                    items = search_result.get("itemList", [])
                if not items:
                    # 다른 구조 시도
                    for key in search_result:
                        val = search_result[key]
                        if isinstance(val, list) and len(val) > 0 and isinstance(val[0], dict):
                            if "itemNm" in val[0] or "itemNo" in val[0]:
                                items = val
                                break
        except Exception:
            pass

        if not items:
            break

        for item in items:
            try:
                item_no = str(item.get("itemNo", ""))
                if not item_no or item_no in seen_ids:
                    continue
                seen_ids.add(item_no)

                name = item.get("itemNm", "").strip()
                if not name:
                    continue

                sale_price = item.get("salePrice")
                dc_price = item.get("dcPrice")
                dc_rate = item.get("dcRate")
                rating = item.get("grade")
                review_count = item.get("reviewCnt")

                # 무게/용량
                weight = None
                unit_qty = item.get("totalUnitQty")
                unit_measure = item.get("unitMeasure", "")
                if unit_qty:
                    weight = f"{unit_qty}{unit_measure}"

                unit_price = None
                up = item.get("unitPrice")
                if up:
                    unit_price = f"{up}원/100{unit_measure}" if unit_measure else str(up)

                # 카테고리
                categories = {}
                for key in ("lcateNm", "mcateNm", "scateNm", "rcateNm"):
                    val = item.get(key)
                    if val:
                        categories[key] = val

                # 이미지 URL
                img_url = ""
                img_dt = item.get("imgChgDt", "")
                if img_dt:
                    img_url = f"https://image.homeplus.kr/td/d15081b8-b273-4eef-b3ae-d30e785cb71b/item/image/goods/{item_no}/goodsDetail/{item_no}_1.jpg"

                sold_out = item.get("soldOutYn", "N") == "Y"

                all_products.append({
                    "homeplus_id": item_no,
                    "name": name,
                    "base_price": int(sale_price) if sale_price else None,
                    "discounted_price": int(dc_price) if dc_price else (int(sale_price) if sale_price else None),
                    "discount_rate": int(dc_rate) if dc_rate else None,
                    "weight": weight,
                    "unit_price": unit_price,
                    "rating": float(rating) if rating else None,
                    "review_count": int(review_count) if review_count else None,
                    "categories": categories,
                    "main_image_url": img_url,
                    "url": f"{HOMEPLUS_BASE}/item/{item_no}",
                    "is_available": not sold_out,
                    "spicy_score": calc_spicy_score(name),
                })
            except Exception as e:
                log.warning(f"상품 파싱 실패: {e}")
                continue

        if len(items) < PER_PAGE:
            break

        time.sleep(random.uniform(*REQUEST_DELAY))

    return all_products


# ── Supabase 업로드 ───────────────────────────────────────────
def upsert_to_supabase(products: list, supabase_url: str, supabase_key: str):
    """Supabase homeplus_products 테이블에 upsert"""
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
                "homeplus_id": p["homeplus_id"],
                "name": p["name"],
                "base_price": p.get("base_price"),
                "discounted_price": p.get("discounted_price"),
                "discount_rate": p.get("discount_rate"),
                "weight": p.get("weight"),
                "unit_price": p.get("unit_price"),
                "rating": p.get("rating"),
                "review_count": p.get("review_count"),
                "categories": p.get("categories"),
                "main_image_url": p.get("main_image_url"),
                "url": p.get("url"),
                "is_available": p.get("is_available", True),
                "last_crawled_at": datetime.now(timezone.utc).isoformat(),
                "spicy_score": p.get("spicy_score", 0),
                "match_status": "pending",
            })

        for attempt in range(3):
            try:
                resp = session.post(
                    f"{supabase_url}/rest/v1/homeplus_products",
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
    parser = argparse.ArgumentParser(description="홈플러스 크롤러")
    parser.add_argument("--test", action="store_true", help="테스트 모드 (5개 키워드만)")
    args = parser.parse_args()

    supabase_url = os.environ.get("SUPABASE_URL", "")
    supabase_key = os.environ.get("SUPABASE_KEY", "")
    if not supabase_url or not supabase_key:
        log.error("SUPABASE_URL, SUPABASE_KEY 환경변수 필요")
        sys.exit(1)

    keywords = FOOD_KEYWORDS[:5] if args.test else FOOD_KEYWORDS

    log.info(f"=== 홈플러스 크롤링 시작 ({len(keywords)}개 키워드) ===")

    session = create_session()
    all_products = []
    seen_ids = set()

    for i, keyword in enumerate(keywords, 1):
        products = search_products(session, keyword)
        # 중복 제거
        new_products = []
        for p in products:
            if p["homeplus_id"] not in seen_ids:
                seen_ids.add(p["homeplus_id"])
                new_products.append(p)
        all_products.extend(new_products)
        log.info(f"[{i}/{len(keywords)}] '{keyword}': {len(products)}개 → 신규 {len(new_products)}개 (누적 {len(all_products)})")
        time.sleep(random.uniform(*REQUEST_DELAY))

    log.info(f"총 수집: {len(all_products)}개 상품 (중복 제거 후)")

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

    log.info("=== 홈플러스 크롤링 완료 ===")


if __name__ == "__main__":
    main()
