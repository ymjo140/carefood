/**
 * 건강 식단 사이트 크롤러 v2
 * 식스밀, 다노샵 (카페24 기반) + API 기반 사이트
 */
const { chromium } = require("playwright");
const fs = require("fs");

const OUTPUT = "/tmp/health-crawl/products.json";
async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── 식스밀 (카페24) ──
async function crawlSixmeal(browser) {
  console.log("\n═══ 식스밀 ═══");
  const page = await browser.newPage();
  const products = [];

  const categories = [
    { url: "/category/식단-도시락-키트/48/", name: "식단키트" },
    { url: "/category/현미밥-식단-도시락/78/", name: "현미밥도시락" },
    { url: "/category/볶음밥-식단-도시락/82/", name: "볶음밥도시락" },
    { url: "/category/두부면-식단-도시락/97/", name: "두부면도시락" },
    { url: "/category/샐러드-식단-도시락/99/", name: "샐러드도시락" },
    { url: "/category/체중조절-스테이크/57/", name: "체중조절스테이크" },
    { url: "/category/닭가슴살/80/", name: "닭가슴살" },
    { url: "/category/간식류/81/", name: "간식" },
  ];

  for (const cat of categories) {
    try {
      await page.goto(`https://6meal.co.kr${cat.url}`, { waitUntil: "domcontentloaded", timeout: 15000 });
      await sleep(2000);

      const items = await page.evaluate(() => {
        const results = [];
        const records = document.querySelectorAll(".xans-product-listnormal .xans-record-");

        for (const el of records) {
          const raw = el.innerText?.trim() || "";
          const lines = raw.split("\n").map(l => l.trim()).filter(Boolean);
          const imgEl = el.querySelector("img[src*=product]");
          const linkEl = el.querySelector("a[href*=product]");

          if (lines.length < 2) continue;

          // 첫 줄이 제품명
          const name = lines[0];
          if (!name || name.length < 2 || name.length > 80) continue;

          // 가격 찾기 (할인가 우선)
          let price = null;
          for (const line of lines) {
            const match = line.match(/(\d{1,3}(,\d{3})+)원$/);
            if (match) price = parseInt(match[1].replace(/,/g, ""));
          }
          // 할인가가 있으면 더 낮은 값
          const allPrices = lines.map(l => {
            const m = l.match(/(\d{1,3}(,\d{3})+)원/);
            return m ? parseInt(m[1].replace(/,/g, "")) : null;
          }).filter(Boolean);
          if (allPrices.length > 0) price = Math.min(...allPrices);

          // URL에서 제품 ID 추출
          const href = linkEl?.href || "";
          const idMatch = href.match(/\/(\d+)\/category/);

          results.push({
            name,
            price,
            image_url: imgEl?.src || null,
            product_url: href,
            source_id: idMatch ? idMatch[1] : null,
          });
        }
        return results;
      });

      for (const item of items) {
        if (item.name && !products.find(p => p.name === item.name)) {
          products.push({ ...item, source: "sixmeal", category: cat.name });
        }
      }
      console.log(`  ${cat.name}: ${items.length}개`);
    } catch (err) {
      console.error(`  ${cat.name} 오류: ${err.message?.slice(0, 60)}`);
    }
  }

  // 상세 페이지에서 영양 정보 수집
  console.log("  영양 정보 수집...");
  for (const p of products) {
    if (!p.product_url) continue;
    try {
      await page.goto(p.product_url, { waitUntil: "domcontentloaded", timeout: 10000 });
      await sleep(1000);

      const detail = await page.evaluate(() => {
        const text = document.body.innerText;
        return {
          calories: (text.match(/열량\s*[:\s]*([\d.]+)\s*kcal/i) || text.match(/([\d.]+)\s*kcal/i))?.[1],
          protein_g: (text.match(/단백질\s*[:\s]*([\d.]+)\s*g/))?.[1],
          fat_g: (text.match(/지방\s*[:\s]*([\d.]+)\s*g/))?.[1],
          carbs_g: (text.match(/탄수화물\s*[:\s]*([\d.]+)\s*g/))?.[1],
          sodium_mg: (text.match(/나트륨\s*[:\s]*([\d.]+)\s*mg/))?.[1],
          sugar_g: (text.match(/당류\s*[:\s]*([\d.]+)\s*g/))?.[1],
          serving_size_g: (text.match(/총\s*내용량\s*[:\s]*([\d.]+)\s*g/) || text.match(/내용량\s*[:\s]*([\d.]+)\s*g/))?.[1],
          description: document.querySelector("meta[name=description]")?.content || null,
        };
      });

      if (detail.calories) p.calories = parseFloat(detail.calories);
      if (detail.protein_g) p.protein_g = parseFloat(detail.protein_g);
      if (detail.fat_g) p.fat_g = parseFloat(detail.fat_g);
      if (detail.carbs_g) p.carbs_g = parseFloat(detail.carbs_g);
      if (detail.sodium_mg) p.sodium_mg = parseFloat(detail.sodium_mg);
      if (detail.sugar_g) p.sugar_g = parseFloat(detail.sugar_g);
      if (detail.serving_size_g) p.serving_size_g = parseFloat(detail.serving_size_g);
      if (detail.description) p.description = detail.description;

      console.log(`    ${p.name}: ${p.calories || "?"}kcal, 단백질 ${p.protein_g || "?"}g`);
    } catch {
      // skip
    }
  }

  await page.close();
  console.log(`[식스밀] 총 ${products.length}개`);
  return products;
}

