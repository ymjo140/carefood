/**
 * 인증 카드 — 러닝 기록 공유처럼 내 식단·챌린지·공구를 인스타 스토리(9:16)에 올릴 그림으로 그린다.
 * 브라우저 캔버스에 그린다(서버 글꼴 없이 화면과 같은 글꼴). 색은 디자인 토큰(라이트 값)을 읽어 쓴다.
 *
 * 모양 세 가지
 *   photo   — 내 사진 + 아래 스티커 (1080×1920)
 *   sticker — 스티커만, 투명 바탕 (인스타 스토리에서 내 사진 위에 붙여 넣기)
 *   record  — 사진 없이 큰 숫자 (1080×1920)
 *
 * 넣는 것: 끼니·날짜·음식 이름·성분 숫자·연속 기록 일수·챌린지 해낸 날. 넣지 않는 것: 몸무게·건강 목표·질환 관련 값·효능 말.
 * 열량은 기본으로 빼고(숫자 경쟁이 되지 않게) 본인이 켜면 넣는다.
 */

export type DayMark = { date: string; state: "done" | "missed" | "today" | "future" };
export type MealCardData = {
  kind: "meal"; author: string | null; url: string; photo: string | null; meal_type: string | null; day: string;
  foods: string[]; food_count: number; total: { calories: number; protein_g: number; carbs_g: number; fat_g: number } | null; streak: number;
};
export type ChallengeCardData = {
  kind: "challenge"; author: string | null; url: string; title: string; rule: string; total_days: number; done: number; finished: boolean;
  days: DayMark[]; streak: number;
};
export type GroupBuyCardData = {
  kind: "group_buy"; author: string | null; url: string; photo: string | null; product_name: string;
  best: { packs: number; price: number; pct: number | null } | null; count: number; target: number; days_left: number | null;
};
export type CardData = MealCardData | ChallengeCardData | GroupBuyCardData;
export type CardStyle = "photo" | "sticker" | "record";
export type CardOptions = { style: CardStyle; showKcal: boolean; site: string };

const W = 1080, H = 1920;
const MEAL_LABEL: Record<string, string> = { breakfast: "아침", lunch: "점심", dinner: "저녁", snack: "간식" };
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

type Palette = Record<"canvas" | "surface" | "sunken" | "line" | "ink" | "ink2" | "brand" | "brandInk" | "onBrand" | "protein" | "carbs" | "fat" | "highlight", string>;
type Fonts = { sans: string; num: string };

/** 라이트 테마 토큰 값과 화면 글꼴 — 카드는 보는 사람 테마와 상관없이 같은 모양 */
function readTheme(): { p: Palette; f: Fonts } {
  const probe = document.createElement("div");
  probe.setAttribute("data-theme", "light");
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  const num = document.createElement("span");
  num.className = "num";
  probe.appendChild(num);
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const v = (k: string) => cs.getPropertyValue(`--ds-${k}`).trim();
  const p: Palette = {
    canvas: v("canvas"), surface: v("surface"), sunken: v("sunken"), line: v("line"), ink: v("ink"), ink2: v("ink-2"),
    brand: v("brand"), brandInk: v("brand-ink"), onBrand: v("on-brand"), protein: v("protein"), carbs: v("carbs"), fat: v("fat"), highlight: v("highlight"),
  };
  const f: Fonts = { sans: getComputedStyle(document.body).fontFamily, num: getComputedStyle(num).fontFamily };
  probe.remove();
  return { p, f };
}

