"""
식단 서비스 링크 검사 — 디자인밀·식스밀·메이크샐러드·그리팅·윤식단 (health_meal_products + product_prices)

  python3 scripts/verify/service_links.py            # 검사만 (DB 는 읽기만) → service-links.json
  python3 scripts/verify/service_links.py --apply    # 결과를 DB 에 반영

왜: 10/26 한 번 긁어 온 목록에서 이름과 링크가 엇갈려 들어간 상품이 있었다(데일리 프로틴 플랜 → 레몬생강차, 11/15).
    11/15 브라우저로 하나씩 대조해 고쳤고(scripts/verify/sql/003_service_links_20261115.sql), 이 검사가 그 대조를 매주 되풀이한다.

판정 (판매처 페이지를 실제 브라우저로 연다)
  - 상품 페이지(디자인밀 productView·식스밀·메이크샐러드·그리팅 marketDetail):
      페이지 상품명이 우리 이름과 같으면 맞음 → 판매가가 다르면 판매가를 고치고, 품절이면 숨김
      다르면 '다른 상품' → 숨김 (이름은 자동으로 바꾸지 않는다 — 사람이 보고 고친다)
  - 목록 페이지(그리팅 메뉴 미리보기·윤식단 식단 박스): 우리 이름이 그 페이지에 있으면 맞음(판매가 대조), 없으면 숨김
      메뉴가 다시 나오면 다음 검사에서 다시 보인다
  - 페이지를 못 열었거나 목록이 비어 있으면(사이트 오류) 아무것도 바꾸지 않고 '확인 못 함'으로 남긴다
  products.name·health_meal_products.name 이 같은 상품의 product_prices(platform = source)도 같이 바꾼다.
"""
import argparse, json, os, re, sys, time, urllib.parse, urllib.request

SOURCES = ("designmeal", "sixmeal", "makesalad", "greating", "yundiet")


def norm(s):
    return re.sub(r"\s+", "", (s or "").replace("&amp;", "&")).lower()


def clean_title(t):
    """그리팅 og:title 의 ' :: 건강을 쉽게, 그리팅' 같은 꼬리를 뗀다"""
    return re.split(r"\s+::\s+", t or "")[0].strip()


def judge_product(ours_name, ours_price, page):
    """상품 페이지 하나 — page: {title, price, sold, ok}"""
    if not page or not page.get("ok"):
        return {"verdict": "unchecked", "why": "페이지를 열지 못함"}
    if norm(clean_title(page.get("title"))) != norm(ours_name):
        return {"verdict": "wrong", "why": f"페이지 상품명 '{clean_title(page.get('title'))}'"}
    if page.get("sold"):
        return {"verdict": "soldout", "why": "품절"}
    price = page.get("price")
    return {"verdict": "ok", "price": price if price and price != ours_price else None}


def find_in_list(ours_name, items):
    """목록 페이지 — items: [{name, price, text}]. 이름이 같거나, 우리 이름의 괄호(묶음 표기)가 카드 글자에 있으면 같은 메뉴"""
    n = norm(ours_name)
    for it in items:
        if norm(it["name"]) == n:
            return it
    m = re.match(r"^(.*?)\s*\(([^()]*)\)\s*$", ours_name or "")
    if m:
        base, extra = norm(m.group(1)), norm(m.group(2))
        for it in items:
            if norm(it["name"]) == base and extra in norm(it.get("text")):
                return it
    return None


def judge_list(ours_name, ours_price, items):
    if not items:
        return {"verdict": "unchecked", "why": "목록을 읽지 못함"}
    it = find_in_list(ours_name, items)
    if not it:
        return {"verdict": "gone", "why": "지금 판매처 목록에 없음"}
    return {"verdict": "ok", "price": it["price"] if it.get("price") and it["price"] != ours_price else None}


def is_list_url(source, url):
    return (source == "greating" and "menuPreview" in url) or (source == "yundiet" and "ydp=box" in url)


# ── 브라우저에서 읽기 ──
JS_PRODUCT = r"""(source) => {
  const meta = p => document.querySelector(`meta[property="${p}"]`)?.content || "";
  const num = s => { const m = (s || "").replace(/\d+%/g, "").match(/\d{1,3}(,\d{3})+|\d{4,}/g); return m ? +m[m.length - 1].replace(/,/g, "") : null; };
  let title = meta("og:title"), price = null, sold = false;
  if (source === "designmeal") {
    const pe = document.querySelector(".price");
    price = num((pe?.querySelector(".sale") || pe)?.textContent) || +meta("product:sale_price:amount") || null;
    sold = meta("product:availability") && meta("product:availability") !== "in stock";
  } else if (source === "sixmeal" || source === "makesalad") {
    title = (document.querySelector("#span_product_name, .headingArea h2, .infoArea h2")?.textContent || title).trim();
    price = +meta("product:sale_price:amount") || +meta("product:price:amount") || null;
    sold = [...document.querySelectorAll(".ec-base-button.soldout, .xans-product-action .soldout")].some(e => getComputedStyle(e).display !== "none");
  } else if (source === "greating") {
    const t = document.body.innerText, at = t.indexOf((title || "").split(" :: ")[0].trim());
    const m = t.slice(at >= 0 ? at : 0).match(/(\d{1,3}(,\d{3})+)원/);
    price = m ? +m[1].replace(/,/g, "") : null;
  }
  return { ok: !!title, title, price, sold };
}"""

