"""
11번가(11st.co.kr) 식품 크롤러
================================================================
11번가 공식 OpenAPI(상품검색)로 식품 상품 수집 → Supabase st11_products 적재

수집 흐름:
  1) 식품 관련 키워드로 검색 API 호출
  2) 페이지네이션 (최대 18페이지/키워드)
  3) 상품 정보 추출 + 중복 제거
  4) Supabase st11_products 테이블에 upsert
  5) 매운맛 점수 산출

사용법:
  python crawl_11st.py                  # 전체 크롤링
  python crawl_11st.py --test           # 테스트 (키워드 3개, 페이지 2개)

환경변수:
  SUPABASE_URL  - Supabase 프로젝트 URL
  SUPABASE_KEY  - Supabase service_role 키
  ST11_API_KEY  - 11번가 OpenAPI 키
"""

import os
import re
import sys
import time
import logging
import argparse
from datetime import datetime, timezone

import requests
import xml.etree.ElementTree as ET
from urllib.parse import quote

# ── 로깅 ──────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("crawl_11st.log", encoding="utf-8"),
    ],
)
# stdout 버퍼링 해제
sys.stdout.reconfigure(line_buffering=True)
log = logging.getLogger(__name__)

# ── 설정 ──────────────────────────────────────────────────────
# 11번가 공식 OpenAPI (상품검색). 키는 OpenAPI 가입 때 받는 32자리 — 환경변수 ST11_API_KEY
# 예전에는 11번가 검색 화면의 내부 API 를 불렀는데 2026-11-03 부터 막혀 공식 API 로 바꿨다.
API_URL = "http://openapi.11st.co.kr/openapi/OpenApiService.tmall"
ST11_API_KEY = os.environ.get("ST11_API_KEY", "")
PAGE_SIZE = 200  # 최대
MAX_PAGES = 5
REQUEST_DELAY = 1.0  # 서버 부하 방지

# 식품 검색 키워드 (다양한 식품 카테고리를 커버)
SEARCH_KEYWORDS = [
    # 주식류
    "즉석밥", "볶음밥", "비빔밥", "덮밥", "컵밥", "잡곡밥",
    "라면", "컵라면", "우동", "파스타", "국수", "냉면", "쫄면", "당면",
    # 반찬·국
    "반찬", "김치", "깍두기", "젓갈", "장아찌",
    "국", "찌개", "탕", "스프", "죽",
    # 간편식
    "만두", "냉동식품", "즉석식품", "도시락", "햄버거", "피자",
    "핫도그", "떡볶이", "순대", "어묵", "튀김",
    # 육류·수산
    "소고기", "돼지고기", "닭고기", "오리고기",
    "소시지", "햄", "베이컨", "육포",
    "생선", "새우", "참치", "연어", "멸치", "오징어", "조개",
    # 유제품·계란
    "우유", "요거트", "요구르트", "치즈", "버터", "크림",
    "계란", "달걀",
    # 빵·과자·간식
    "빵", "식빵", "케이크", "쿠키",
    "과자", "스낵", "초콜릿", "사탕", "젤리", "껌",
    "떡", "한과", "양갱",
    "견과류", "아몬드", "호두", "땅콩",
    # 음료
    "음료", "주스", "탄산음료", "이온음료",
    "커피", "녹차", "홍차", "보리차",
    "생수", "탄산수",
    # 가공식품
    "통조림", "캔", "참치캔",
    "두부", "어묵", "맛살",
    "소스", "케첩", "마요네즈", "드레싱",
    "간장", "고추장", "된장", "쌈장",
    "식용유", "올리브유", "참기름",
    "설탕", "소금", "후추", "조미료",
    # 건강식품
    "시리얼", "그래놀라", "오트밀",
    "프로틴", "단백질바", "에너지바",
    "건강식품", "영양제", "비타민",
    # 이유식·아기
    "이유식", "분유",
    # 특수식
    "다이어트식품", "저칼로리", "당뇨식",
    "환자식", "선식", "미숫가루",
]

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


def calc_spicy(name: str) -> int:
    for level in (5, 4, 3, 2, 1):
        if SPICY_KEYWORDS[level].search(name):
            return level
    return 0


