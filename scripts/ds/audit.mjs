#!/usr/bin/env node
/**
 * 디자인 시스템 화면 검사 — 전 페이지를 띄워 스크린샷을 찍고 잴 수 있는 문제를 자동으로 잡는다.
 *
 *   npm run build && npx next start -p 3100 &
 *   npm run ds:audit                       # 기본 http://localhost:3100
 *   npm run ds:audit -- --base=https://carefood-iota.vercel.app
 *   npm run ds:audit -- --only=/diary,/weekly-box
 *   npm run ds:audit -- --ignore="cdn\\.011st\\.com"   # 검사 환경에서만 막히는 외부 요청 제외
 *
 * 잡는 것
 *   - 화면 오류: 콘솔 에러, 페이지 예외, 실패한 요청(4xx/5xx)
 *   - 가로 넘침: 화면이 옆으로 넘쳐 가로 스크롤이 생기는 곳
 *   - 기준 밖 색: 디자인 토큰에 없는 색이 실제로 칠해진 곳
 *   - 흐린 글자: 배경 대비 4.5 미만(큰 글자 3 미만)
 *   - 한글 단어 쪼개짐: 한 단어가 두 줄로 나뉜 곳 ("김하/늘")
 *   - 너무 작은 글자: 12px 미만
 *   - 너무 작은 터치 영역: 모바일에서 32px 미만 버튼·링크 (경고)
 *
 * 결과: ds-audit/report/index.html (+ shots/*.jpg), scripts/ds/metrics/audit.json(요약)
 * 필요: playwright (없으면 `npm i -D playwright && npx playwright install chromium`)
 */
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, rmSync, existsSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch {
  console.error("playwright 가 없어요. `npm i -D playwright && npx playwright install chromium` 후 다시 실행하세요.");
  process.exit(2);
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || "").split("=").slice(1).join("=") || d;
const BASE = arg("base", process.env.DS_AUDIT_BASE || "http://localhost:3100").replace(/\/$/, "");
const ONLY = arg("only", "").split(",").filter(Boolean);
// 검사 환경 탓에 막히는 외부 요청(예: 클라우드 프록시가 막는 쇼핑몰 이미지 CDN)은 --ignore=정규식 으로 제외. 리포트에 표시됨
const IGNORE = arg("ignore", process.env.DS_AUDIT_IGNORE || "");
const IGNORE_RE = IGNORE ? new RegExp(IGNORE) : null;
// 어느 커밋을 검사했는지 (Actions 는 DS_AUDIT_COMMIT, 로컬은 git HEAD)
const COMMIT = process.env.DS_AUDIT_COMMIT || (() => { try { return require("node:child_process").execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim(); } catch { return null; } })();
const OUT = join(ROOT, "ds-audit", "report");
const SHOTS = join(OUT, "shots");
const MAX_SHOT_H = 6000;
// 허용 색 = 디자인 토큰. 계산된 스타일을 하나씩 꺼내 읽는 방식은 Chromium 버전에 따라 비어 나와서 파일에서 직접 읽는다
const TOKEN_NAMES = [...new Set((readFileSync(join(ROOT, "src/styles/design-system.css"), "utf8").match(/--ds-[\w-]+(?=\s*:)/g) || []))]
  .filter((n) => !n.includes("shadow"));

const VARIANTS = [
  { id: "desktop", label: "데스크톱", viewport: { width: 1280, height: 860 }, scheme: "light", mobile: false },
  { id: "mobile", label: "모바일", viewport: { width: 390, height: 844 }, scheme: "light", mobile: true },
  { id: "mobile-dark", label: "모바일 다크", viewport: { width: 390, height: 844 }, scheme: "dark", mobile: true },
];

/* ── 페이지 목록: src/app 의 page.tsx 에서 자동 수집 ── */
function routes() {
  const out = [];
  const walk = (dir) => {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n);
      if (statSync(p).isDirectory()) { if (n !== "api") walk(p); }
      else if (n === "page.tsx") {
        const r = "/" + relative(join(ROOT, "src/app"), dirname(p)).replaceAll("\\", "/");
        out.push(r === "/." ? "/" : r.replace(/\/\([^)]+\)/g, ""));
      }
    }
  };
  walk(join(ROOT, "src/app"));
  return out.sort();
}

