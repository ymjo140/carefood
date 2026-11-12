/**
 * 상품 피드 — 업체가 올려 둔 CSV·JSON 을 가져와 엑셀과 같은 흐름(ingestRows)으로 넣는다. 서버 전용.
 *
 * 남이 적은 주소를 서버가 여는 일이라 주소를 좁게 받는다: https · 기본 포트 · 이름으로 된 주소(IP 직접 금지) ·
 * 이름이 가리키는 곳이 모두 공개 주소 · 옮겨 가기(redirect)는 3번까지 매번 다시 검사 · 10MB · 20초.
 */
import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { FIELDS } from "./schema";
import { ingestRows, retireMissing, type Partner } from "./ingest";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 5000;
const KEYS = new Set(FIELDS.map((f) => f.key));

function publicV4(ip: string) {
  const [a, b] = ip.split(".").map(Number);
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 168 || b === 0)) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  return true;
}
function publicIp(ip: string) {
  if (isIP(ip) === 4) return publicV4(ip);
  const v = ip.toLowerCase();
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return publicV4(mapped[1]);
  if (v === "::" || v === "::1") return false;
  if (/^f[cd]/.test(v) || /^fe[89ab]/.test(v) || v.startsWith("ff") || v.startsWith("64:ff9b") || v.startsWith("2001:db8")) return false;
  return true;
}

/** 열어도 되는 주소인지 — 아니면 이유를 던진다 */
export async function assertSafeUrl(raw: string): Promise<URL> {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error("주소 형식이 아니에요"); }
  if (u.protocol !== "https:") throw new Error("https:// 로 시작하는 주소여야 해요");
  if (u.username || u.password) throw new Error("주소에 아이디·비밀번호를 넣을 수 없어요");
  if (u.port && u.port !== "443") throw new Error("기본 포트(443) 주소만 쓸 수 있어요");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) throw new Error("숫자(IP) 주소는 쓸 수 없어요. 도메인 주소로 적어 주세요");
  if (!host.includes(".") || /\.(local|internal|localhost|test|lan)$/i.test(host)) throw new Error("공개된 도메인 주소여야 해요");
  let addrs;
  try { addrs = await lookup(host, { all: true }); } catch { throw new Error("주소를 찾지 못했어요. 도메인을 확인해 주세요"); }
  if (addrs.length === 0 || addrs.some((a) => !publicIp(a.address))) throw new Error("공개된 주소가 아니에요");
  return u;
}

/** 피드 내용을 글자로 가져온다 */
export async function fetchFeed(raw: string): Promise<string> {
  let url = raw;
  for (let hop = 0; hop < 4; hop++) {
    const u = await assertSafeUrl(url);
    const res = await fetch(u, {
      redirect: "manual", signal: AbortSignal.timeout(20_000), cache: "no-store",
      headers: { "User-Agent": "CarefoodFeed/1.0 (+https://carefood-iota.vercel.app/partner)", Accept: "text/csv, application/json;q=0.9, */*;q=0.5" },
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error("피드 주소가 다른 곳으로 옮겨 갔는데 어디인지 알 수 없어요");
      url = new URL(loc, u).toString();
      continue;
    }
    if (!res.ok) throw new Error(`피드 주소가 ${res.status} 로 답했어요`);
    if (Number(res.headers.get("content-length") || 0) > MAX_BYTES) throw new Error("피드가 10MB 를 넘어요");
    const reader = res.body?.getReader();
    if (!reader) throw new Error("피드 내용이 비어 있어요");
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); throw new Error("피드가 10MB 를 넘어요"); }
      chunks.push(value);
    }
    return new TextDecoder("utf-8").decode(Buffer.concat(chunks));
  }
  throw new Error("피드 주소가 너무 여러 번 옮겨 가요");
}

/* ───── 읽기 ───── */

/** CSV (RFC 4180: 따옴표 안의 쉼표·줄바꿈·"" ) → 칸 배열 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false; }
      else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      rows.push(row); row = [];
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/** API 초안의 묶인 모양({nutrition:{…}, offers:[…], total_weight:{value,unit}})도 양식의 납작한 키로 편다 */
export function flatten(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
  for (const [k, v] of Object.entries(o)) {
    if (k === "nutrition" && obj(v)) {
      for (const [nk, nv] of Object.entries(v)) out[nk === "basis" ? "nutrition_basis" : nk === "source" ? "nutrition_source" : nk === "image_url" ? "nutrition_image_url" : nk] = nv;
    } else if ((k === "total_weight" || k === "serving_size") && obj(v)) {
      out[k] = v.value;
      if (k === "total_weight" && v.unit) out.weight_unit = v.unit;
    } else if (k === "offers" && Array.isArray(v)) {
      v.slice(0, 2).forEach((of, i) => {
        if (!obj(of)) return;
        const sfx = i === 0 ? "" : "_2";
        out[`channel${sfx}`] = of.channel; out[`price${sfx}`] = of.price; out[`url${sfx}`] = of.url;
      });
    } else if (k === "images" && Array.isArray(v)) {
      v.slice(0, 3).forEach((src, i) => { out[`image_url_${i + 1}`] = src; });
    } else if (k === "allergens" && Array.isArray(v)) {
      out.allergens = v.length ? v.join(", ") : "없음";
    } else if (k === "shipping" && obj(v)) {
      out.shipping_type = v.type; out.shipping_fee = v.fee; out.free_shipping_over = v.free_over;
    } else if (Array.isArray(v)) out[k] = v.join(", ");
    else if (!obj(v)) out[k] = v;
  }
  return out;
}