# ── Supabase ─────────────────────────────────────────────────
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")
SB_HEADERS = {
    "apikey": SUPABASE_KEY,
    **({"Authorization": f"Bearer {SUPABASE_KEY}"} if SUPABASE_KEY.startswith("eyJ") else {}),
    "Content-Type": "application/json",
    "Prefer": "return=minimal,resolution=merge-duplicates",
}

SESSION = requests.Session()
SESSION.headers.update(SB_HEADERS)


def upsert_batch(products: list[dict]) -> int:
    """Supabase st11_products 테이블에 배치 upsert"""
    if not products:
        return 0

    url = f"{SUPABASE_URL}/rest/v1/st11_products?on_conflict=st11_id"
    rows = []
    for p in products:
        rows.append({
            "st11_id": p["st11_id"],
            "name": p["name"],
            "price": p["price"],
            "original_price": p.get("original_price"),
            "image_url": p.get("image_url"),
            "product_url": p.get("product_url"),
            "search_keyword": p.get("search_keyword"),
            "spicy_score": calc_spicy(p["name"]),
            "is_active": True,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })

    for attempt in range(3):
        try:
            resp = SESSION.post(url, json=rows, timeout=30)
            if resp.status_code in (200, 201):
                return len(rows)
            log.warning(f"Upsert 실패 ({resp.status_code}): {resp.text[:200]}")
            if resp.status_code >= 500:
                time.sleep(2 * (attempt + 1))
                continue
            break
        except Exception as e:
            log.warning(f"Upsert 예외: {e}")
            time.sleep(2 * (attempt + 1))
    return 0


# ── 11번가 API ───────────────────────────────────────────────
class QuotaExceeded(Exception):
    pass


def _api_get(keyword: str, page: int, enc: str):
    q = (f"key={ST11_API_KEY}&apiCode=ProductSearch&keyword={quote(keyword.encode(enc))}"
         f"&pageNum={page}&pageSize={PAGE_SIZE}&sortCd=CP")
    resp = requests.get(f"{API_URL}?{q}", headers={"User-Agent": "carefood-openapi/1.0"}, timeout=20)
    resp.raise_for_status()
    return parse_xml(resp.content)


def parse_xml(raw: bytes):
    """응답은 EUC-KR XML — 파이썬 XML 파서가 EUC-KR 을 못 읽어 먼저 글자로 바꾸고 선언을 뗀다"""
    m = re.search(rb'encoding="([^"]+)"', raw[:100])
    enc = (m.group(1).decode() if m else "utf-8").lower()
    text = raw.decode("cp949" if enc in ("euc-kr", "euckr", "ks_c_5601-1987") else enc, errors="replace")
    return ET.fromstring(re.sub(r"^\s*<\?xml[^>]*\?>", "", text))