async function resolveDynamic(route) {
  try {
    if (route === "/products/[id]") {
      const r = await fetch(`${BASE}/api/products?limit=1&hasPrice=1`).then((x) => x.json());
      const id = r.products?.[0]?.id; return id ? `/products/${id}` : null;
    }
    if (route === "/community/[id]") {
      const r = await fetch(`${BASE}/api/community/feed?tab=recommend&page=1`).then((x) => x.json());
      const id = r.posts?.[0]?.id; return id ? `/community/${id}` : null;
    }
  } catch { /* */ }
  return null;
}

/* ── 페이지 안에서 도는 검사 ── */
function inPageChecks(names) {
  const vw = window.innerWidth;
  const issues = [];
  const push = (type, el, detail) => {
    let sel = el.tagName.toLowerCase();
    if (el.id) sel += "#" + el.id;
    const cls = (el.getAttribute("class") || "").split(/\s+/).filter(Boolean).slice(0, 4).join(".");
    if (cls) sel += "." + cls;
    const text = (el.innerText || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40);
    const r = el.getBoundingClientRect();
    issues.push({ type, sel, text, detail, y: Math.round(r.top + window.scrollY) });
  };

  // 토큰 색 목록 — 라이트·다크 두 테마 값 모두 (기준 페이지처럼 한 화면에 두 테마가 같이 그려질 수 있음)
  const probe = document.createElement("div");
  document.body.appendChild(probe);
  const tokenRGB = new Set();
  for (const theme of ["light", "dark"]) {
    const holder = document.createElement("div");
    holder.setAttribute("data-theme", theme);
    holder.hidden = true;
    document.body.appendChild(holder);
    const hs = getComputedStyle(holder);
    for (const name of names) {
      probe.style.color = hs.getPropertyValue(name).trim();
      const c = getComputedStyle(probe).color;
      const m = c.match(/[\d.]+/g); if (m) tokenRGB.add(m.slice(0, 3).map((x) => Math.round(+x)).join(","));
    }
    holder.remove();
  }
  probe.remove();

  const parse = (c) => {
    if (!c || c === "transparent") return null;
    let m = c.match(/^rgba?\(([^)]+)\)/);
    if (m) { const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; }
    m = c.match(/^color\(srgb ([^)]+)\)/);
    if (m) { const p = m[1].split(/[\s/]+/).filter(Boolean).map(Number); return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p.length > 3 ? p[3] : 1 }; }
    return null;
  };
  const key = (c) => [c.r, c.g, c.b].map((x) => Math.round(x)).join(",");
  const near = (c) => { // 토큰 색 또는 토큰 색에 투명도만 준 것 허용 (±2 반올림 오차)
    for (const t of tokenRGB) { const [r, g, b] = t.split(",").map(Number); if (Math.abs(r - c.r) <= 2 && Math.abs(g - c.g) <= 2 && Math.abs(b - c.b) <= 2) return true; }
    return false;
  };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const blend = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const effectiveBg = (el) => {
    const stack = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== "none" && !cs.backgroundImage.includes("gradient(transparent")) return null; // 이미지 위 글자는 판단 안 함
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) { stack.push(c); if (c.a >= 1) break; }
    }
    let base = parse(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
    for (let i = stack.length - 1; i >= 0; i--) base = blend(stack[i], base);
    return base;
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && +cs.opacity > 0.05;
  };
  const disabledCtx = (el) => !!el.closest("[disabled],[aria-disabled=true],.opacity-40,.opacity-50");

  const all = [...document.body.querySelectorAll("*")].filter((el) => !el.closest("svg") || el.tagName.toLowerCase() === "svg");
  const offColors = new Map();

  // 1) 가로 넘침
  const docOverflow = document.documentElement.scrollWidth - vw;
  if (docOverflow > 1) {
    const culprits = all.filter((el) => {
      const r = el.getBoundingClientRect();
      if (r.right <= vw + 1 || r.width < 2) return false;
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX; if (ox === "auto" || ox === "scroll" || ox === "hidden" || ox === "clip") return false;
      }
      return true;
    });
    // 가장 바깥에서 넘친 것 몇 개만
    const top = culprits.filter((el) => !culprits.includes(el.parentElement)).slice(0, 5);
    for (const el of top) push("overflow", el, `화면보다 ${Math.round(el.getBoundingClientRect().right - vw)}px 넘침`);
    if (!top.length) issues.push({ type: "overflow", sel: "html", text: "", detail: `문서 폭이 화면보다 ${docOverflow}px 넓음`, y: 0 });
  }

  for (const el of all) {
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    const tag = el.tagName.toLowerCase();

    // 2) 기준 밖 색
    const props = [["color", cs.color], ["background", cs.backgroundColor]];
    for (const side of ["Top", "Right", "Bottom", "Left"]) if (parseFloat(cs[`border${side}Width`]) > 0) props.push([`border`, cs[`border${side}Color`]]);
    if (tag === "svg" || el.closest("svg")) { props.push(["fill", cs.fill], ["stroke", cs.stroke]); }
    for (const [prop, val] of props) {
      const c = parse(val);
      if (!c || c.a === 0) continue;
      if (prop === "color" && !el.childNodes.length) continue;
      if (!near(c)) {
        const k = `${prop}:${key(c)}`;
        if (!offColors.has(k)) { offColors.set(k, true); push("off-color", el, `${prop} rgb(${key(c)})`); }
      }
    }

    // 텍스트를 직접 가진 요소만
    const ownText = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent).join("").trim();
    if (!ownText) continue;
    const fs = parseFloat(cs.fontSize), fw = parseInt(cs.fontWeight, 10) || 400;

    // 3) 흐린 글자
    if (!disabledCtx(el) && !el.closest("[data-ds-ignore-contrast]")) {
      const fg = parse(cs.color), bg = effectiveBg(el);
      if (fg && bg) {
        const r = ratio(fg.a < 1 ? blend(fg, bg) : fg, bg);
        const large = fs >= 24 || (fs >= 18.66 && fw >= 700);
        if (r < (large ? 3 : 4.5)) push("contrast", el, `대비 ${r.toFixed(2)} (기준 ${large ? 3 : 4.5})`);
      }
    }

    // 4) 너무 작은 글자
    if (fs < 12 && !el.closest(".sr-only")) push("tiny-text", el, `${fs}px`);
  }

  // 5) 한글 단어 쪼개짐
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let checked = 0;
  for (let node = walker.nextNode(); node && checked < 4000; node = walker.nextNode()) {
    const text = node.textContent;
    if (!/[가-힣]/.test(text) || !node.parentElement || !visible(node.parentElement)) continue;
    const re = /[가-힣A-Za-z0-9]*[가-힣][가-힣A-Za-z0-9]*/g;
    let m;
    while ((m = re.exec(text)) && checked < 4000) {
      if (m[0].length < 2) continue;
      checked++;
      const range = document.createRange();
      range.setStart(node, m.index); range.setEnd(node, m.index + m[0].length);
      const rects = [...range.getClientRects()].filter((r) => r.width > 0);
      if (rects.length > 1 && Math.abs(rects[0].top - rects[rects.length - 1].top) > 4) {
        push("word-break", node.parentElement, `"${m[0]}" 가 두 줄로 나뉨`);
      }
    }
  }

  // 6) 터치 영역 (모바일)
  if (vw < 600) {
    for (const el of document.querySelectorAll("a[href],button,[role=button],input:not([type=hidden]),select")) {
      if (!visible(el) || el.closest("p,li,td") && el.tagName === "A") continue;
      const hit = (el.type === "checkbox" || el.type === "radio") && el.closest("label") ? el.closest("label") : el;
      const r = hit.getBoundingClientRect();
      if (r.height < 32 || r.width < 32) push("touch-target", el, `${Math.round(r.width)}×${Math.round(r.height)}px`);
    }
  }

  return { issues, docHeight: document.documentElement.scrollHeight };
}