function dayLabel(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${m}월 ${d}일 (${WEEK[w]})`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("사진을 불러오지 못했어요"));
    img.src = src;
  });
}

/* ── 그리기 도구 ── */
type Ctx = CanvasRenderingContext2D;
function font(ctx: Ctx, f: Fonts, size: number, weight: 400 | 500 | 700 = 400, num = false) {
  ctx.font = `${weight} ${size}px ${num ? f.num : f.sans}`;
}
function fit(ctx: Ctx, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}
/** 줄바꿈 — 최대 lines 줄, 넘치면 말줄임 */
function wrap(ctx: Ctx, text: string, max: number, lines: number) {
  const out: string[] = [];
  let cur = "";
  for (const ch of text) {
    if (ctx.measureText(cur + ch).width > max) { out.push(cur); cur = ch.trimStart(); if (out.length === lines) break; }
    else cur += ch;
  }
  if (out.length < lines && cur) out.push(cur);
  if (out.length === lines && out.join("").length < text.length) out[lines - 1] = fit(ctx, `${out[lines - 1]}${text.slice(out.join("").length)}`, max);
  return out;
}
function rrect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, fill: string, stroke?: string, lw = 3) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke(); }
}
/** 숫자 + 작은 단위를 이어 쓰기. 끝 x 를 돌려준다 */
function numUnit(ctx: Ctx, f: Fonts, x: number, y: number, value: string, unit: string, size: number, color: string, unitColor: string) {
  font(ctx, f, size, 700, true);
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
  const w = ctx.measureText(value).width;
  font(ctx, f, Math.round(size * 0.42), 500);
  ctx.fillStyle = unitColor;
  ctx.fillText(unit, x + w + 6, y);
  return x + w + 6 + ctx.measureText(unit).width;
}
function coverImage(ctx: Ctx, img: HTMLImageElement, x: number, y: number, w: number, h: number, r: number) {
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / s, sh = h / s;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.clip();
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
  ctx.restore();
}
function dots(ctx: Ctx, p: Palette, days: DayMark[], x: number, y: number, w: number, size: number) {
  const n = days.length;
  const gap = n > 1 ? Math.min(28, (w - n * size) / (n - 1)) : 0;
  const total = n * size + (n - 1) * gap;
  let cx = x + (w - total) / 2 + size / 2;
  for (const d of days) {
    ctx.beginPath();
    ctx.arc(cx, y + size / 2, size / 2 - 3, 0, Math.PI * 2);
    if (d.state === "done") { ctx.fillStyle = p.brand; ctx.fill(); }
    else if (d.state === "future") { ctx.fillStyle = p.sunken; ctx.fill(); }
    else { ctx.lineWidth = 5; ctx.strokeStyle = d.state === "today" ? p.brand : p.line; ctx.stroke(); }
    if (d.state === "done") {
      ctx.beginPath();
      ctx.lineWidth = 6; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = p.onBrand;
      ctx.moveTo(cx - size * 0.2, y + size * 0.52); ctx.lineTo(cx - size * 0.05, y + size * 0.66); ctx.lineTo(cx + size * 0.22, y + size * 0.36);
      ctx.stroke();
    }
    cx += size + gap;
  }
}

/* ── 스티커 (모든 모양의 중심) ── */
const SW = 900, PAD = 52;

function stickerHeight(d: CardData) {
  if (d.kind === "meal") return 520;
  if (d.kind === "challenge") return 470;
  return 560;
}

function drawSticker(ctx: Ctx, p: Palette, f: Fonts, d: CardData, o: CardOptions, x: number, y: number) {
  const h = stickerHeight(d);
  rrect(ctx, x, y, SW, h, 44, p.surface, p.line, 3);
  const L = x + PAD, R = x + SW - PAD, IW = SW - PAD * 2;
  ctx.textBaseline = "alphabetic";

  if (d.kind === "meal") {
    font(ctx, f, 34, 500); ctx.fillStyle = p.ink2;
    ctx.fillText(fit(ctx, `${dayLabel(d.day)} ${d.meal_type ? MEAL_LABEL[d.meal_type] || "" : ""} 기록`, IW), L, y + 84);
    // 큰 숫자 하나 — 단백질 (열량은 켰을 때만 옆에)
    const t = d.total;
    if (t) {
      font(ctx, f, 34, 500); ctx.fillStyle = p.ink2; ctx.fillText("단백질", L, y + 150);
      numUnit(ctx, f, L, y + 262, String(Math.round(t.protein_g)), "g", 120, p.protein, p.ink2);
      const cols = o.showKcal
        ? [{ k: "열량", v: Math.round(t.calories).toLocaleString("ko-KR"), u: "kcal", c: p.ink }, { k: "탄수화물", v: String(Math.round(t.carbs_g)), u: "g", c: p.carbs }]
        : [{ k: "탄수화물", v: String(Math.round(t.carbs_g)), u: "g", c: p.carbs }, { k: "지방", v: String(Math.round(t.fat_g)), u: "g", c: p.fat }];
      cols.forEach((col, i) => {
        const cx = L + 400 + i * 230;
        font(ctx, f, 30, 500); ctx.fillStyle = p.ink2; ctx.fillText(col.k, cx, y + 190);
        numUnit(ctx, f, cx, y + 258, col.v, col.u, 60, col.c, p.ink2);
      });
    } else {
      font(ctx, f, 64, 700); ctx.fillStyle = p.ink; ctx.fillText("오늘도 기록했어요", L, y + 240);
    }
    ctx.fillStyle = p.line; ctx.fillRect(L, y + 300, IW, 3);
    font(ctx, f, 36, 400); ctx.fillStyle = p.ink;
    const more = d.food_count > d.foods.length ? ` 외 ${d.food_count - d.foods.length}가지` : "";
    const foodLines = wrap(ctx, d.foods.join(" · ") + more, IW, 2);
    foodLines.forEach((line, i) => ctx.fillText(line, L, y + 362 + i * 50));
  }

  if (d.kind === "challenge") {
    font(ctx, f, 34, 500); ctx.fillStyle = p.ink2; ctx.fillText(fit(ctx, "챌린지", IW), L, y + 84);
    font(ctx, f, 46, 700); ctx.fillStyle = p.ink;
    ctx.fillText(fit(ctx, d.title, IW), L, y + 148);
    const end = numUnit(ctx, f, L, y + 270, String(d.done), `/${d.total_days}일`, 112, p.brandInk, p.ink2);
    font(ctx, f, 36, 500); ctx.fillStyle = p.ink;
    ctx.fillText(d.finished ? "해냈어요" : "해내는 중", end + 20, y + 268);
    dots(ctx, p, d.days, L, y + 312, IW, Math.min(96, Math.floor((IW - 28 * 6) / Math.max(7, d.days.length)) + 6));
  }

  if (d.kind === "group_buy") {
    font(ctx, f, 34, 500); ctx.fillStyle = p.ink2;
    ctx.fillText(d.days_left != null ? `공구 · 같이 모아요 · D-${d.days_left}` : "공구 · 같이 모아요", L, y + 84);
    font(ctx, f, 48, 700); ctx.fillStyle = p.ink;
    wrap(ctx, d.product_name, IW, 2).forEach((line, i) => ctx.fillText(line, L, y + 150 + i * 60));
    if (d.best) {
      const end = d.best.pct ? numUnit(ctx, f, L, y + 318, String(d.best.pct), "% 싸게", 104, p.brandInk, p.ink) : L;
      font(ctx, f, 36, 500); ctx.fillStyle = p.ink2;
      ctx.fillText(`${d.best.packs}개 ${d.best.price.toLocaleString("ko-KR")}원`, d.best.pct ? end + 24 : L, y + 314);
    }
    const by = y + 380;
    rrect(ctx, L, by, IW, 22, 11, p.sunken);
    const ratio = Math.min(1, d.target ? d.count / d.target : 0);
    if (ratio > 0) rrect(ctx, L, by, Math.max(22, IW * ratio), 22, 11, p.brand);
    font(ctx, f, 36, 500); ctx.fillStyle = p.ink;
    ctx.fillText(`${d.count}/${d.target}명 모였어요`, L, by + 78);
  }

  // 아래 띠 — 연속 기록 + 케어푸드
  const fy = y + h - 44;
  font(ctx, f, 32, 700); ctx.fillStyle = p.brandInk;
  const streak = d.kind === "group_buy" ? null : d.streak;
  ctx.textAlign = "left";
  ctx.fillText(streak && streak > 1 ? `기록 ${streak}일째` : d.author || "", L, fy);
  ctx.textAlign = "right"; ctx.fillStyle = p.ink;
  ctx.fillText("케어푸드", R, fy);
  ctx.textAlign = "left";
  return h;
}

/* ── 모양별 ── */
function drawFooter(ctx: Ctx, p: Palette, f: Fonts, o: CardOptions, y: number) {
  font(ctx, f, 32, 500); ctx.fillStyle = p.ink2; ctx.textAlign = "center";
  ctx.fillText(o.site, W / 2, y);
  ctx.textAlign = "left";
}

function drawRecord(ctx: Ctx, p: Palette, f: Fonts, d: CardData, o: CardOptions) {
  ctx.fillStyle = p.canvas; ctx.fillRect(0, 0, W, H);
  const L = 90;
  font(ctx, f, 44, 700); ctx.fillStyle = p.brandInk; ctx.fillText("케어푸드", L, 200);
  if (d.kind === "meal") {
    font(ctx, f, 52, 500); ctx.fillStyle = p.ink2; ctx.fillText(`${dayLabel(d.day)} ${d.meal_type ? MEAL_LABEL[d.meal_type] || "" : ""}`, L, 400);
    font(ctx, f, 88, 700); ctx.fillStyle = p.ink; ctx.fillText("오늘도 기록했어요", L, 510);
    if (d.total) {
      // 핵심 숫자 하나에 형광펜
      font(ctx, f, 300, 700, true);
      const v = String(Math.round(d.total.protein_g));
      const vw = ctx.measureText(v).width;
      ctx.fillStyle = p.highlight; ctx.fillRect(L - 10, 760, vw + 120, 110);
      numUnit(ctx, f, L, 840, v, "g", 300, p.ink, p.ink2);
      font(ctx, f, 52, 500); ctx.fillStyle = p.ink2; ctx.fillText("단백질", L, 940);
      const rows = [
        ...(o.showKcal ? [{ k: "열량", v: `${Math.round(d.total.calories).toLocaleString("ko-KR")}kcal` }] : []),
        { k: "탄수화물", v: `${Math.round(d.total.carbs_g)}g` }, { k: "지방", v: `${Math.round(d.total.fat_g)}g` },
      ];
      rows.forEach((r, i) => {
        font(ctx, f, 44, 500); ctx.fillStyle = p.ink2; ctx.fillText(r.k, L, 1080 + i * 76);
        font(ctx, f, 48, 700, true); ctx.fillStyle = p.ink; ctx.textAlign = "right"; ctx.fillText(r.v, W - L, 1080 + i * 76); ctx.textAlign = "left";
      });
    }
    font(ctx, f, 44, 400); ctx.fillStyle = p.ink;
    const more = d.food_count > d.foods.length ? ` 외 ${d.food_count - d.foods.length}가지` : "";
    wrap(ctx, d.foods.join(" · ") + more, W - L * 2, 2).forEach((line, i) => ctx.fillText(line, L, 1380 + i * 62));
    if (d.streak > 1) { font(ctx, f, 64, 700); ctx.fillStyle = p.brandInk; ctx.fillText(`기록 ${d.streak}일째`, L, 1640); }
  }
  if (d.kind === "challenge") {
    font(ctx, f, 52, 500); ctx.fillStyle = p.ink2; ctx.fillText("챌린지", L, 400);
    font(ctx, f, 76, 700); ctx.fillStyle = p.ink;
    wrap(ctx, d.title, W - L * 2, 2).forEach((line, i) => ctx.fillText(line, L, 500 + i * 96));
    font(ctx, f, 300, 700, true);
    const v = String(d.done);
    const vw = ctx.measureText(v).width;
    ctx.fillStyle = p.highlight; ctx.fillRect(L - 10, 920, vw + 260, 110);
    numUnit(ctx, f, L, 1000, v, `/${d.total_days}일`, 300, p.ink, p.ink2);
    font(ctx, f, 56, 700); ctx.fillStyle = p.ink; ctx.fillText(d.finished ? "해냈어요" : "해내는 중이에요", L, 1110);
    dots(ctx, p, d.days, L, 1200, W - L * 2, Math.min(120, Math.floor((W - L * 2 - 28 * 6) / Math.max(7, d.days.length)) + 6));
    font(ctx, f, 40, 400); ctx.fillStyle = p.ink2;
    wrap(ctx, d.rule, W - L * 2, 2).forEach((line, i) => ctx.fillText(line, L, 1420 + i * 56));
    if (d.streak > 1) { font(ctx, f, 64, 700); ctx.fillStyle = p.brandInk; ctx.fillText(`기록 ${d.streak}일째`, L, 1640); }
  }
  if (d.kind === "group_buy") {
    drawSticker(ctx, p, f, d, o, (W - SW) / 2, (H - stickerHeight(d)) / 2);
  }
  drawFooter(ctx, p, f, o, H - 110);
}

function drawPhoto(ctx: Ctx, p: Palette, f: Fonts, d: CardData, o: CardOptions, img: HTMLImageElement) {
  ctx.fillStyle = p.canvas; ctx.fillRect(0, 0, W, H);
  const sh = stickerHeight(d);
  const ph = 960, overlap = 140;
  const total = 70 + ph + sh - overlap;
  const top = Math.max(120, (H - total) / 2 - 20);
  font(ctx, f, 40, 700); ctx.fillStyle = p.brandInk; ctx.fillText("케어푸드", 60, top);
  if (d.author) { font(ctx, f, 36, 500); ctx.fillStyle = p.ink2; ctx.textAlign = "right"; ctx.fillText(fit(ctx, d.author, 600), W - 60, top); ctx.textAlign = "left"; }
  coverImage(ctx, img, 60, top + 40, W - 120, ph, 40);
  drawSticker(ctx, p, f, d, o, (W - SW) / 2, top + 40 + ph - overlap);
  drawFooter(ctx, p, f, o, H - 110);
}

/** 카드 한 장을 PNG 로 */
export async function renderCard(d: CardData, o: CardOptions): Promise<Blob> {
  await document.fonts.ready;
  const { p, f } = readTheme();
  // 숫자 글꼴·한글 글꼴을 미리 불러 둔다 (처음 그릴 때 기본 글꼴로 그려지지 않게)
  // 못 불러와도(글꼴 파일이 막힘 등) 카드는 기본 글꼴로 그린다
  await Promise.all([[`700 48px ${f.sans}`, "가"], [`500 48px ${f.sans}`, "가"], [`700 48px ${f.num}`, "0"]]
    .map(([spec, text]) => document.fonts.load(spec, text).catch((e) => console.warn("카드 글꼴을 불러오지 못했어요", e)))); // ds-allow: 글꼴은 보조 — 기본 글꼴로 그린다

  const canvas = document.createElement("canvas");
  const style = o.style === "photo" && !("photo" in d && d.photo) ? "record" : o.style;
  if (style === "sticker") {
    canvas.width = SW + 24; canvas.height = stickerHeight(d) + 24;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("이 브라우저에서는 카드를 그릴 수 없어요");
    drawSticker(ctx, p, f, d, o, 12, 12);
  } else {
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("이 브라우저에서는 카드를 그릴 수 없어요");
    if (style === "photo" && "photo" in d && d.photo) drawPhoto(ctx, p, f, d, o, await loadImage(d.photo));
    else drawRecord(ctx, p, f, d, o);
  }
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("카드를 만들지 못했어요"))), "image/png"));
}

/** 이 카드에 사진 모양을 쓸 수 있는지 */
export function hasPhoto(d: CardData) {
  return "photo" in d && !!d.photo;
}
