"""
가격 크롤러 → product_prices 테이블 적재
================================================================
채널 전략:
  1) 네이버 쇼핑 검색 API (1차): 공식 REST API로 최저가 수집
     - /v1/search/shop.json — JSON 응답, 봇 차단 없음
     - 일 25,000회 호출, 안정적
  2) 다나와 가격비교 (2차 fallback): 네이버 실패 시 웹 스크래핑
     - search.danawa.com — HTML 파싱
     - Render IP 봇 차단 이슈 있음
  3) 쿠팡 파트너스 API (3차): 어필리에이트 링크 생성 (수수료 수익)
  4) 마켓컬리 (4차): 검색 URL 기반 아웃링크 생성

추가 기능:
  --trends 모드: 네이버 쇼핑인사이트 API로 키워드 트렌드 수집
     - /v1/datalab/shopping/category/keywords — 검색 클릭 추이 (상대 비율)
     - 케어푸드 관련 키워드 인기도 분석용

사용법:
  pip install requests beautifulsoup4 supabase python-dotenv
  cp .env.example .env   # 키 채우기
  python crawl_prices.py              # 가격 크롤링
  python crawl_prices.py --trends     # 트렌드 분석
  python crawl_prices.py --test '저염 도시락'  # 단일 테스트

환경변수:
  NAVER_CLIENT_ID      - 네이버 개발자 Client ID (가격 수집 + 트렌드)
  NAVER_CLIENT_SECRET  - 네이버 개발자 Client Secret (가격 수집 + 트렌드)
  COUPANG_ACCESS_KEY   - 쿠팡 파트너스 ACCESS KEY (선택)
  COUPANG_SECRET_KEY   - 쿠팡 파트너스 SECRET KEY (선택)
  SUPABASE_URL         - Supabase 프로젝트 URL
  SUPABASE_KEY         - Supabase service_role 키
"""

import gc
import os
import re
import sys
import json
import hmac
import hashlib
import time
import random
import logging
import urllib.parse
from typing import Optional
from datetime import datetime, timezone
from time import gmtime, strftime

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from supabase import create_client, Client

# ─── 로깅 ──────────────────────────────────────────────
_log_handlers = [logging.StreamHandler()]
# Render 환경에서는 파일 로깅 비활성화 (stdout이 로그 수집기로 전달됨)
if not os.environ.get("RENDER"):
    _log_handlers.append(logging.FileHandler("crawl_prices.log", encoding="utf-8"))
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=_log_handlers,
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

UPSERT_CHUNK = 50


# ═══════════════════════════════════════════════════════
#  1. 다나와 가격비교 스크래핑
# ═══════════════════════════════════════════════════════
#  - search.danawa.com HTML 파싱으로 최저가 수집
#  - API 키 불필요
#  - 상품명, 최저가, 다나와 링크, 이미지 수집
#  - 속도 제한: 0.5초 간격 (서버 부담 최소화)

DANAWA_SEARCH_URL = "https://search.danawa.com/dsearch.php"
NAVER_SHOP_SEARCH_URL = "https://openapi.naver.com/v1/search/shop.json"
NAVER_INSIGHT_URL = "https://openapi.naver.com/v1/datalab/shopping/category/keywords"
NAVER_INSIGHT_CATEGORY_URL = "https://openapi.naver.com/v1/datalab/shopping/categories"

# 다나와 스크래핑 가용 여부 (첫 호출 시 자동 판단)
_danawa_available: Optional[bool] = None
# 연속 실패 카운터 (일시적 차단 감지)
_danawa_fail_streak: int = 0
_DANAWA_MAX_FAILS: int = 5

# 재사용 세션 (TCP 연결 풀링 → 메모리 절약 + 속도 향상)
_http_session: Optional[requests.Session] = None


def _get_http_session() -> requests.Session:
    """HTTP 세션 싱글턴. 커넥션 풀 재사용으로 메모리·속도 개선."""
    global _http_session
    if _http_session is None:
        _http_session = requests.Session()
        _http_session.headers.update({
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8",
        })
    return _http_session


def _get_memory_mb() -> float:
    """현재 프로세스 RSS 메모리 (MB). Linux /proc/self/status 기반."""
    try:
        with open("/proc/self/status") as f:
            for line in f:
                if line.startswith("VmRSS:"):
                    return int(line.split()[1]) / 1024  # kB → MB
    except Exception:
        pass
    return 0.0


