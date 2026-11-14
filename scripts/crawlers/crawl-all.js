/**
 * 건강 식단 사이트 통합 크롤러
 * Playwright로 각 사이트의 제품 목록/상세 페이지 크롤링
 */
const { chromium } = require("playwright");
const fs = require("fs");

const OUTPUT_DIR = "/tmp/health-crawl";
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── 그리팅 ──
async function crawlGreating(page) {
  console.log("\n═══ 그리팅 ═══");
  const products = [];

  // 메인 식단 페이지에서 API 응답 가로채기
  await page.goto("https://www.greating.co.kr", { waitUntil: "domcontentloaded", timeout: 30000 });
  await sleep(3000);

  // 냉동 간편식단 페이지 (개별 구매 가능한 제품)
  const urls = [
    "https://www.greating.co.kr/shop/shopbrand.html?type=Y&xcode=025",
    "https://www.greating.co.kr/shop/shopbrand.html?type=Y&xcode=026",
  ];

  for (const url of urls) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
      await sleep(3000);

      // 스크롤해서 lazy load
      for (let i = 0; i < 5; i++) {
        await page.evaluate(() => window.scrollBy(0, 800));
        await sleep(500);
      }

      const items = await page.evaluate(() => {
        const results = [];
        // 넓은 범위로 제품 카드 찾기
        const allEls = document.querySelectorAll("[class*=product], [class*=item], [class*=goods], [class*=prd]");

        for (const el of allEls) {
          const imgs = el.querySelectorAll("img");
          const links = el.querySelectorAll("a");
          const texts = el.innerText?.split("\n").filter(t => t.trim().length > 0) || [];

          if (texts.length >= 1 && (imgs.length > 0 || links.length > 0)) {
            const name = texts.find(t => t.length > 3 && t.length < 80 && !t.match(/^\d/) && !t.match(/원$/));
            const priceText = texts.find(t => t.match(/[\d,]+원/) || t.match(/^\d{1,3}(,\d{3})+$/));
            const price = priceText ? parseInt(priceText.replace(/[^0-9]/g, "")) : null;
            const img = imgs[0]?.src;
            const link = links[0]?.href;

            if (name && name.length > 3) {
              results.push({ name: name.trim(), price, image_url: img, product_url: link });
            }
          }
        }
        return results;
      });

      // 중복 제거
      for (const item of items) {
        if (!products.find(p => p.name === item.name)) {
          products.push({ ...item, source: "greating" });
        }
      }
      console.log(`  ${url.split("xcode=")[1]}: ${items.length}개`);
    } catch (err) {
      console.error(`  오류: ${err.message?.slice(0, 80)}`);
    }
  }

  console.log(`[그리팅] 총 ${products.length}개`);
  return products;
}

// ── 식스밀 ──
async function crawlSixmeal(page) {
  console.log("\n═══ 식스밀 ═══");
  const products = [];

  const categories = [
    { url: "https://6meal.co.kr/product/list.html?cate_no=82", name: "체중조절식" },
    { url: "https://6meal.co.kr/product/list.html?cate_no=72", name: "식단도시락" },
    { url: "https://6meal.co.kr/product/list.html?cate_no=80", name: "닭가슴살" },
    { url: "https://6meal.co.kr/product/list.html?cate_no=81", name: "간식류" },
  ];

  for (const cat of categories) {
    try {
      await page.goto(cat.url, { waitUntil: "domcontentloaded", timeout: 20000 });
      await sleep(2000);

      const items = await page.evaluate((catName) => {
        const results = [];
        // 카페24 기반 쇼핑몰
        const productEls = document.querySelectorAll(".prdList .item, .xans-product .xans-record-, ul.prdList > li, .product_listnormal li");

        for (const el of productEls) {
          const nameEl = el.querySelector(".name a, .prd_name a, .description .name a, [class*=name] a");
          const priceEl = el.querySelector(".price, [class*=price], .sale_price, .mPrice");
          const imgEl = el.querySelector("img[src*=product], .prdImg img, .thumbnail img, img");
          const linkEl = el.querySelector("a[href*=product]");

          const name = nameEl?.textContent?.trim().replace(/\s+/g, " ");
          if (name && name.length > 2) {
            const priceText = priceEl?.textContent || "";
            const price = parseInt(priceText.replace(/[^0-9]/g, "")) || null;

            results.push({
              name,
              price,
              image_url: imgEl?.src || null,
              product_url: linkEl?.href || null,
              category: catName,
            });
          }
        }

        // 대안: innerText 기반 파싱
        if (results.length === 0) {
          const text = document.body.innerText;
          const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].match(/스테이크|도시락|닭가슴살|볶음밥/) && lines[i].length < 60) {
              const priceLine = lines.slice(i, i + 5).find(l => l.match(/[\d,]+원/) || l.match(/^\d{1,3}(,\d{3})+$/));
              results.push({
                name: lines[i],
                price: priceLine ? parseInt(priceLine.replace(/[^0-9]/g, "")) : null,
                category: catName,
              });
            }
          }
        }

        return results;
      }, cat.name);

      for (const item of items) {
        if (!products.find(p => p.name === item.name)) {
          products.push({ ...item, source: "sixmeal" });
        }
      }
      console.log(`  ${cat.name}: ${items.length}개`);
    } catch (err) {
      console.error(`  ${cat.name} 오류: ${err.message?.slice(0, 80)}`);
    }
  }

  console.log(`[식스밀] 총 ${products.length}개`);
  return products;
}

