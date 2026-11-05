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
    if ov < 0.6: return False, f"이름 겹침 {ov:.2f}"
    tg_total = total_grams(tg.get("mall_name")) or total_grams(tg.get("volume"))
    cp_total = total_grams(name)
    if tg_total and cp_total:
        if abs(tg_total - cp_total) / max(tg_total, cp_total) > 0.12: return False, f"총중량 {tg_total:g}↔{cp_total:g}"
    elif has_count(name) != has_count(tg.get("mall_name") + " " + (tg.get("volume") or "")):
        return False, "묶음 수 다름"
    return True, f"이름 겹침 {ov:.2f}"