/* ── 실행 ── */
const TYPES = {
  "error": "화면 오류·실패 요청",
  "overflow": "가로 넘침",
  "off-color": "기준 밖 색",
  "contrast": "흐린 글자",
  "word-break": "한글 단어 쪼개짐",
  "tiny-text": "12px 미만 글자",
  "touch-target": "작은 터치 영역 (경고)",
};

async function main() {
  try { await fetch(BASE, { method: "HEAD" }); } catch {
    console.error(`${BASE} 에 연결하지 못했어요. 먼저 서버를 띄우세요: npm run build && npx next start -p 3100`);
    process.exit(2);
  }
  if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
  mkdirSync(SHOTS, { recursive: true });

  let list = routes();
  const resolved = [];
  for (const r of list) {
    if (r.includes("[")) { const u = await resolveDynamic(r); if (u) resolved.push({ route: r, url: u }); }
    else resolved.push({ route: r, url: r });
  }
  list = resolved.filter((x) => !ONLY.length || ONLY.includes(x.route) || ONLY.includes(x.url));

  const browser = await chromium.launch();
  const results = [];
  const started = Date.now();

  for (const v of VARIANTS) {
    const ctx = await browser.newContext({ viewport: v.viewport, colorScheme: v.scheme, deviceScaleFactor: 1, isMobile: v.mobile, hasTouch: v.mobile, locale: "ko-KR" });
    // 개인화 화면이 그려지도록 검사용 프로필을 넣어 둔다
    await ctx.addInitScript(() => {
      try {
        if (!localStorage.getItem("carefood_anon_id")) localStorage.setItem("carefood_anon_id", "anon_ds_audit");
        if (!localStorage.getItem("carefood_profile")) localStorage.setItem("carefood_profile", JSON.stringify({
          nickname: "검사용사용자", age_group: "30s", gender: "female", height: 165, weight: 58,
          concerns: ["balanced"], goals: ["muscle"], allergies: [], tastes: { salty: 5, sweet: 4, spicy: 6, fatty: 5 }, meals_per_day: 3,
        }));
      } catch { /* */ }
    });
    for (const { route, url } of list) {
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(`예외: ${e.message.slice(0, 160)}`));
      page.on("console", (m) => { if (m.type() === "error" && !(IGNORE_RE && /Failed to load resource/.test(m.text()))) errors.push(`콘솔: ${m.text().slice(0, 160)}`); });
      page.on("response", (r) => { if (IGNORE_RE && IGNORE_RE.test(r.url())) return; if (r.status() >= 400 && !r.url().includes("favicon")) errors.push(`요청 ${r.status()}: ${r.url().replace(BASE, "").slice(0, 120)}`); });
      const t0 = Date.now();
      let finalUrl = url, data = { issues: [], docHeight: 0 };
      try {
        await page.goto(BASE + url, { waitUntil: "load", timeout: 45000 });
        await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {}); // ds-allow: 요청이 계속 오가도 검사는 진행
        await page.waitForTimeout(600);
        finalUrl = page.url().replace(BASE, "");
        data = await page.evaluate(inPageChecks, TOKEN_NAMES);
      } catch (e) { errors.push(`열기 실패: ${String(e.message || e).slice(0, 160)}`); }
      const shot = `${v.id}${url.replace(/[^a-z0-9]+/gi, "_")}.jpg`;
      try {
        const h = Math.min(data.docHeight || v.viewport.height, MAX_SHOT_H);
        await page.screenshot({ path: join(SHOTS, shot), type: "jpeg", quality: 70, fullPage: false, clip: { x: 0, y: 0, width: v.viewport.width, height: h }, captureBeyondViewport: true });
      } catch { /* */ }
      const issues = [...new Set(errors)].map((e) => ({ type: "error", sel: "", text: "", detail: e, y: 0 })).concat(data.issues);
      results.push({ route, url, finalUrl, variant: v.id, shot: `shots/${shot}`, ms: Date.now() - t0, issues });
      const counts = issues.reduce((m, i) => ((m[i.type] = (m[i.type] || 0) + 1), m), {});
      console.log(`${v.label.padEnd(6)} ${url.padEnd(28)} ${Object.entries(counts).map(([k, n]) => `${k}:${n}`).join(" ") || "문제 없음"}`);
      await page.close();
    }
    await ctx.close();
  }
  await browser.close();

  const totals = Object.fromEntries(Object.keys(TYPES).map((k) => [k, 0]));
  for (const r of results) for (const i of r.issues) totals[i.type]++;
  const blocking = Object.entries(totals).filter(([k]) => k !== "touch-target").reduce((s, [, n]) => s + n, 0);
  const summary = {
    auditedAt: new Date().toISOString(), base: BASE, commit: COMMIT, ignored: IGNORE || null, pages: list.length, variants: VARIANTS.map((v) => v.label),
    screenshots: results.length, seconds: Math.round((Date.now() - started) / 1000), totals, blocking,
    byPage: list.map(({ route, url }) => ({ route, url, issues: results.filter((r) => r.url === url).reduce((s, r) => s + r.issues.filter((i) => i.type !== "touch-target").length, 0) })),
  };
  mkdirSync(join(ROOT, "scripts/ds/metrics"), { recursive: true });
  writeFileSync(join(ROOT, "scripts/ds/metrics/audit.json"), JSON.stringify(summary, null, 2));
  writeFileSync(join(OUT, "results.json"), JSON.stringify({ summary, results }, null, 2));
  writeFileSync(join(OUT, "index.html"), renderReport(summary, results, list));
  console.log(`\n[ds:audit] 페이지 ${list.length}개 × ${VARIANTS.length} = 스크린샷 ${results.length}장 · ${summary.seconds}초`);
  for (const [k, n] of Object.entries(totals)) console.log(`  ${TYPES[k].padEnd(20)} ${n}`);
  console.log(`리포트: ${relative(process.cwd(), join(OUT, "index.html"))}`);
  process.exit(blocking ? 1 : 0);
}

