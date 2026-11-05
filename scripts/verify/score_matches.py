"""
판매처 상품 ↔ 식약처 제품 연결을 다시 채점한다 (읽기 전용 — 결과는 파일로만).

  python3 scripts/verify/score_matches.py <matches.json 폴더>

신호
  maker  판매처 이름의 브랜드가 식약처 제품의 제조사·제품명과 맞는가 (브랜드→회사 사전 포함)
  clash  알려진 브랜드인데 제조사가 다른 알려진 회사인가 (예: [백설] ↔ 삼양사)
  weight 판매처 중량과 식약처 1회 제공량·총중량이 12% 안인가
  name   식약처 제품명이 판매처 이름에 들어 있는가 / 글자 2개씩 겹침
  generic 식약처 제품명이 너무 흔한가 (열무김치·베이글처럼 짧고 브랜드 없음)

판정
  confirmed  브랜드·제조사가 맞고 이름도 맞음
  mismatch   브랜드 충돌, 또는 브랜드가 안 맞는데 이름이 흔하거나 중량이 다름
  suspect    그 밖 (브랜드를 확인할 수 없음) → 판매처 상세의 품목보고번호로 확인할 대상
"""
import csv, json, os, re, sys
from collections import Counter, defaultdict

D = sys.argv[1]
data = json.load(open(os.path.join(D, "matches.json")))
PRODS = data["products"]

# 브랜드 → 제조사 이름에 들어가는 낱말 (OEM 이 흔한 곳은 비워 두고 '확인 불가'로)
BRANDS = {
    "cj": ["씨제이", "cj"], "씨제이": ["씨제이", "cj"], "비비고": ["씨제이", "cj"], "백설": ["씨제이", "cj"], "햇반": ["씨제이", "cj"],
    "고메": ["씨제이", "cj"], "스팸": ["씨제이", "cj"], "다담": ["씨제이", "cj", "시아스"], "해찬들": ["씨제이", "cj", "해찬들"],
    "오뚜기": ["오뚜기", "오뚜기냉동", "오뚜기라면", "조흥", "상미식품", "알디에스"], "농심": ["농심", "율촌"],
    "풀무원": ["풀무원", "푸드머스", "엑소후레쉬"], "대상": ["대상"], "청정원": ["대상"], "종가": ["대상"], "종가집": ["대상"],
    "동원": ["동원"], "양반": ["동원"], "리챔": ["동원"], "롯데": ["롯데"], "롯데웰푸드": ["롯데"], "롯데칠성": ["롯데칠성"],
    "하림": ["하림"], "하림이닭": ["하림"], "매일": ["매일"], "매일유업": ["매일"], "상하목장": ["매일"], "남양": ["남양"],
    "빙그레": ["빙그레"], "서울우유": ["서울우유"], "삼양": ["삼양식품", "삼양"], "오리온": ["오리온"], "해태": ["해태", "크라운"],
    "크라운": ["크라운", "해태"], "사조": ["사조"], "진주햄": ["진주햄"], "목우촌": ["농협목우촌", "목우촌"], "한성": ["한성기업"],
    "샘표": ["샘표"], "정관장": ["한국인삼공사"], "광동": ["광동제약", "광동"], "코카콜라": ["코카콜라", "lg생활건강", "엘지생활건강"],
    "팔도": ["팔도"], "신세계": ["신세계푸드"], "피코크": ["이마트", "신세계"], "노브랜드": ["이마트", "신세계"],
    "아워홈": ["아워홈"], "삼립": ["삼립", "spc"], "파리바게뜨": ["spc", "파리크라상"], "동서": ["동서"], "맥심": ["동서"],
    "청우": ["청우"], "일동": ["일동"], "대상웰라이프": ["대상웰라이프"], "뉴케어": ["대상웰라이프"], "마이밀": ["대상웰라이프"],
    "한미": ["한미"], "완전두유": ["한미"], "정식품": ["정식품"], "베지밀": ["정식품"], "삼육": ["삼육"], "연세": ["연세"],
    "곰곰": [], "올가": [], "컬리": [], "kurly's": [], "커피빈": [], "마켓컬리": [],
}
BIG = {"씨제이", "cj", "오뚜기", "농심", "풀무원", "대상", "동원", "롯데", "하림", "매일", "남양", "빙그레", "삼양식품", "오리온",
       "해태", "크라운", "사조", "샘표", "팔도", "아워홈", "삼립", "동서", "정식품", "서울우유", "진주햄"}

