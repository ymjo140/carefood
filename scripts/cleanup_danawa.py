#!/usr/bin/env python3
"""
기존 검증 없이 매핑된 danawa 가격 데이터를 정리하는 일회성 스크립트.

실행 방법:
  python scripts/cleanup_danawa.py

동작:
  1. product_prices 테이블의 danawa 레코드 533건을 is_available=false로 비활성화
  2. 이후 개선된 crawl_prices.py가 재크롤링 시 유사도 검증을 거쳐 재매핑
"""

import os
from supabase import create_client

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://vdiaqoaoeatrnmvrvxvy.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

if not SUPABASE_KEY:
    print("❌ SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.")
    exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# 현황 확인
result = supabase.table("product_prices").select("id", count="exact").eq("platform", "danawa").execute()
total = result.count or 0
print(f"📊 danawa 레코드: {total}건")

if total == 0:
    print("✅ 정리할 데이터 없음")
    exit(0)

# 비활성화
result = (
    supabase.table("product_prices")
    .update({"is_available": False})
    .eq("platform", "danawa")
    .execute()
)
updated = len(result.data) if result.data else 0
print(f"✅ {updated}건 비활성화 완료 (is_available=false)")
print("ℹ️  crawl_prices.py 재실행 시 유사도 검증 후 정상 데이터만 재매핑됩니다.")
