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

# 쿠팡 이름 앞쪽에서 브랜드 자리로 보지 않는 말
STOPWORDS = {"로켓프레시", "로켓배송", "로켓직구", "매일배송", "새벽배송", "무료배송", "당일발송", "특가", "정품", "공식", "단독", "본사",
             "냉동", "냉장", "실온", "국내산", "국산", "수입산", "유기농", "무농약", "프리미엄", "신선", "손질된", "대용량", "1+1", "11", "new", "신제품"}
DESCRIPTIVE = re.compile(r"^(\d.*|[가-힣]{1,3}산)$")  # 숫자·'칠레산' 같은 원산지
# 맛·종류를 가르는 말 — 한쪽에만 있으면 다른 상품 (같은 뜻은 하나로)
FLAVOR_SYN = {"초콜릿": "초코", "쵸코": "초코", "갈릭": "마늘", "커리": "카레", "캬라멜": "카라멜", "스파이시": "매운"}
FLAVORS = ["허니", "초코", "딸기", "바닐라", "말차", "녹차", "블루베리", "망고", "바나나", "오리지널", "플레인", "매운", "순한", "로제", "불닭",
           "마늘", "카레", "데리야끼", "레몬", "자몽", "복숭아", "청포도", "유자", "흑당", "카라멜", "민트", "코코넛", "피스타치오", "트러플", "와사비", "마라", "제로", "무가당", "라이트"]

def _flavors(text):
    t = norm(text)
    for a, b in FLAVOR_SYN.items(): t = t.replace(a, b)
    return {f for f in FLAVORS if f in t}

def _tokens(text):
    """쿠팡 이름 → 말 목록. [ ] 안(로켓프레시·판매처 이름)과 ( ) < > 안(냉동·용량)은 뺀다"""
    t = re.sub(r"\([^)]*\)|<[^>]*>|\[[^\]]*\]", " ", text or "")
    return [w for w in re.split(r"[\s_,/|]+", t) if w]

# 외국 제조사(RUMMO)와 한글 브랜드(룸모)를 맞춰 보려고 자음 뼈대만 비교한다
_CHO = "KKNTTRMPPSSxSSSKTPH"  # ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ (ㅇ 첫소리는 소리 없음)
_JONG = ["", "K", "K", "KS", "N", "NS", "NH", "T", "R", "RK", "RM", "RP", "RS", "RT", "RP", "RH", "M", "P", "PS", "S", "S", "N", "S", "S", "K", "T", "P", "H"]
def _skel_ko(s):
    out = ""
    for ch in s:
        c = ord(ch) - 0xAC00
        if 0 <= c < 11172:
            cho = _CHO[c // 588]
            out += ("" if cho == "x" else cho) + _JONG[c % 28]
    return re.sub(r"(.)\1+", r"\1", out)
def _skel_en(s):
    t = s.lower()
    for a, b in (("ph", "p"), ("th", "t"), ("sh", "s"), ("ch", "s"), ("ng", "n"), ("x", "ks"), ("ck", "k")): t = t.replace(a, b)
    t = t.translate(str.maketrans("cgqdbfvzjl", "kkktpppssr"))
    t = re.sub(r"[^kntrmpsh]", "", t).upper()
    return re.sub(r"(.)\1+", r"\1", t)
def sounds_like(ko_token, latin_maker):
    a, b = _skel_ko(ko_token), _skel_en(latin_maker)
    return len(a) >= 2 and b.startswith(a)

def brand_prefix(our_text, cp_name):
    """쿠팡 이름에서 우리 이름과 처음 겹치는 말 앞에 붙은 말들 = 쿠팡 쪽 브랜드 (굽네·프레시지 …)"""
    N = norm(our_text)
    ours = [norm(w) for w in re.split(r"\s+", re.sub(r"\([^)]*\)|\[[^\]]*\]", " ", our_text or "")) if len(norm(w)) >= 2]
    pre = []
    for w in _tokens(cp_name):
        t = norm(w)
        if not t or t in STOPWORDS or DESCRIPTIVE.match(t): continue
        if len(t) >= 2 and (t in N or any(o in t for o in ours)): break
        pre.append(t)
    return pre

def same_product(tg, cp_name):
    """이름 겹침만으로는 '닭가슴살 김치볶음밥'(천일) ↔ '굽네 닭가슴살 김치볶음밥' 이 같다고 나온다 → 브랜드·끝말·맛·묶음 구성까지 본다"""
    ours = " ".join(x for x in (tg.get("name"), tg.get("mall_name"), tg.get("brand")) if x)
    maker = norm(tg.get("maker"))
    pre = brand_prefix(ours, cp_name)
    if pre:
        latin = [w for w in re.split(r"[^a-z]+", (tg.get("maker") or "").lower()) if len(w) >= 3] if not re.search(r"[가-힣]", tg.get("maker") or "") else []
        same = maker and any(len(p) >= 2 and (p in maker or maker in p or any(sounds_like(p, w) for w in latin)) for p in pre)
        if not same: return False, f"브랜드 다름 ({pre[0]})"
    words = [w for w in re.split(r"\s+", re.sub(r"\([^)]*\)|\[[^\]]*\]", " ", tg.get("name") or "")) if norm(w)]
    if len(words) >= 2:
        head = re.sub(r"\d+(\.\d+)?(kg|g|ml|l|개입|개|입|팩|봉)?$", "", norm(words[-1]))
        if len(head) >= 2 and head not in norm(cp_name): return False, f"'{words[-1]}' 없음"
    fo, fc = _flavors(ours), _flavors(cp_name)
    if fo != fc: return False, f"맛 다름 ({'/'.join(sorted(fo ^ fc))})"
    if re.search(r"\d+\s*종", cp_name) and not re.search(r"\d+\s*종", ours): return False, "여러 종 묶음"
    return True, ""

def accept(tg, it):
    name = it.get("productName") or ""
    nn = norm(name)
    brand = norm(tg.get("brand"))
    if brand and len(brand) >= 2 and brand not in nn: return False, "브랜드 없음"
    ok, why = same_product(tg, name)
    if not ok: return False, why
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

