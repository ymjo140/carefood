"""쿠팡 검색 결과가 우리 제품과 같은지 — 브랜드·이름·총중량 (coupang_prices · coupang_sync 공용)"""
import re

def norm(s):
    return re.sub(r"[^0-9a-z가-힣]", "", (s or "").lower())

def bigrams(s):
    return {s[i:i+2] for i in range(len(s) - 1)}

UNIT = r"(kg|g|ml|l)"
def total_grams(text):
    t = (text or "").lower().replace(",", "").replace("×", "x").replace("*", "x")
    m = re.search(r"(\d+(?:\.\d+)?)\s*" + UNIT + r"\s*x\s*(\d+)", t)
    if m:
        v = float(m.group(1)) * (1000 if m.group(2) in ("kg", "l") else 1); return v * int(m.group(3))
    m = re.search(r"(\d+(?:\.\d+)?)\s*" + UNIT + r"[^0-9]{0,8}?(\d+)\s*(개입|개|입|팩|봉|병|캔|구)", t)
    if m:
        v = float(m.group(1)) * (1000 if m.group(2) in ("kg", "l") else 1); return v * int(m.group(3))
    m = re.search(r"(\d+(?:\.\d+)?)\s*" + UNIT + r"\b", t)
    if m: return float(m.group(1)) * (1000 if m.group(2) in ("kg", "l") else 1)
    return None

def pack_count(text):
    """묶음 수 (2개입·x 12·6팩 …) — 없으면 None"""
    t = (text or "").lower().replace("×", "x").replace("*", "x")
    m = re.search(r"x\s*(\d+)|(\d+)\s*(?:개입|개|입|팩|봉|병|캔|세트|박스)", t)
    return int(m.group(1) or m.group(2)) if m else None

def has_count(text):
    t = (text or "").lower()
    return bool(re.search(r"x\s*\d+|\d+\s*(개입|개|입|팩|봉|병|캔|세트|박스)", t))

def accept(tg, it):
    name = it.get("productName") or ""
    nn = norm(name)
    brand = norm(tg.get("brand"))
    if brand and len(brand) >= 2 and brand not in nn: return False, "브랜드 없음"
    core = norm(re.sub(r"\[[^\]]*\]", "", tg.get("name") or ""))
    if brand and core.startswith(brand): core = core[len(brand):]
    B = bigrams(core)
    ov = len(B & bigrams(nn)) / max(1, len(B))
    if ov < 0.7: return False, f"이름 겹침 {ov:.2f}"
    # 쿠팡 이름에만 있는 수식어(쁘띠·미니·대용량 …)가 붙으면 다른 상품일 때가 많다
    for w in ("쁘띠", "미니", "대용량", "업소용", "리필", "기획", "선물세트"):
        if w in name and w not in (tg.get("mall_name") or "") + (tg.get("name") or ""): return False, f"'{w}' 다른 상품"
    tc, cc = pack_count((tg.get("mall_name") or "") + " " + (tg.get("volume") or "")), pack_count(name)
    if tc and cc and tc != cc: return False, f"묶음 수 {tc}↔{cc}"
    tg_total = total_grams(tg.get("mall_name")) or total_grams(tg.get("volume"))
    cp_total = total_grams(name)
    if tg_total and cp_total:
        if abs(tg_total - cp_total) / max(tg_total, cp_total) > 0.12: return False, f"총중량 {tg_total:g}↔{cp_total:g}"
    elif has_count(name) != has_count(tg.get("mall_name") + " " + (tg.get("volume") or "")):
        return False, "묶음 수 다름"
    return True, f"이름 겹침 {ov:.2f}"