# 메모리 안전 한도 (MB) — Render 512MB 제한의 85%
MEMORY_LIMIT_MB = int(os.environ.get("MEMORY_LIMIT_MB", "420"))


def strip_html(text: str) -> str:
    """HTML <b> 태그 제거."""
    return re.sub(r"</?b>", "", text or "")


def danawa_search(query: str, display: int = 10) -> list[dict]:
    """
    다나와 가격비교 웹 스크래핑.
    HTML에서 상품명/최저가/링크/이미지를 파싱.

    Returns:
        [{title, link, image, lprice, mallName, productId}, ...]
    """
    global _danawa_available, _danawa_fail_streak

    # 이전 호출에서 사용 불가 확인됨 → 즉시 스킵
    if _danawa_available is False:
        return []

    params = {
        "query": query,
        "tab": "goods",
        "limit": str(min(display, 40)),
    }

    session = _get_http_session()

    try:
        resp = session.get(
            DANAWA_SEARCH_URL, params=params, timeout=15
        )

        # 418/403 → 봇 감지 차단
        if resp.status_code in (403, 418, 429):
            _danawa_fail_streak += 1
            if _danawa_fail_streak >= _DANAWA_MAX_FAILS:
                _danawa_available = False
                log.warning(
                    f"다나와 스크래핑 차단됨 (HTTP {resp.status_code}, "
                    f"{_danawa_fail_streak}회 연속 실패). 스크래핑 중단."
                )
            else:
                log.warning(
                    f"다나와 HTTP {resp.status_code} [{query}] "
                    f"({_danawa_fail_streak}/{_DANAWA_MAX_FAILS})"
                )
            return []

        if resp.status_code != 200:
            log.warning(f"다나와 HTTP {resp.status_code} [{query}]")
            return []

        # 첫 성공 → 사용 가능 확인
        if _danawa_available is None:
            _danawa_available = True
            log.info("다나와 가격비교 스크래핑 사용 가능 확인!")

        _danawa_fail_streak = 0  # 성공 시 리셋

        html = resp.text
        resp.close()
        del resp

        soup = BeautifulSoup(html, "html.parser")
        del html
        results = []

        prod_items = soup.select("li.prod_item")

        for item in prod_items:
            # 상품 ID
            item_id = ""
            id_attr = item.get("id", "")
            if id_attr.startswith("productItem"):
                item_id = id_attr.replace("productItem", "")

            # 상품명
            name_el = item.select_one(".prod_name a")
            if not name_el:
                continue
            title = strip_html(name_el.get_text(strip=True))

            # 가격 추출 (3단계 fallback)
            price = 0

            # 1) hidden input — 가격비교 상품 (전자제품 등)
            min_price_el = item.select_one("input[id^='min_price_']")
            if min_price_el:
                try:
                    price = int(min_price_el.get("value", "0"))
                except ValueError:
                    pass

            # 2) .price_sect 텍스트 — 쇼핑몰 상품 (식품 등)
            #    <p class="price_sect"><strong>16,630</strong>원</p>
            if price <= 0:
                price_el = item.select_one(".price_sect")
                if price_el:
                    price_text = re.sub(r"[^\d]", "", price_el.get_text())
                    if price_text:
                        price = int(price_text)

            # 3) .price_wrap 등 기타 가격 영역
            if price <= 0:
                for sel in (".price_wrap", ".price_info"):
                    price_el = item.select_one(sel)
                    if price_el:
                        price_text = re.sub(r"[^\d]", "", price_el.get_text())
                        if price_text:
                            price = int(price_text)
                            break

            if price <= 0:
                continue

            # 링크
            link = name_el.get("href", "")

            # 이미지
            img_el = item.select_one(".thumb_image img")
            image = ""
            if img_el:
                image = img_el.get("data-original", img_el.get("src", ""))

            results.append({
                "productId": item_id,
                "title": title,
                "lprice": price,
                "link": link,
                "image": image,
                "mallName": "danawa",
            })

        soup.decompose()
        del soup
        return results

    except requests.RequestException as e:
        _danawa_fail_streak += 1
        log.error(f"다나와 검색 실패 [{query}]: {e}")
        return []


# ═══════════════════════════════════════════════════════
#  1-A. 네이버 쇼핑 검색 API (가격 수집 — 1차 채널)
# ═══════════════════════════════════════════════════════
#  - 공식 REST API, JSON 응답 → 봇 차단 없음
#  - 일 25,000회 호출 가능 (넉넉)
#  - lprice(최저가), hprice(최고가), mallName, link, image 제공
#  - NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 필요