JS_GREATING_LIST = r"""() => {
  const L = document.body.innerText.split("\n").map(s => s.trim()).filter(Boolean), out = [];
  for (let i = 0; i < L.length - 1; i++) if (/^[\d,]+원$/.test(L[i + 1]) && !/^[\d,]+원$/.test(L[i])) out.push({ name: L[i], price: +L[i + 1].replace(/\D/g, ""), text: L[i] });
  return out;
}"""

JS_YUNDIET_LIST = r"""async () => {
  const grab = () => [...document.querySelectorAll(".y2-card")].map(c => ({
    name: c.querySelector(".nm")?.innerText.trim() || "",
    price: +((c.innerText.match(/([\d,]+)원/) || [])[1] || "0").replace(/,/g, "") || null,
    text: c.innerText }));
  const seen = new Map(); grab().forEach(x => seen.set(x.name + x.price, x));
  // L·S 사이즈처럼 보기 단추가 있으면 눌러 가며 모은다
  const tabs = [...document.querySelectorAll("*")].filter(x => /^[A-Z]\s*사이즈/.test((x.innerText || "").trim()) && x.children.length < 4);
  for (const t of tabs) { t.click(); await new Promise(r => setTimeout(r, 700)); grab().forEach(x => seen.set(x.name + x.price, x)); }
  return [...seen.values()];
}"""


def read_pages(rows):
    from playwright.sync_api import sync_playwright
    pages, lists = {}, {}
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_context(locale="ko-KR", user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36").new_page()
        for url in sorted({(r["source"], r["product_url"]) for r in rows}):
            source, u = url
            try:
                pg.goto(u, wait_until="domcontentloaded", timeout=40000)
                pg.wait_for_timeout(2500)
                if is_list_url(source, u):
                    lists[u] = pg.evaluate(JS_GREATING_LIST if source == "greating" else JS_YUNDIET_LIST)
                else:
                    pages[u] = pg.evaluate(JS_PRODUCT, source)
            except Exception as e:  # 사이트 오류 — 이 주소는 판정하지 않는다
                print(f"  열지 못함: {u} ({str(e)[:80]})")
            time.sleep(0.8)
        b.close()
    return pages, lists


# ── DB ──
def db():
    sb = (os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or "").rstrip("/") + "/rest/v1/"
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY") or ""
    if not key or sb == "/rest/v1/":
        raise SystemExit("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 비밀값이 없어요")
    h = {"apikey": key, **({"Authorization": f"Bearer {key}"} if key.startswith("eyJ") else {}), "Content-Type": "application/json"}

    def rest(method, path, body=None):
        req = urllib.request.Request(sb + path, data=json.dumps(body).encode() if body is not None else None, headers=h, method=method)
        with urllib.request.urlopen(req, timeout=60) as r:
            t = r.read()
            return json.loads(t) if t else None
    return rest


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="결과를 DB 에 반영")
    ap.add_argument("--out", default="service-links.json")
    a = ap.parse_args()
    rest = db()
    q = urllib.parse.quote
    rows = rest("GET", f"health_meal_products?select=id,source,name,price,product_url,is_available&source=in.({','.join(SOURCES)})&order=source,name&limit=5000")
    print(f"검사할 줄 {len(rows)}개")
    pages, lists = read_pages(rows)
    report = []
    for r in rows:
        u = r["product_url"]
        j = judge_list(r["name"], r["price"], lists.get(u, [])) if is_list_url(r["source"], u) else judge_product(r["name"], r["price"], pages.get(u))
        if j["verdict"] == "unchecked":
            report.append({**r, **j}); continue
        avail = j["verdict"] == "ok"
        patch = {"is_available": avail, "last_crawled_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
        if avail and j.get("price"):
            patch["price"] = j["price"]
        changed = avail != r["is_available"] or "price" in patch
        report.append({**r, **j, "changed": changed})
        if not a.apply:
            continue
        rest("PATCH", f"health_meal_products?id=eq.{r['id']}", patch)
        # 같은 상품의 가격 줄(product_prices) — 상세 화면 가격 비교에 쓰인다
        prods = rest("GET", f"products?select=id&category_large=eq.{q('건강식단서비스')}&manufacturer=eq.{r['source']}&name=eq.{q(r['name'])}")
        for p in prods or []:
            pp = {"is_available": avail, "last_crawled_at": patch["last_crawled_at"], "url": u}
            if "price" in patch:
                pp["price"] = patch["price"]
            rest("PATCH", f"product_prices?product_id=eq.{p['id']}&platform=eq.{r['source']}", pp)
    by = {}
    for x in report:
        by.setdefault(x["verdict"], 0); by[x["verdict"]] += 1
    json.dump(report, open(a.out, "w"), ensure_ascii=False, indent=1)
    print("판정:", by, "· 바뀐 줄:", sum(1 for x in report if x.get("changed")), "· 반영함" if a.apply else "· 검사만")
    for x in report:
        if x["verdict"] in ("wrong", "unchecked"):
            print(f"  [{x['verdict']}] {x['source']} {x['name']} — {x['why']}")


if __name__ == "__main__":
    main()
