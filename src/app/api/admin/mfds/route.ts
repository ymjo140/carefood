import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { adminOnly } from "@/lib/actor-server";

/**
 * GET /api/admin/mfds — 관리자: 식약처 식품영양성분 DB 에서 나트륨을 다시 받기 위한 읽기 전용 도구 (DB 를 바꾸지 않는다)
 *   키(MFDS_API_KEY)는 Vercel 에만 있어 서버에서만 부른다. 응답·오류에 키나 키가 든 주소를 넣지 않는다.
 *   ?mode=probe            — 서비스(02·03)별 전체 개수 + 첫 쪽 몇 개의 항목 이름·값 + 우리 DB 와 맞춰 본 칸별 일치 수
 *                             (우리가 나트륨을 아는 제품과 AMT_NUM1~30 중 어느 칸이 같은지 — 나트륨 칸 번호를 확인)
 *   ?mode=pull&svc=02&from=1&to=10&rows=500&field=AMT_NUM13
 *                          — 그 쪽들의 [식품코드, 값] 만 (나중에 확인한 뒤 SQL 로 반영 — 반영은 사용자 승인 후)
 * 배경: 가공식품(P 코드) 32만 개 중 3.4% 만 나트륨이 있다 — 예전 가져오기가 나트륨으로 AMT_NUM8(실은 식이섬유)을 읽었다.
 */
type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const BASE = "https://apis.data.go.kr/1471000";
const SVC: Record<string, [string, string]> = {
  "02": ["FoodNtrCpntDbInfo02", "getFoodNtrCpntDbInq02"],
  "03": ["FoodNtrCpntDbInfo03", "getFoodNtrCpntDbInq03"],
};
export const maxDuration = 60;

type Item = Record<string, unknown>;
const num = (v: unknown) => {
  if (v === null || v === undefined || v === "" || v === "-") return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

/** 한 쪽 — 키가 든 주소는 오류에 넣지 않는다 */
async function page(svc: string, pageNo: number, rows: number): Promise<{ total: number; items: Item[] }> {
  const key = process.env.MFDS_API_KEY;
  if (!key) throw new Error("MFDS_API_KEY 가 없어요");
  const [s, op] = SVC[svc];
  const url = `${BASE}/${s}/${op}?serviceKey=${encodeURIComponent(key)}&pageNo=${pageNo}&numOfRows=${rows}&type=json`;
  let last = "";
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(25000) });
      if (!r.ok) { last = `HTTP ${r.status}`; continue; }
      const text = await r.text();
      let d: { body?: { totalCount?: number | string; items?: Item[] | { item?: Item[] } } };
      try { d = JSON.parse(text); } catch { last = `JSON 아님: ${text.slice(0, 120).replace(/serviceKey=[^&\s"]+/g, "serviceKey=***")}`; continue; }
      const body = d.body || {};
      const raw = body.items;
      const items = Array.isArray(raw) ? raw : Array.isArray(raw?.item) ? raw.item : [];
      return { total: Number(body.totalCount) || 0, items };
    } catch (e) {
      last = (e as Error).name === "TimeoutError" ? "시간 초과" : "요청 실패"; // 오류 문구에 주소(키)가 섞이지 않게 이름만
    }
  }
  throw new Error(`식약처 ${svc} ${pageNo}쪽: ${last}`);
}