# 네이버 쇼핑 API 사용 가능 여부 (첫 호출 시 자동 판단)
_naver_shop_available: Optional[bool] = None


def naver_shop_search(query: str, display: int = 5) -> list[dict]:
    """
    네이버 쇼핑 검색 API.
    공식 API로 JSON 응답 — 봇 차단 없이 안정적으로 가격 수집.

    Args:
        query: 검색어
        display: 결과 수 (1~100, 기본 5)

    Returns:
        [{title, link, image, lprice, mallName, productId}, ...]
        danawa_search()와 동일한 포맷으로 반환하여 호환성 유지.
    """
    global _naver_shop_available

    if not NAVER_CLIENT_ID or not NAVER_CLIENT_SECRET:
        if _naver_shop_available is not False:
            log.warning("NAVER_CLIENT_ID/SECRET 미설정 — 네이버 쇼핑 API 스킵")
            _naver_shop_available = False
        return []

    if _naver_shop_available is False:
        return []

    headers = {
        "X-Naver-Client-Id": NAVER_CLIENT_ID,
        "X-Naver-Client-Secret": NAVER_CLIENT_SECRET,
    }
    params = {
        "query": query,
        "display": min(display, 100),
        "sort": "sim",  # 정확도순
    }

    try:
        resp = requests.get(
            NAVER_SHOP_SEARCH_URL,
            headers=headers,
            params=params,
            timeout=10,
        )

        if resp.status_code == 429:
            log.warning("네이버 쇼핑 API 일일 한도 초과 (429)")
            _naver_shop_available = False
            return []

        if resp.status_code != 200:
            log.warning(f"네이버 쇼핑 API HTTP {resp.status_code} [{query}]")
            return []

        # 첫 성공 시 로깅
        if _naver_shop_available is None:
            _naver_shop_available = True
            log.info("네이버 쇼핑 검색 API 사용 가능 확인!")

        data = resp.json()
        items = data.get("items", [])

        results = []
        for item in items:
            lprice = 0
            try:
                lprice = int(item.get("lprice", "0"))
            except (ValueError, TypeError):
                pass

            if lprice <= 0:
                continue

            results.append({
                "productId": item.get("productId", ""),
                "title": strip_html(item.get("title", "")),
                "lprice": lprice,
                "link": item.get("link", ""),
                "image": item.get("image", ""),
                "mallName": item.get("mallName", "naver"),
            })

        return results

    except requests.RequestException as e:
        log.error(f"네이버 쇼핑 API 실패 [{query}]: {e}")
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


def danawa_to_price_record(
    product_id: str,
    item: dict,
) -> Optional[dict]:
    """
    다나와 검색 결과 1건 → product_prices 레코드 변환.
    다나와는 여러 쇼핑몰의 최저가를 이미 비교해서 보여주므로,
    결과 1건 = 최저가 1건.
    """
    price = int(item.get("lprice") or 0)
    if price <= 0:
        return None

    return {
        "product_id": product_id,
        "platform": "danawa",
        "price": price,
        "price_per_serving": None,
        "url": item.get("link", ""),
        "image_url": item.get("image", None) or None,
        "is_available": True,
        "last_crawled_at": datetime.now(timezone.utc).isoformat(),
    }