/* ── 리포트 HTML ── */
function esc(s) { return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

function renderReport(summary, results, list) {
  const typeOrder = Object.keys(TYPES);
  const pageBlocks = list.map(({ route, url }) => {
    const rs = results.filter((r) => r.url === url);
    const n = rs.reduce((s, r) => s + r.issues.filter((i) => i.type !== "touch-target").length, 0);
    const warn = rs.reduce((s, r) => s + r.issues.filter((i) => i.type === "touch-target").length, 0);
    const shots = rs.map((r) => {
      const v = VARIANTS.find((x) => x.id === r.variant);
      const bad = r.issues.filter((i) => i.type !== "touch-target").length;
      return `<figure class="shot ${v.mobile ? "m" : "d"}">
        <a href="${r.shot}" target="_blank" rel="noopener"><img src="${r.shot}" alt="${esc(url)} ${v.label}" loading="lazy"></a>
        <figcaption><span>${v.label}</span><span class="${bad ? "bad" : "ok"}">${bad ? `문제 ${bad}` : "통과"}</span></figcaption>
      </figure>`;
    }).join("");
    const issueRows = rs.flatMap((r) => r.issues.map((i) => ({ ...i, variant: VARIANTS.find((x) => x.id === r.variant).label })))
      .sort((a, b) => typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type));
    const issues = issueRows.length ? `<details ${n ? "open" : ""}><summary>발견 ${issueRows.length}건 (경고 ${warn})</summary><table>
      <thead><tr><th>종류</th><th>화면</th><th>내용</th><th>요소</th></tr></thead><tbody>
      ${issueRows.slice(0, 120).map((i) => `<tr class="t-${i.type}"><td><span class="tag ${i.type === "touch-target" ? "warn" : "bad"}">${esc(TYPES[i.type])}</span></td><td>${esc(i.variant)}</td><td>${esc(i.detail)}${i.text ? `<div class="sub">“${esc(i.text)}”</div>` : ""}</td><td><code>${esc(i.sel)}</code>${i.y ? `<div class="sub">y=${i.y}</div>` : ""}</td></tr>`).join("")}
      </tbody></table>${issueRows.length > 120 ? `<p class="sub">… ${issueRows.length - 120}건 더 (results.json)</p>` : ""}</details>` : "";
    return `<section class="page ${n ? "has-issue" : "clean"}" id="p${esc(url.replace(/[^a-z0-9]/gi, "_"))}">
      <header><h2><code>${esc(route)}</code></h2>${route !== url ? `<span class="sub">${esc(url)}</span>` : ""}<span class="tag ${n ? "bad" : "ok"}">${n ? `문제 ${n}` : "통과"}</span></header>
      <div class="shots">${shots}</div>${issues}</section>`;
  }).join("");

  const totalsRows = typeOrder.map((k) => `<div class="tot ${summary.totals[k] ? (k === "touch-target" ? "warn" : "bad") : "ok"}"><b>${summary.totals[k]}</b><span>${esc(TYPES[k])}</span></div>`).join("");

  return `<title>케어푸드 화면 검사</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&family=Outfit:wght@500;700&display=swap" rel="stylesheet">
<style>
:root{--canvas:#FBF8F3;--surface:#fff;--sunken:#F3EEE6;--line:#E7E0D5;--ink:#1F1A14;--ink2:#6B6157;--ink3:#756A5E;--brand:#C4870A;--brand-ink:#8A5A00;--hl:#F8DE8F;--pos:#2A7349;--pos-s:#E8F3EC;--cau:#A34A09;--cau-s:#FCEFE3;--dan:#B83228;--dan-s:#FBE9E6}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--canvas:#141210;--surface:#1E1A16;--sunken:#2A251F;--line:#3A332B;--ink:#F2EBE0;--ink2:#B5A894;--ink3:#9C8F7C;--brand:#E8AD3F;--brand-ink:#F0BD5E;--hl:#5C4714;--pos:#5CC98A;--pos-s:#1F2E24;--cau:#F0A04B;--cau-s:#3A2A17;--dan:#F07A6E;--dan-s:#3A1E1B;color-scheme:dark}}
:root[data-theme=dark]{--canvas:#141210;--surface:#1E1A16;--sunken:#2A251F;--line:#3A332B;--ink:#F2EBE0;--ink2:#B5A894;--ink3:#9C8F7C;--brand:#E8AD3F;--brand-ink:#F0BD5E;--hl:#5C4714;--pos:#5CC98A;--pos-s:#1F2E24;--cau:#F0A04B;--cau-s:#3A2A17;--dan:#F07A6E;--dan-s:#3A1E1B;color-scheme:dark}
*{box-sizing:border-box}body{margin:0;background:var(--canvas);color:var(--ink);font:16px/1.5 "Noto Sans KR",system-ui,sans-serif;word-break:keep-all;overflow-wrap:anywhere}
.wrap{max-width:1180px;margin:0 auto;padding-block:28px 80px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
h1{font-size:20px;line-height:28px;margin:0}.lead{color:var(--ink2);font-size:14px;margin:4px 0 20px}
.num,b{font-family:Outfit,"Noto Sans KR",sans-serif;font-variant-numeric:tabular-nums}
.hero{display:flex;flex-wrap:wrap;gap:24px;align-items:flex-end;background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:20px;margin-bottom:16px}
.big{font:700 32px/38px Outfit,sans-serif}.big span{background:linear-gradient(transparent 58%,var(--hl) 58%);padding:0 2px}
.tots{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;flex:1;min-width:0}
.tot{border-radius:10px;padding:10px 12px;background:var(--sunken);display:flex;flex-direction:column;gap:2px}.tot b{font-size:20px}.tot span{font-size:12px;color:var(--ink2)}
.tot.bad b{color:var(--dan)}.tot.ok b{color:var(--pos)}.tot.warn b{color:var(--cau)}
.bar{position:sticky;top:0;z-index:5;background:var(--canvas);padding:10px 0;display:flex;flex-wrap:wrap;gap:8px;border-bottom:1px solid var(--line);margin-bottom:8px}
.chip{height:36px;padding:0 14px;border-radius:999px;border:1px solid var(--line);background:var(--surface);color:var(--ink2);font:500 14px "Noto Sans KR",sans-serif;cursor:pointer}
.chip[aria-pressed=true]{border-color:var(--brand);color:var(--brand-ink);font-weight:700}
.page{border-top:1px solid var(--line);padding:24px 0}.page header{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;margin-bottom:12px}
.page h2{font-size:16px;margin:0}code{font-family:ui-monospace,monospace;font-size:12px;color:var(--ink2);background:var(--sunken);padding:1px 6px;border-radius:6px}
h2 code{font-size:14px;color:var(--ink)}
.sub{font-size:12px;color:var(--ink3)}
.tag{display:inline-flex;align-items:center;height:24px;padding:0 8px;border-radius:6px;font-size:12px;font-weight:500;white-space:nowrap}
.tag.bad{background:var(--dan-s);color:var(--dan)}.tag.ok{background:var(--pos-s);color:var(--pos)}.tag.warn{background:var(--cau-s);color:var(--cau)}
.shots{display:flex;gap:12px;overflow-x:auto;padding-bottom:6px;align-items:flex-start}
.shot{margin:0;flex:none;background:var(--surface);border:1px solid var(--line);border-radius:10px;overflow:hidden}
.shot.d{width:min(520px,80vw)}.shot.m{width:min(190px,44vw)}
.shot a{display:block;height:340px;overflow:hidden;background:var(--sunken)}.shot img{width:100%;display:block}
.shot figcaption{display:flex;justify-content:space-between;gap:8px;padding:6px 10px;font-size:12px;color:var(--ink2)}
.shot .bad{color:var(--dan);font-weight:700}.shot .ok{color:var(--pos);font-weight:700}
details{margin-top:12px}summary{cursor:pointer;font-size:14px;font-weight:700}
table{width:100%;border-collapse:collapse;margin-top:8px;font-size:12px;display:block;overflow-x:auto}
th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--ink2);font-weight:500}
body.only-issues .page.clean{display:none}
.howto{background:var(--sunken);border-radius:10px;padding:12px 16px;font-size:14px;color:var(--ink2);margin-top:24px}
</style>
<div class="wrap">
  <h1>케어푸드 화면 검사</h1>
  <p class="lead">${esc(new Date(summary.auditedAt).toLocaleString("ko-KR"))} · ${esc(summary.base)} · 페이지 ${summary.pages}개 × ${esc(summary.variants.join(" / "))} = 스크린샷 ${summary.screenshots}장 · ${summary.seconds}초${summary.ignored ? ` · 제외한 요청: <code>${esc(summary.ignored)}</code> (검사 환경 네트워크에서만 막힘)` : ""}</p>
  <div class="hero">
    <div><div class="big"><span>${summary.blocking}</span></div><div class="sub">고쳐야 할 문제 (터치 영역 경고 제외)</div></div>
    <div class="tots">${totalsRows}</div>
  </div>
  <div class="bar" role="group" aria-label="보기">
    <button class="chip" aria-pressed="true" data-f="all">전체 페이지</button>
    <button class="chip" aria-pressed="false" data-f="issues">문제 있는 페이지만</button>
  </div>
  ${pageBlocks}
  <div class="howto">자동 검사는 잴 수 있는 것만 잡습니다. 여백이 어색한지, 누를 수 있어 보이는지, 넓은 화면에서 비어 보이는지는 스크린샷을 직접 보세요. 스크린샷을 누르면 원본이 열립니다.</div>
</div>
<script>
document.querySelectorAll('.chip').forEach(function(b){b.addEventListener('click',function(){
  document.querySelectorAll('.chip').forEach(function(x){x.setAttribute('aria-pressed',x===b?'true':'false')});
  document.body.classList.toggle('only-issues',b.dataset.f==='issues');
})});
</script>`;
}

main().catch((e) => { console.error(e); process.exit(2); });