export async function GET(req: NextRequest) {
  await connection();
  const denied = await adminOnly();
  if (denied) return denied;
  const sp = req.nextUrl.searchParams;
  const mode = sp.get("mode") || "probe";
  try {
    if (mode === "pull") {
      const svc = sp.get("svc") === "03" ? "03" : "02";
      const rows = Math.min(500, Math.max(10, Number(sp.get("rows")) || 500));
      const from = Math.max(1, Number(sp.get("from")) || 1);
      const to = Math.min(from + 19, Math.max(from, Number(sp.get("to")) || from)); // 한 번에 20쪽까지
      const field = /^AMT_NUM\d{1,2}$/.test(sp.get("field") || "") ? sp.get("field")! : "AMT_NUM13";
      const pages = Array.from({ length: to - from + 1 }, (_, i) => from + i);
      const out: [string, number | null, number | null][] = []; // [식품코드, 그 칸 값, 열량]
      let total = 0;
      for (let i = 0; i < pages.length; i += 4) {
        const got = await Promise.all(pages.slice(i, i + 4).map((n) => page(svc, n, rows)));
        for (const g of got) {
          total = g.total || total;
          for (const it of g.items) if (it.FOOD_CD) out.push([String(it.FOOD_CD), num(it[field]), num(it.AMT_NUM1)]);
        }
      }
      return NextResponse.json({ svc, field, from, to, rows, total, pages: Math.ceil(total / rows), items: out });
    }

    // probe — 서비스별 개수 · 견본 · 칸 번호 확인
    const sb = createServiceRoleClient() as Sb;
    const report: Record<string, unknown> = {};
    for (const svc of ["02", "03"]) {
      let first: { total: number; items: Item[] };
      try { first = await page(svc, 1, 100); } catch (e) { report[svc] = { error: (e as Error).message }; continue; }
      // 뒤쪽 쪽에서도 견본 (가공식품은 앞쪽에 없을 수 있다)
      const lastPage = Math.max(1, Math.floor(first.total / 100));
      const extra = await Promise.all([Math.floor(lastPage / 2), lastPage].map((n) => page(svc, n, 100).catch(() => ({ total: 0, items: [] as Item[] }))));
      const items = [...first.items, ...extra.flatMap((x) => x.items)];
      const codes = [...new Set(items.map((it) => String(it.FOOD_CD || "")).filter(Boolean))];
      const { data, error } = await sb.from("products").select("food_code, calories, protein_g, sugar_g, sodium_mg").in("food_code", codes.slice(0, 300));
      if (error) throw new Error(error.message);
      const mine = new Map(((data || []) as { food_code: string; calories: number | null; protein_g: number | null; sugar_g: number | null; sodium_mg: number | null }[]).map((r) => [r.food_code, r]));
      // 칸마다: 우리 나트륨과 같은 수 · 우리 열량과 같은 수 (2% 또는 1 안쪽)
      const close = (a: number | null, b: number | null) => a != null && b != null && Math.abs(a - b) <= Math.max(1, Math.abs(b) * 0.02);
      const fields = Array.from({ length: 30 }, (_, i) => `AMT_NUM${i + 1}`);
      const sodiumMatch: Record<string, number> = {}, kcalMatch: Record<string, number> = {}, filled: Record<string, number> = {};
      let compared = 0;
      for (const it of items) {
        const m = mine.get(String(it.FOOD_CD || ""));
        for (const f of fields) if (num(it[f]) != null) filled[f] = (filled[f] || 0) + 1;
        if (!m) continue;
        compared++;
        for (const f of fields) {
          if (close(num(it[f]), m.sodium_mg)) sodiumMatch[f] = (sodiumMatch[f] || 0) + 1;
          if (close(num(it[f]), m.calories)) kcalMatch[f] = (kcalMatch[f] || 0) + 1;
        }
      }
      const pTotal = items.filter((it) => String(it.FOOD_CD || "").startsWith("P")).length;
      report[svc] = {
        total: first.total, sampled: items.length, sampled_P: pTotal, matched_in_db: compared,
        db_with_sodium: [...mine.values()].filter((r) => r.sodium_mg != null).length,
        filled, sodium_match: sodiumMatch, kcal_match: kcalMatch,
        keys: Object.keys(items[0] || {}).filter((k) => !/AMT_NUM/.test(k)),
        sample: items.filter((it) => String(it.FOOD_CD || "").startsWith("P")).slice(0, 3).map((it) => Object.fromEntries(Object.entries(it).filter(([k, v]) => v !== null && v !== "" && (/AMT_NUM|FOOD_CD|FOOD_NM_KR|SERVING_SIZE|NUTR_CONT|DB_CLASS/.test(k))))),
      };
    }
    return NextResponse.json(report);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