def naver_to_price_record(
    product_id: str,
    item: dict,
) -> Optional[dict]:
    """
    네이버 쇼핑 검색 결과 1건 → product_prices 레코드 변환.
    mallName 필드에 실제 판매 쇼핑몰 이름이 들어감.
    """
    price = int(item.get("lprice") or 0)
    if price <= 0:
        return None

    return {
        "product_id": product_id,
        "platform": "naver",
        "price": price,
        "price_per_serving": None,
        "url": item.get("link", ""),
        "image_url": item.get("image", None) or None,
        "is_available": True,
        "last_crawled_at": datetime.now(timezone.utc).isoformat(),
    }


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
        "last_crawled_at": datetime.now(timezone.utc).isoformat(),
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
            count = len(batch)
            del batch, result  # 즉시 해제
            if count < 5000:
                break
            offset += 5000
        gc.collect()
        if crawled_ids:
            log.info(f"  이미 가격 수집된 제품: {len(crawled_ids):,}건 (스킵)")
        log.info(f"  시작 메모리: {_get_memory_mb():.0f}MB")

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

    # ─── 봇 차단 감지용 ───
    consecutive_empty = 0       # 연속으로 가격 0인 검색 횟수
    EMPTY_THRESHOLD = 30        # 이 횟수 넘으면 차단으로 판단
    backoff_count = 0           # 백오프 시도 횟수
    MAX_BACKOFF = 2             # 최대 백오프 시도

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

            # ─── 1차: 네이버 쇼핑 검색 API (공식 API, 안정적) ───
            got_price = False
            naver_items = naver_shop_search(query, display=5)
            searched += 1

            if naver_items:
                best = naver_items[0]
                record = naver_to_price_record(product_id, best)
                if record:
                    buffer.append(record)
                    prices_found += 1
                    got_price = True
                    platform_counts["naver"] = (
                        platform_counts.get("naver", 0) + 1
                    )
            del naver_items

            # ─── 2차 fallback: 다나와 (네이버 실패 시만) ───
            if not got_price:
                danawa_items = danawa_search(query, display=5)
                if danawa_items:
                    best = danawa_items[0]
                    record = danawa_to_price_record(product_id, best)
                    if record:
                        buffer.append(record)
                        prices_found += 1
                        got_price = True
                        platform_counts["danawa"] = (
                            platform_counts.get("danawa", 0) + 1
                        )
                del danawa_items

            # ─── 봇 차단 감지: 연속 가격 0 → 백오프 (다나와 전용) ───
            # 네이버 API는 봇 차단이 없으므로, 네이버 사용 가능하면 스킵
            if got_price:
                consecutive_empty = 0
            else:
                consecutive_empty += 1

            if consecutive_empty >= EMPTY_THRESHOLD:
                if backoff_count >= MAX_BACKOFF:
                    log.warning(
                        f"  연속 {consecutive_empty}건 가격 0 + "
                        f"백오프 {MAX_BACKOFF}회 소진 → 종료"
                    )
                    done = True
                    break
                backoff_count += 1
                wait_sec = 120 * backoff_count
                log.info(
                    f"  연속 {consecutive_empty}건 가격 0 — "
                    f"{wait_sec}초 대기 "
                    f"(백오프 #{backoff_count}/{MAX_BACKOFF})"
                )
                time.sleep(wait_sec)
                consecutive_empty = 0

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
                # 메모리 사용량 체크
                mem_mb = _get_memory_mb()
                log.info(
                    f"  진행: {processed:,}/{max_products:,}  "
                    f"검색: {searched:,}  가격: {prices_found:,}  "
                    f"DB: {upserted:,}  스킵: {skipped_crawled:,}  "
                    f"메모리: {mem_mb:.0f}MB"
                )

            # 200건마다 강제 GC (메모리 단편화 방지)
            if searched > 0 and searched % 200 == 0:
                gc.collect()

            # 메모리 안전 한도 초과 시 조기 종료
            if searched > 0 and searched % 50 == 0:
                mem_mb = _get_memory_mb()
                if mem_mb > MEMORY_LIMIT_MB:
                    log.warning(
                        f"  메모리 한도 초과 ({mem_mb:.0f}MB > {MEMORY_LIMIT_MB}MB) "
                        f"— 안전 종료. 다음 실행 시 이어서 처리됨."
                    )
                    done = True
                    break

            # API 속도 제한
            # 네이버 API: 초당 10건 가능하지만 여유 있게 0.3~0.6초
            # 다나와 fallback 사용 시: 봇 탐지 회피를 위해 길게
            if got_price and platform_counts.get("naver", 0) > platform_counts.get("danawa", 0):
                time.sleep(random.uniform(0.3, 0.6))
            else:
                time.sleep(random.uniform(1.5, 3.5))

        if len(products) < page_size:
            del products, result
            break
        del products, result
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
    """단일 검색 테스트."""
    log.info(f"=== 테스트 검색: '{keyword}' ===\n")

    # 네이버 쇼핑 API
    log.info("[네이버 쇼핑 검색 API]")
    items = naver_shop_search(keyword, display=10)
    if items:
        for item in items[:10]:
            log.info(
                f"  {item['title'][:40]:40s}  "
                f"{int(item.get('lprice', 0)):>8,}원  "
                f"{item.get('mallName', '?')}"
            )
    else:
        log.info("  검색 결과 없음")

    # 다나와 (fallback)
    log.info("\n[다나와 가격비교]")
    items = danawa_search(keyword, display=10)
    if items:
        for item in items[:10]:
            log.info(
                f"  {item['title'][:40]:40s}  "
                f"{int(item.get('lprice', 0)):>8,}원  "
                f"id={item.get('productId', '?')}"
            )
    else:
        log.info("  검색 결과 없음")

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