/** 피드 글자 → 줄. JSON([…] 또는 {products:[…]}) 이나 CSV(첫 줄 = 필드 키, 엑셀 양식처럼 둘째 줄이 키여도 된다) */
export function parseFeed(text: string): { row: number; values: Record<string, unknown> }[] {
  const body = text.replace(/^﻿/, "").trim();
  if (!body) throw new Error("피드 내용이 비어 있어요");
  let rows: { row: number; values: Record<string, unknown> }[];
  if (body.startsWith("[") || body.startsWith("{")) {
    let json: unknown;
    try { json = JSON.parse(body); } catch { throw new Error("JSON 형식이 맞지 않아요"); }
    const j = json as { products?: unknown; items?: unknown };
    const list = Array.isArray(json) ? json : Array.isArray(j.products) ? j.products : Array.isArray(j.items) ? j.items : null;
    if (!list) throw new Error('JSON 은 제품 목록([…]) 이거나 {"products": […]} 여야 해요');
    rows = list.map((o, i) => ({ row: i + 1, values: o && typeof o === "object" ? flatten(o as Record<string, unknown>) : {} }));
  } else {
    const table = parseCsv(body);
    const known = (r: string[] | undefined) => (r || []).filter((c) => KEYS.has(c.trim())).length;
    const head = known(table[0]) >= 3 ? 0 : known(table[1]) >= 3 ? 1 : -1;
    if (head < 0) throw new Error("첫 줄에 필드 키(partner_sku, name, …)가 없어요. 예시 피드를 참고해 주세요");
    const keys = table[head].map((c) => c.trim());
    rows = [];
    for (let i = head + 1; i < table.length; i++) {
      const values: Record<string, unknown> = {};
      let any = false;
      table[i].forEach((c, ci) => { const k = keys[ci]; if (k && KEYS.has(k) && c.trim() !== "") { values[k] = c.trim(); any = true; } });
      if (any) rows.push({ row: i + 1, values });
    }
  }
  if (rows.length === 0) throw new Error("피드에 제품이 없어요");
  if (rows.length > MAX_ROWS) throw new Error(`피드 하나에 ${MAX_ROWS.toLocaleString("ko-KR")}개까지 받을 수 있어요`);
  return rows;
}

/** 예시 피드(CSV) — 양식의 필드 키 한 줄 + 예시 한 줄 */
export function exampleCsv(): string {
  const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return `﻿${FIELDS.map((f) => f.key).join(",")}\n${FIELDS.map((f) => q(f.example)).join(",")}\n`;
}

/* ───── 가져오기 ───── */

export type FeedRow = { partner_id: string; url: string; last_hash: string | null; failures: number };
export type FeedOutcome = { status: "ok" | "unchanged" | "failed"; error?: string; rows?: number; ok?: number; review?: number; rejected?: number; unchanged?: number; retired?: number; retire_skipped?: number };

/** 피드 하나 가져와 넣기. fetcher 는 시험에서 바꿔 끼운다 */
export async function runFeed(sb: Sb, feed: FeedRow, partner: Partner, fetcher: (url: string) => Promise<string> = fetchFeed): Promise<FeedOutcome> {
  const now = new Date().toISOString();
  let outcome: FeedOutcome;
  const patch: Record<string, unknown> = { last_fetched_at: now, updated_at: now };
  try {
    const text = await fetcher(feed.url);
    const hash = createHash("sha256").update(text).digest("hex");
    if (hash === feed.last_hash) {
      outcome = { status: "unchanged" };
      Object.assign(patch, { last_status: "unchanged", last_error: null, failures: 0 });
    } else {
      const rows = parseFeed(text);
      let host = "피드";
      try { host = new URL(feed.url).hostname; } catch { /* 이름만 못 줄인다 */ } // ds-allow: 기록에 붙일 이름일 뿐
      const r = await ingestRows(sb, partner, rows, "feed", host, null);
      const present = new Set(rows.map((x) => String(x.values.partner_sku ?? "").trim()).filter(Boolean));
      const retired = await retireMissing(sb, partner, present);
      outcome = { status: "ok", rows: r.rows, ok: r.ok, review: r.review, rejected: r.error, unchanged: r.unchanged, retired: retired.retired, retire_skipped: retired.skipped };
      Object.assign(patch, { last_status: "ok", last_error: null, failures: 0, last_hash: hash, last_batch_id: r.batch_id, last_summary: outcome });
    }
  } catch (e) {
    const msg = e instanceof Error && e.name === "TimeoutError" ? "20초 안에 답이 없었어요" : (e as Error).message || "가져오지 못했어요";
    outcome = { status: "failed", error: msg };
    Object.assign(patch, { last_status: "failed", last_error: msg.slice(0, 300), failures: Math.min(999, (feed.failures || 0) + 1) });
  }
  const { error } = await sb.from("partner_feeds").update(patch).eq("partner_id", feed.partner_id);
  if (error) console.error("피드 기록을 남기지 못했어요:", error.message);
  return outcome;
}