def search_products(keyword: str, page: int = 1) -> tuple[list[dict], int]:
    """11번가 OpenAPI 상품검색(ProductSearch) → (상품 리스트, 마지막 페이지)"""
    for attempt in range(3):
        try:
            root = None
            for enc in ("utf-8", "euc-kr"):  # 문서에 키워드 인코딩이 없어 둘 다 본다
                root = _api_get(keyword, page, enc)
                if root.find(".//Product") is not None or root.find(".//ErrorCode") is not None:
                    break
            err = root.findtext(".//ErrorCode") or root.findtext(".//Code")
            if err:
                msg = root.findtext(".//ErrorMessage") or root.findtext(".//Message") or ""
                if err.startswith("004"):
                    raise QuotaExceeded(msg)
                log.warning(f"  OpenAPI 오류 {err}: {msg}")
                if err[:3] in ("097", "098", "099"):
                    time.sleep(2 * (attempt + 1))
                    continue
                return [], 0
            products = []
            for it in root.iter("Product"):
                code = (it.findtext("ProductCode") or "").strip()
                name = (it.findtext("ProductName") or "").strip()
                if not code or not name:
                    continue
                list_price = _parse_price(it.findtext("ProductPrice"))
                sale = _parse_price(it.findtext("SalePrice"))
                prices = [x for x in (sale, list_price) if x and x > 0]
                products.append({
                    "st11_id": code,
                    "name": name,
                    "price": min(prices) if prices else None,
                    "original_price": list_price,
                    "image_url": it.findtext("ProductImage") or it.findtext("ImageUrl"),
                    "product_url": f"https://www.11st.co.kr/products/{code}",
                    "search_keyword": keyword,
                })
            total = _parse_price(root.findtext(".//TotalCount")) or 0
            last = -(-total // PAGE_SIZE) if total else (page + 1 if len(products) >= PAGE_SIZE else page)
            return products, min(last, MAX_PAGES)
        except QuotaExceeded:
            raise
        except Exception as e:
            log.warning(f"  OpenAPI 요청 실패: {e}")
            time.sleep(2 * (attempt + 1))
    return [], 0


def _parse_price(val) -> int | None:
    """가격 문자열 파싱"""
    if val is None:
        return None
    if isinstance(val, int):
        return val
    try:
        return int(str(val).replace(",", ""))
    except (ValueError, TypeError):
        return None


def crawl_keyword(keyword: str, max_pages: int = MAX_PAGES) -> dict:
    """하나의 키워드에 대해 전체 페이지 크롤링"""
    all_products = {}  # st11_id → product (중복 제거)
    total_upserted = 0

    for page in range(1, max_pages + 1):
        products, actual_max = search_products(keyword, page)

        if not products:
            break

        # 중복 제거
        new_products = []
        for p in products:
            if p["st11_id"] not in all_products:
                all_products[p["st11_id"]] = p
                new_products.append(p)

        if new_products:
            upserted = upsert_batch(new_products)
            total_upserted += upserted

        if page >= actual_max:
            break

        time.sleep(REQUEST_DELAY)

    return {
        "keyword": keyword,
        "collected": len(all_products),
        "upserted": total_upserted,
    }


def main():
    parser = argparse.ArgumentParser(description="11번가 식품 크롤러")
    parser.add_argument("--test", action="store_true", help="테스트 모드 (키워드 3개, 페이지 2개)")
    parser.add_argument("--start-index", type=int, default=0, help="시작 키워드 인덱스 (0부터)")
    args = parser.parse_args()

    if not SUPABASE_URL or not SUPABASE_KEY or not ST11_API_KEY:
        log.error("SUPABASE_URL, SUPABASE_KEY, ST11_API_KEY 환경변수 필요")
        sys.exit(1)

    keywords = SEARCH_KEYWORDS
    max_pages = MAX_PAGES

    if args.test:
        keywords = keywords[:3]
        max_pages = 2
        log.info("=== 테스트 모드 ===")

    if args.start_index > 0:
        keywords = keywords[args.start_index:]
        log.info(f"=== 인덱스 {args.start_index}부터 이어서 크롤링 ===")

    log.info(f"=== 11번가 크롤링 시작: {len(keywords)}개 키워드 ===")

    # 이미 수집된 상품 ID 조회 (전역 중복 방지)
    seen_ids: set[str] = set()

    total_collected = 0
    total_upserted = 0

    for i, keyword in enumerate(keywords, 1):
        log.info(f"[{i}/{len(keywords)}] 키워드: '{keyword}' 크롤링 중...")
        try:
            result = crawl_keyword(keyword, max_pages)
        except QuotaExceeded as e:
            log.warning(f"하루 호출 한도를 넘었어요 — 여기서 멈추고 다음 날 --start-index {args.start_index + i - 1} 부터: {e}")
            break
        total_collected += result["collected"]
        total_upserted += result["upserted"]
        log.info(f"  → {result['collected']}개 수집, {result['upserted']}개 저장")

        # 키워드 간 딜레이
        if i < len(keywords):
            time.sleep(REQUEST_DELAY)

    log.info(f"=== 크롤링 완료 ===")
    log.info(f"총 수집: {total_collected}개 | 총 저장: {total_upserted}개")

    # 비활성화: 오래된 상품 처리
    # (최초 크롤링이므로 생략, 추후 추가 가능)


if __name__ == "__main__":
    main()