# 배치당 처리량 (subprocess 재시작으로 메모리 완전 해제)
BATCH_SIZE = int(os.environ.get("CRAWL_BATCH_SIZE", "500"))


def _run_single_batch(args) -> dict:
    """단일 배치 실행 (워커 프로세스 내). 결과 stats dict 반환."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        log.error("SUPABASE_URL/KEY가 설정되지 않았습니다.")
        sys.exit(1)

    channels = []
    if NAVER_CLIENT_ID:
        channels.append("네이버쇼핑API")
    channels.append("다나와(fallback)")
    if COUPANG_ACCESS_KEY and not args.no_coupang:
        channels.append("쿠팡")

    log.info(f"  활성 채널: {', '.join(channels)}")
    log.info(f"  배치 크기: {args.max}")
    log.info(f"  시작 메모리: {_get_memory_mb():.0f}MB")

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    stats = crawl_streaming(
        supabase,
        max_products=args.max,
        use_coupang=bool(COUPANG_ACCESS_KEY) and not args.no_coupang,
        skip_crawled=not args.no_skip,
    )

    log.info(
        f"  배치 결과: 검색 {stats['searched']:,} / "
        f"가격 {stats['prices_found']:,} / "
        f"DB {stats['upserted']:,} / "
        f"스킵 {stats['skipped_crawled']:,} / "
        f"메모리 {_get_memory_mb():.0f}MB"
    )
    return stats


def main():
    import argparse
    import subprocess

    parser = argparse.ArgumentParser(description="케어푸드 가격 크롤러 (배치 모드)")
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
    parser.add_argument(
        "--worker", action="store_true",
        help="(내부용) 배치 워커 모드로 실행"
    )
    args = parser.parse_args()

    # 환경변수 CRAWL_MAX가 있으면 --max 오버라이드 (오케스트레이터만)
    # 워커 모드에서는 오케스트레이터가 전달한 --max 값을 사용
    if not args.worker:
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

    # ─── 워커 모드: 단일 배치 실행 후 종료 ───
    if args.worker:
        stats = _run_single_batch(args)
        # 새로 검색한 건이 0이면 → 모든 미수집 제품 처리 완료
        if stats["searched"] == 0:
            sys.exit(2)  # 부모에게 "더 이상 없음" 시그널
        return

    # ─── 오케스트레이터 모드: 배치별 subprocess 반복 ───
    log.info("=" * 50)
    log.info("가격 크롤러 시작 (배치 모드)")
    log.info(f"  총 목표: {args.max if args.max > 0 else '전체'}")
    log.info(f"  배치 크기: {BATCH_SIZE}건 (프로세스 재시작)")
    log.info(f"  시작 시간: {datetime.now().isoformat()}")
    log.info("=" * 50)

    batch_num = 0
    remaining = args.max if args.max > 0 else 999_999

    while remaining > 0:
        batch_num += 1
        batch_size = min(BATCH_SIZE, remaining)

        log.info(f"\n── 배치 #{batch_num} (목표 {batch_size}건) ──")

        # 자기 자신을 --worker 모드로 subprocess 실행
        cmd = [
            sys.executable, os.path.abspath(__file__),
            "--max", str(batch_size),
            "--worker",
        ]
        if args.no_coupang:
            cmd.append("--no-coupang")
        if args.no_skip:
            cmd.append("--no-skip")

        result = subprocess.run(cmd, timeout=7200)

        if result.returncode == 2:
            log.info("  모든 미수집 제품 처리 완료!")
            break
        elif result.returncode != 0:
            log.warning(f"  배치 #{batch_num} 비정상 종료 (code={result.returncode})")
            log.info("  5초 후 다음 배치 시도 (skip_crawled로 이어서 처리)...")
            time.sleep(5)

        remaining -= batch_size

    log.info("\n" + "=" * 50)
    log.info("크롤링 전체 완료")
    log.info(f"  총 배치: {batch_num}회")
    log.info(f"  종료 시간: {datetime.now().isoformat()}")
    log.info("=" * 50)


if __name__ == "__main__":
    main()
