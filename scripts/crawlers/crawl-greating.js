/**
 * 그리팅 (greating.co.kr) 건강 식단 제품 크롤러
 * 저속/칼로리/저당/단백질 식단의 개별 메뉴 수집
 */
const { chromium } = require("playwright");

async function crawlGreating() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  const products = [];

  // 카테고리별 페이지 순회
  const categories = [
    { url: "https://www.greating.co.kr/shop/shopbrand.html?type=Y&xcode=025", name: "건강식단" },
    { url: "https://www.greating.co.kr/shop/shopbrand.html?type=Y&xcode=026", name: "간편식단" },
    { url: "https://www.greating.co.kr/shop/shopbrand.html?type=Y&xcode=038", name: "질환맞춤" },
  ];

  for (const cat of categories) {
    try {
      console.log(`[그리팅] ${cat.name} 크롤링...`);
      await page.goto(cat.url, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(2000);

      // 제품 목록 추출
      const items = await page.evaluate(() => {
        const results = [];
        // 일반적인 쇼핑몰 상품 목록 셀렉터 시도
        const productEls = document.querySelectorAll(".item_cont, .prd-info, .product-item, .sp-product-item, li[class*=item]");

        for (const el of productEls) {
          const nameEl = el.querySelector(".name, .prd-name, .item_tit_box a, a[class*=name], .item_name");
          const priceEl = el.querySelector(".price, .prd-price, .item_money_box span, [class*=price]");
          const imgEl = el.querySelector("img");
          const linkEl = el.querySelector("a[href*=product], a[href*=shop]");

          if (nameEl) {
            results.push({
              name: nameEl.textContent?.trim() || "",
              price: priceEl?.textContent?.replace(/[^0-9]/g, "") || null,
              image_url: imgEl?.src || null,
              product_url: linkEl?.href || null,
            });
          }
        }

        // 셀렉터가 안 맞으면 모든 링크에서 제품 패턴 추출
        if (results.length === 0) {
          const allLinks = document.querySelectorAll("a");
          for (const a of allLinks) {
            const href = a.href || "";
            if (href.includes("/shop/shopdetail") || href.includes("product_no=")) {
              const text = a.textContent?.trim();
              if (text && text.length > 2 && text.length < 100) {
                results.push({
                  name: text,
                  price: null,
                  image_url: a.querySelector("img")?.src || null,
                  product_url: href,
                });
              }
            }
          }
        }

        return results;
      });

      console.log(`  → ${items.length}개 제품 발견`);

      for (const item of items) {
        if (item.name && !products.find(p => p.name === item.name)) {
          products.push({
            ...item,
            source: "greating",
            category: cat.name,
            price: item.price ? parseInt(item.price) : null,
          });
        }
      }
    } catch (err) {
      console.error(`[그리팅] ${cat.name} 오류:`, err.message);
    }
  }

  // 각 제품 상세 페이지에서 영양 정보 수집 (상위 20개만)
  for (const product of products.slice(0, 20)) {
    if (!product.product_url) continue;
    try {
      await page.goto(product.product_url, { waitUntil: "networkidle", timeout: 15000 });
      await page.waitForTimeout(1000);

      const detail = await page.evaluate(() => {
        const text = document.body.innerText;

        // 칼로리 패턴
        const calMatch = text.match(/(\d+)\s*kcal/i) || text.match(/열량\s*[:\s]*(\d+)/);
        const proteinMatch = text.match(/단백질\s*[:\s]*([\d.]+)\s*g/);
        const fatMatch = text.match(/지방\s*[:\s]*([\d.]+)\s*g/);
        const carbMatch = text.match(/탄수화물\s*[:\s]*([\d.]+)\s*g/);
        const sodiumMatch = text.match(/나트륨\s*[:\s]*([\d.]+)\s*mg/);
        const sugarMatch = text.match(/당류\s*[:\s]*([\d.]+)\s*g/);

        // 가격
        const priceMatch = text.match(/(\d{1,3}(,\d{3})+)\s*원/);

        // 설명
        const descEl = document.querySelector("meta[name=description]");

        return {
          calories: calMatch ? parseFloat(calMatch[1]) : null,
          protein_g: proteinMatch ? parseFloat(proteinMatch[1]) : null,
          fat_g: fatMatch ? parseFloat(fatMatch[1]) : null,
          carbs_g: carbMatch ? parseFloat(carbMatch[1]) : null,
          sodium_mg: sodiumMatch ? parseFloat(sodiumMatch[1]) : null,
          sugar_g: sugarMatch ? parseFloat(sugarMatch[1]) : null,
          price: priceMatch ? parseInt(priceMatch[1].replace(/,/g, "")) : null,
          description: descEl?.getAttribute("content") || null,
        };
      });

      Object.assign(product, {
        calories: detail.calories,
        protein_g: detail.protein_g,
        fat_g: detail.fat_g,
        carbs_g: detail.carbs_g,
        sodium_mg: detail.sodium_mg,
        sugar_g: detail.sugar_g,
        price: detail.price || product.price,
        description: detail.description,
      });

      console.log(`  [상세] ${product.name}: ${detail.calories}kcal, ${detail.protein_g}g 단백질`);
    } catch (err) {
      console.error(`  [상세 오류] ${product.name}:`, err.message);
    }
  }

  await browser.close();

  console.log(`\n[그리팅] 총 ${products.length}개 수집 완료`);
  return products;
}

// 실행
crawlGreating()
  .then(products => {
    console.log(JSON.stringify(products.slice(0, 5), null, 2));
    // 결과 파일로 저장
    const fs = require("fs");
    fs.writeFileSync("/tmp/greating-products.json", JSON.stringify(products, null, 2));
    console.log(`\n저장: /tmp/greating-products.json`);
  })
  .catch(err => console.error("Fatal:", err));
