"""매칭 v2 로직 단위 테스트"""
from match_mall_mfds import (
    extract_brand, extract_weight, clean_name,
    normalize_manufacturer, manufacturer_match_score,
    weight_penalty,
)

# ── extract_brand ──
assert extract_brand("[오리온] 꼬북칩 캬라멜팝콘") == "오리온"
assert extract_brand("[KF365] 1등급 닭 다리") == "KF365"
assert extract_brand("이탈리안 파슬리 30g") == ""
print("✓ extract_brand OK")

# ── extract_weight ──
assert extract_weight("미니 크로아상 30g") == (30.0, "g")
assert extract_weight("우유 1L") == (1000.0, "ml")
assert extract_weight("콩국물 500ml") == (500.0, "ml")
assert extract_weight("고기 1.5kg") == (1500.0, "g")
assert extract_weight("꼬북칩") == (None, None)
print("✓ extract_weight OK")

# ── clean_name ──
r = clean_name("[오리온] 꼬북칩 캬라멜팝콘 미니 박스 30g x 12개입")
assert "꼬북칩" in r and "미니" in r and "x" not in r.lower(), f"got: {r}"
r2 = clean_name("[햇반] 발아현미밥 작은공기 130G * 36입")
assert "발아현미밥" in r2, f"got: {r2}"
assert clean_name("이탈리안 파슬리 30g") == "이탈리안 파슬리"
print("✓ clean_name OK")

# ── manufacturer matching ──
assert manufacturer_match_score("오리온", "오리온㈜") > 0.8
assert manufacturer_match_score("매일", "매일유업㈜ 청양공장") > 0.5
assert manufacturer_match_score("풀무원", "풀무원식품㈜") > 0.5
assert manufacturer_match_score("오리온", "BRIDOR") < 0.3
print("✓ manufacturer_match_score OK")

# ── weight_penalty ──
assert weight_penalty((30, "g"), (30, "g")) == 0.0   # 같으면 감점 없음
assert weight_penalty((30, "g"), (500, "g")) == -0.15  # 큰 차이
assert weight_penalty((30, "g"), (50, "g")) == -0.1    # 적당한 차이
assert weight_penalty((None, None), (30, "g")) == 0.0  # 비교 불가
print("✓ weight_penalty OK")

# ── 오매칭 케이스 검증 ──
# "꼬북칩 캬라멜팝콘 미니 박스 30g" vs "(EDT) 미니 크로아상 30g"
c1 = clean_name("[오리온] 꼬북칩 캬라멜팝콘 미니 박스 30g x 12개입")
c2 = clean_name("(EDT) 미니 크로아상 30g")
from difflib import SequenceMatcher
sim = SequenceMatcher(None, c1.lower(), c2.lower()).ratio()
print(f"\n오매칭 테스트: '{c1}' vs '{c2}'")
print(f"  이름 유사도: {sim:.3f}")
# 제조사 비교: 오리온 vs BRIDOR
mfr_sim = manufacturer_match_score("오리온", "BRIDOR")
print(f"  제조사 유사도: {mfr_sim:.3f}")
# 중량: 30g vs 30g → 같음
wp = weight_penalty(extract_weight("30g x 12개입"), extract_weight("미니 크로아상 30g"))
print(f"  중량 감점: {wp}")

t1 = set(c1.lower().split())
t2 = set(c2.lower().split())
overlap = len(t1 & t2) / max(len(t1), len(t2))
combined = sim * 0.5 + overlap * 0.3 + 0.0 + wp
print(f"  토큰 오버랩: {overlap:.3f}")
print(f"  종합 점수: {combined:.3f} (임계값 0.7)")
print(f"  → {'매칭됨 ✗' if combined >= 0.7 else '매칭 거부 ✓'}")

# ── 오매칭 케이스 2: 같은 브랜드, 다른 제품 ──
print("\n오매칭 테스트 2: 같은 브랜드 다른 제품")
c3 = clean_name("1++ 한우 육회 200g (육회소스증정)")
c4 = clean_name("1++ 한우 도가니수육")
sim2 = SequenceMatcher(None, c3.lower(), c4.lower()).ratio()
print(f"  '{c3}' vs '{c4}'")
print(f"  이름 유사도: {sim2:.3f}")

t3 = set(c3.lower().split())
t4 = set(c4.lower().split())
overlap2 = len(t3 & t4) / max(len(t3), len(t4))
print(f"  토큰 오버랩: {overlap2:.3f} (겹침: {t3 & t4}, 쇼핑몰만: {t3 - t4}, MFDS만: {t4 - t3})")

# 제조사 보너스: name_sim < 0.55면 0
mfr_bonus2 = 0.10 if sim2 >= 0.55 else 0.0
print(f"  제조사 보너스: {mfr_bonus2} (name_sim >= 0.55? {sim2 >= 0.55})")

# 고유 토큰 감점
sig_q = {t for t in (t3 - t4) if len(t) >= 2}
sig_m = {t for t in (t4 - t3) if len(t) >= 2}
dp = -0.08 * min(len(sig_q), len(sig_m)) if sig_q and sig_m else 0
dp = max(dp, -0.15)
print(f"  고유토큰 감점: {dp} (쇼핑몰: {sig_q}, MFDS: {sig_m})")

combined2 = sim2 * 0.55 + overlap2 * 0.30 + mfr_bonus2 + dp
print(f"  종합 점수: {combined2:.3f} (임계값 0.7)")
print(f"  → {'매칭됨 ✗' if combined2 >= 0.7 else '매칭 거부 ✓'}")
assert combined2 < 0.7, f"오매칭이 통과됨! score={combined2:.3f}"

print("\n모든 테스트 통과!")