// ── 다노샵 (카페24) ──
async function crawlDano(browser) {
  console.log("\n═══ 다노샵 ═══");
  const page = await browser.newPage();
  const products = [];

  const categories = [
    { url: "/category/도시락/53/", name: "도시락" },
    { url: "/category/샐러드/106/", name: "샐러드" },
    { url: "/category/간편식/63/", name: "간편식" },
    { url: "/category/음료/60/", name: "음료" },
    { url: "/category/간식/55/", name: "간식" },
  ];

  for (const cat of categories) {
    try {
      await page.goto(`https://danoshop.net${cat.url}`, { waitUntil: "domcontentloaded", timeout: 15000 });
      await sleep(2000);

      const items = await page.evaluate(() => {
        const results = [];
        const records = document.querySelectorAll(".xans-product-listnormal .xans-record-, .prdList .xans-record-");

        for (const el of records) {
          const raw = el.innerText?.trim() || "";
          const lines = raw.split("\n").map(l => l.trim()).filter(Boolean);
          const imgEl = el.querySelector("img[src*=product], img[src*=web]");
          const linkEl = el.querySelector("a[href*=product]");

          if (lines.length < 1) continue;
          const name = lines[0];
          if (!name || name.length < 2 || name.length > 100) continue;

          let price = null;
          const allPrices = lines.map(l => {
            const m = l.match(/(\d{1,3}(,\d{3})+)원/) || l.match(/^(\d{1,3}(,\d{3})+)$/);
            return m ? parseInt(m[1].replace(/,/g, "")) : null;
          }).filter(Boolean);
          if (allPrices.length > 0) price = Math.min(...allPrices);

          const href = linkEl?.href || "";
          const idMatch = href.match(/\/(\d+)\//);

          results.push({
            name,
            price,
            image_url: imgEl?.src || null,
            product_url: href,
            source_id: idMatch ? idMatch[1] : null,
          });
        }
        return results;
      });

      for (const item of items) {
        if (item.name && item.name.length > 3 && !products.find(p => p.name === item.name)) {
          products.push({ ...item, source: "dano", category: cat.name });
        }
      }
      console.log(`  ${cat.name}: ${items.length}개`);
    } catch (err) {
      console.error(`  ${cat.name} 오류: ${err.message?.slice(0, 60)}`);
    }
  }

  await page.close();
  console.log(`[다노샵] 총 ${products.length}개`);
  return products;
}

// ── 메인 ──
async function main() {
  console.log("═══════════════════════════════════");
  console.log("건강 식단 크롤러 v2");
  console.log("═══════════════════════════════════");

  const browser = await chromium.launch({ headless: true });
  const allProducts = [];

  const sixmeal = await crawlSixmeal(browser);
  allProducts.push(...sixmeal);

  const dano = await crawlDano(browser);
  allProducts.push(...dano);

  await browser.close();

  // 저장
  const output = {
    crawled_at: new Date().toISOString(),
    total: allProducts.length,
    by_source: {
      sixmeal: sixmeal.length,
      dano: dano.length,
    },
    products: allProducts,
  };

  fs.mkdirSync("/tmp/health-crawl", { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2));
  console.log(`\n═══════════════════════════════════`);
  console.log(`총 ${allProducts.length}개 수집`);
  console.log(`저장: ${OUTPUT}`);

  // 요약
  const withNutrition = allProducts.filter(p => p.calories);
  console.log(`영양 정보 있는 제품: ${withNutrition.length}개`);
  console.log(`═══════════════════════════════════`);
}

main().catch(err => console.error("Fatal:", err));