// ── 풀무원 디자인밀 ──
// 상품 카드(.product-card) 하나에서 이름(.product-title)·판매가·주소(카드의 onclick 안 idx)를 같이 읽는다.
// 예전에는 화면의 아무 덩어리에서 "이름처럼 보이는 줄"과 "그 안의 첫 링크"를 짝지어, 여러 상품이 든 덩어리에서
// 이름은 A, 링크는 B 로 엇갈렸다(데일리 프로틴 플랜 → 레몬생강차, 11/15). 고른 뒤에는 scripts/verify/service_links.py 로 대조한다.
async function crawlDesignmeal(page) {
  console.log("\n═══ 디자인밀 ═══");
  const products = [];

  try {
    await page.goto("https://dm.pulmuone.com/product/productList.do?cid=51000001", { waitUntil: "domcontentloaded", timeout: 20000 });
    await sleep(3000);

    // 스크롤
    for (let i = 0; i < 15; i++) {
      await page.evaluate(() => window.scrollBy(0, 1500));
      await sleep(400);
    }

    const items = await page.evaluate(() => {
      return [...document.querySelectorAll(".product-card")].map((card) => {
        const name = card.querySelector(".product-title")?.innerText.trim() || "";
        const onclick = [...card.querySelectorAll("[onclick]")].map((e) => e.getAttribute("onclick")).join(" ");
        const idx = (onclick.match(/idx=(\d+)/) || [])[1];
        const prices = (card.innerText.match(/[\d,]+원/g) || []).map((p) => parseInt(p.replace(/[^0-9]/g, "")));
        return {
          name,
          price: prices.length ? prices[prices.length - 1] : null, // 할인가가 있으면 마지막이 판매가
          image_url: card.querySelector("img")?.src || null,
          product_url: idx ? `https://dm.pulmuone.com/product/productView.do?idx=${idx}` : null,
        };
      }).filter((x) => x.name && x.product_url);
    });

    products.push(...items.map(i => ({ ...i, source: "designmeal" })));
    console.log(`  전체: ${items.length}개`);
  } catch (err) {
    console.error(`  오류: ${err.message?.slice(0, 80)}`);
  }

  console.log(`[디자인밀] 총 ${products.length}개`);
  return products;
}

// ── 다노 ──
async function crawlDano(page) {
  console.log("\n═══ 다노 ═══");
  const products = [];

  try {
    await page.goto("https://danoshop.net/product/list.html?cate_no=53", { waitUntil: "domcontentloaded", timeout: 20000 });
    await sleep(2000);

    const items = await page.evaluate(() => {
      const results = [];
      const els = document.querySelectorAll(".prdList li, .xans-product li, [class*=product-item], ul[class*=prd] > li");

      for (const el of els) {
        const nameEl = el.querySelector("[class*=name] a, .description a, a[href*=product]");
        const priceEl = el.querySelector("[class*=price], .sale_price");
        const imgEl = el.querySelector("img");

        const name = nameEl?.textContent?.trim();
        if (name && name.length > 2 && name.length < 80) {
          const priceText = priceEl?.textContent || "";
          results.push({
            name,
            price: parseInt(priceText.replace(/[^0-9]/g, "")) || null,
            image_url: imgEl?.src || null,
            product_url: nameEl?.href || null,
          });
        }
      }
      return results;
    });

    products.push(...items.map(i => ({ ...i, source: "dano" })));
    console.log(`  ${items.length}개`);
  } catch (err) {
    console.error(`  오류: ${err.message?.slice(0, 80)}`);
  }

  console.log(`[다노] 총 ${products.length}개`);
  return products;
}

// ── 메인 ──
async function main() {
  console.log("═══════════════════════════════════");
  console.log("건강 식단 서비스 크롤러 시작");
  console.log("═══════════════════════════════════\n");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  const allProducts = [];

  // 각 사이트 크롤링
  const greating = await crawlGreating(page);
  allProducts.push(...greating);

  const sixmeal = await crawlSixmeal(page);
  allProducts.push(...sixmeal);

  const designmeal = await crawlDesignmeal(page);
  allProducts.push(...designmeal);

  const dano = await crawlDano(page);
  allProducts.push(...dano);

  await browser.close();

  // 결과 저장
  const output = {
    crawled_at: new Date().toISOString(),
    total: allProducts.length,
    by_source: {
      greating: greating.length,
      sixmeal: sixmeal.length,
      designmeal: designmeal.length,
      dano: dano.length,
    },
    products: allProducts,
  };

  fs.writeFileSync(`${OUTPUT_DIR}/health-products.json`, JSON.stringify(output, null, 2));
  console.log(`\n═══════════════════════════════════`);
  console.log(`총 ${allProducts.length}개 수집 완료`);
  console.log(`저장: ${OUTPUT_DIR}/health-products.json`);
  console.log(`═══════════════════════════════════`);
}

main().catch(err => console.error("Fatal:", err));