def norm(s):
    s = (s or "").lower()
    s = re.sub(r"\(주\)|㈜|주식회사|유한회사|농업회사법인|영농조합법인|\(유\)|co\.,?\s*ltd\.?|corp\.?|inc\.?", " ", s)
    s = re.sub(r"[^0-9a-z가-힣]+", "", s)
    return s

def clean_mall(name):
    s = re.sub(r"\[[^\]]*\]", " ", name)
    s = re.sub(r"\([^)]*\)", " ", s)
    s = re.sub(r"\d+(\.\d+)?\s*(kg|g|ml|l|개입|개|입|팩|봉|캔|병|포|구|매|인분|ea)\b", " ", s, flags=re.I)
    s = re.sub(r"x\s*\d+|\*\s*\d+|택\s*\d|\d+종|e\d{4,}", " ", s, flags=re.I)
    return s

SELLER_TAGS = re.compile(r"셀러허브|홈쇼핑|하프클럽|오티마트|코스트코|트레이더스|이마트|쿠팡|당일|무료배송|특가|정품|공식|^[A-Z0-9]{6,}$|국내산|냉동|냉장|haccp|인증|名品|명품", re.I)

def mall_brands(mall, name):
    """판매처 이름에서 브랜드 후보들 — [대괄호], 알려진 브랜드 낱말, (11번가·홈플러스·오아시스는) 첫 낱말"""
    out = []
    for b in re.findall(r"\[([^\]]+)\]", name):
        b = b.strip()
        if b and not SELLER_TAGS.search(b): out.append(b)
    plain = re.sub(r"\[[^\]]*\]", " ", name)
    nplain = norm(plain)
    for k in BRANDS:
        if len(norm(k)) >= 2 and norm(k) in nplain: out.append(k)
    if mall in ("homeplus", "11st", "oasis"):
        first = plain.strip().split(" ")[0] if plain.strip() else ""
        if first and not SELLER_TAGS.search(first): out.append(first)
    seen, res = set(), []
    for b in out:
        if norm(b) and norm(b) not in seen: seen.add(norm(b)); res.append(b)
    return res

def grams(text):
    t = (text or "").lower().replace(",", "")
    m = re.search(r"(\d+(?:\.\d+)?)\s*(kg|g|ml|l)\b", t)
    if not m: return None
    v = float(m.group(1)); u = m.group(2)
    return v * 1000 if u in ("kg", "l") else v

def bigrams(s):
    return {s[i:i+2] for i in range(len(s) - 1)}

def score(mall, row):
    p = PRODS.get(row["matched_product_id"]) or {}
    mname = row["name"] or ""
    pname = p.get("name") or ""
    maker = p.get("manufacturer") or ""
    brands = mall_brands(mall, mname)
    brand = brands[0] if brands else ""
    nmaker, npname = norm(maker), norm(pname)
    nmall = norm(clean_mall(mname))
    reasons = []

    # 브랜드·제조사 — 후보 중 하나라도 맞으면 맞음, 알려진 브랜드가 다른 큰 회사 제조면 충돌
    maker_ok = False; clash_with = None
    for b in brands:
        nb = norm(b)
        if len(nb) >= 2 and (nb in npname or nb in nmaker): maker_ok = True
        key = next((k for k in BRANDS if norm(k) == nb), None)
        if key is not None and BRANDS[key]:
            cos = [norm(c) for c in BRANDS[key]]
            if any(c and c in nmaker for c in cos): maker_ok = True
            else:
                other = next((x for x in BIG if x in nmaker), None)
                if other and not any(c in other or other in c for c in cos): clash_with = (b, other)
    clash = clash_with is not None and not maker_ok
    # 제조사 이름이 판매처 이름에 들어 있음 (예: 하림 ↔ 주식회사 하림)
    short_maker = re.sub(r"(제\d공장|\S*공장|본사|지점)$", "", nmaker)[:6]
    if len(short_maker) >= 2 and short_maker in norm(mname): maker_ok = True

    # 이름
    contain = len(npname) >= 2 and npname in nmall
    jac = len(bigrams(npname) & bigrams(nmall)) / max(1, len(bigrams(npname)))
    generic = len(npname) <= 5 and not maker_ok

    # 중량
    mg = grams(row.get("volume")) or grams(mname)
    cands = [float(x) for x in (p.get("serving_size_g"), p.get("total_weight_g")) if x]
    weight = None
    if mg and cands:
        def near(a, b):
            if abs(a - b) / max(a, b) <= 0.12: return True
            r = max(a, b) / min(a, b)  # 묶음(130g×3) · 낱개(17g×60)
            return r <= 120 and abs(r - round(r)) <= 0.06 * r
        weight = any(near(mg, c) for c in cands)

    # mismatch   = 틀렸을 가능성이 높음 (브랜드 충돌, 또는 브랜드 모름 + 중량 다름)
    # risky      = 확인 필요·위험 (브랜드 모름 + 흔한 이름 → 같은 이름의 다른 회사 제품일 수 있음)
    # suspect    = 확인 필요 (브랜드를 확인할 수 없음)
    # confirmed  = 브랜드·제조사·이름 일치
    if clash: status = "mismatch"; reasons.append(f"브랜드 '{clash_with[0]}' 인데 제조사 '{maker}'")
    elif maker_ok and (contain or jac >= 0.5): status = "confirmed"; reasons.append("브랜드·제조사·이름 일치")
    elif not maker_ok and weight is False: status = "mismatch"; reasons.append(f"중량 다름 ({mg:g}g ↔ {', '.join(f'{c:g}' for c in cands)}g) + 브랜드 확인 안 됨")
    elif not maker_ok and generic: status = "risky"; reasons.append(f"흔한 이름 '{pname}' + 브랜드 확인 안 됨")
    elif maker_ok: status = "suspect"; reasons.append("브랜드는 맞는데 이름이 다름")
    else: status = "suspect"; reasons.append("브랜드 확인 불가" + (" (중량 일치)" if weight else ""))

    sc = (0.5 if maker_ok else 0) + 0.3 * jac + (0.2 if weight else 0) - (0.5 if clash else 0) - (0.2 if generic else 0)
    return {
        "mall": mall, "id": row["id"], "mall_name": mname, "volume": row.get("volume") or "",
        "product_id": row["matched_product_id"], "product_name": pname, "manufacturer": maker,
        "old_score": row.get("match_score"), "status": status, "score": round(sc, 3), "reason": "; ".join(reasons),
        "url": row.get("url") or row.get("product_url") or "",
    }

results = [score(m, r) for m, rows in data["malls"].items() for r in rows]
with open(os.path.join(D, "scored.csv"), "w", newline="", encoding="utf-8-sig") as f:
    w = csv.DictWriter(f, fieldnames=list(results[0].keys())); w.writeheader(); w.writerows(results)

summary = defaultdict(Counter)
for r in results: summary[r["mall"]][r["status"]] += 1
json.dump({m: dict(c) for m, c in summary.items()}, open(os.path.join(D, "summary.json"), "w"), ensure_ascii=False, indent=1)
for m, c in summary.items():
    tot = sum(c.values()); print(m, tot, {k: f"{v} ({v*100/tot:.0f}%)" for k, v in c.most_common()})
