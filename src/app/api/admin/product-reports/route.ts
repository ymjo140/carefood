import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { adminOnly, getAdminUser } from "@/lib/actor-server";
import { buildDbTrace, cleanFix, fixPlausible, REPORT_KINDS, type ReportKind, type ReportStatus } from "@/lib/product-reports";
import { defaultServingG } from "@/lib/serving";

/**
 * 관리 › 정보 신고 (화면: app/admin/product-reports)
 * GET  ?status=open|fixed|rejected — 제품·종류별로 묶어 건수 · 맞는 값 · 메모 · 사진(1시간 서명 주소) · 지금 제품 값
 *      · db: 그 제품이 DB 어디에 있는지 (출처·식품코드·품목보고번호·바코드·id, 저장 칸 값과 1회분·100g당, 고친 이력, 업체 연결, 찾는 SQL)
 * PATCH { product_id, kind, status, fix?, hide_links? }
 *   fix: 제품 칸 고치기(1회 제공량·기준량·열량·탄단지·당류·나트륨 — lib/product-reports FIX_FIELDS) → product_fixes 에 전·후 값을 남긴다.
 *        고친 값이 물리적으로 안 되면(기준량 1g 에 9.2kcal 초과 등) 거절. 1회분·100g당 값은 DB 트리거가 다시 계산한다.
 *   hide_links: 다른 상품으로 연결된 판매 링크를 숨긴다(product_prices.is_available = false)
 *   status 는 그 제품·종류의 처리 중(new·checking) 신고에 한꺼번에. 'fixed' 면 신고한 사람 알림함에 "고쳤어요"가 뜬다(lib/product-reports-server).
 */
type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const BUCKET = "product-reports";
type Row = { id: string; product_id: string; reporter_id: string; kind: ReportKind; claimed: Record<string, number> | null; note: string | null; photo_path: string | null; status: ReportStatus; created_at: string };

export async function GET(req: NextRequest) {
  const denied = await adminOnly();
  if (denied) return denied;
  const view = req.nextUrl.searchParams.get("status") || "open";
  const statuses = view === "fixed" ? ["fixed"] : view === "rejected" ? ["rejected"] : ["new", "checking"];
  const sb = createServiceRoleClient() as Sb;
  const { data, error } = await sb.from("product_reports")
    .select("id, product_id, reporter_id, kind, claimed, note, photo_path, status, created_at")
    .in("status", statuses).order("created_at", { ascending: false }).limit(500);
  if (error) return NextResponse.json({ error: "신고를 불러오지 못했어요" }, { status: 500 });
  const rows = (data || []) as Row[];
  const pids = [...new Set(rows.map((r) => r.product_id))];
  const [pRes, lRes] = await Promise.all([
    pids.length ? sb.from("products").select("id, name, manufacturer, meal_role, data_source, food_code, report_no, barcode, created_at, updated_at, serving_size_g, total_weight_g, nutrient_base_g, calories, protein_g, carbs_g, sugar_g, fat_g, sodium_mg, serving_g, serving_kcal").in("id", pids) : { data: [], error: null },
    pids.length ? sb.from("product_prices").select("product_id, platform, url, price, is_available").in("product_id", pids) : { data: [], error: null },
  ]);
  if (pRes.error || lRes.error) return NextResponse.json({ error: "제품을 불러오지 못했어요" }, { status: 500 });
  // 고친 이력 · 기준량 일괄 수정 기록 · 업체 연결
  const [fRes, b28, b30, piRes] = await Promise.all([
    pids.length ? sb.from("product_fixes").select("product_id, field, old_value, new_value, fixed_by, fixed_at").in("product_id", pids).order("fixed_at", { ascending: false }) : { data: [], error: null },
    pids.length ? sb.from("products_base_fix_20261128").select("id, old_base, fixed_at").in("id", pids) : { data: [], error: null },
    pids.length ? sb.from("products_base_fix_20261130").select("id, old_base, reason, fixed_at").in("id", pids) : { data: [], error: null },
    pids.length ? sb.from("partner_items").select("product_id, partner_sku, status, partners(name)").in("product_id", pids) : { data: [], error: null },
  ]);
  if (fRes.error || piRes.error) return NextResponse.json({ error: "제품 이력을 불러오지 못했어요" }, { status: 500 });
  // 기준량 일괄 수정 기록 표는 일회성 백업이라 없을 수도 있다 — 없으면 그 이력만 빼고 보여 준다
  if (b28.error) console.error("기준량 수정 기록(11/28):", b28.error.message); // ds-allow: 이력 한 줄만 빠진다
  if (b30.error) console.error("기준량 수정 기록(11/30):", b30.error.message); // ds-allow: 이력 한 줄만 빠진다
  const byPid = <T extends { product_id?: string; id?: string }>(xs: T[] | null) => {
    const m = new Map<string, T[]>();
    for (const x of xs || []) { const k = (x.product_id || x.id)!; m.set(k, [...(m.get(k) || []), x]); }
    return m;
  };
  const fixes = byPid((fRes.data || []) as { product_id: string; field: string; old_value: string | null; new_value: string | null; fixed_by: string | null; fixed_at: string }[]);
  const baseFixes = byPid([...((b28.data || []) as { id: string; old_base: number; fixed_at: string }[]), ...((b30.data || []) as { id: string; old_base: number; reason: string; fixed_at: string }[])]);
  const partnerOf = new Map<string, { name: string; sku: string; status: string }>();
  for (const x of (piRes.data || []) as { product_id: string; partner_sku: string; status: string; partners: { name: string } | null }[]) {
    partnerOf.set(x.product_id, { name: x.partners?.name || "업체", sku: x.partner_sku, status: x.status });
  }
  const products = new Map(((pRes.data || []) as { id: string }[]).map((p) => [p.id, p]));
  const links = new Map<string, unknown[]>();
  for (const l of (lRes.data || []) as { product_id: string }[]) links.set(l.product_id, [...(links.get(l.product_id) || []), l]);

  // 사진 서명 주소 (1시간)
  const paths = rows.map((r) => r.photo_path).filter((p): p is string => !!p);
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data: s, error: sErr } = await sb.storage.from(BUCKET).createSignedUrls(paths, 3600);
    if (sErr) console.error("신고 사진 주소:", sErr.message); // ds-allow: 사진만 못 보여 줄 뿐 신고 목록은 보여 준다
    for (const x of (s || []) as { path: string; signedUrl: string }[]) if (x.signedUrl) signed.set(x.path, x.signedUrl);
  }

  const groups = new Map<string, { product_id: string; kind: ReportKind; count: number; status: ReportStatus; last_at: string; claims: Record<string, number>[]; notes: string[]; photos: string[] }>();
  for (const r of rows) {
    const k = `${r.product_id}:${r.kind}`;
    const g = groups.get(k) ?? { product_id: r.product_id, kind: r.kind, count: 0, status: r.status, last_at: r.created_at, claims: [], notes: [], photos: [] };
    g.count++;
    if (r.status === "checking") g.status = "checking";
    if (r.claimed) g.claims.push(r.claimed);
    if (r.note) g.notes.push(r.note);
    if (r.photo_path && signed.get(r.photo_path)) g.photos.push(signed.get(r.photo_path)!);
    groups.set(k, g);
  }
  const items = [...groups.values()].sort((a, z) => z.count - a.count || z.last_at.localeCompare(a.last_at))
    .map((g) => {
      const p = products.get(g.product_id) as Record<string, unknown> | undefined;
      const db = p ? buildDbTrace(p, g.kind, {
        fixes: fixes.get(g.product_id), baseFixes: baseFixes.get(g.product_id), partner: partnerOf.get(g.product_id) ?? null,
        servingG: defaultServingG(p as { serving_size_g?: unknown; meal_role?: unknown; name?: unknown }),
      }) : null;
      return { ...g, product: p ?? null, links: links.get(g.product_id) ?? [], db };
    });
  return NextResponse.json({ items });
}

export async function PATCH(req: NextRequest) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "관리자만 볼 수 있어요" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const productId = String(body?.product_id || "");
  const kind = body?.kind as ReportKind;
  const status = body?.status as ReportStatus;
  if (!/^[0-9a-f-]{36}$/i.test(productId) || !REPORT_KINDS.includes(kind) || !["checking", "fixed", "rejected"].includes(status)) {
    return NextResponse.json({ error: "처리할 신고를 다시 골라 주세요" }, { status: 400 });
  }
  const { fix, bad } = cleanFix(body?.fix);
  if (bad.length) return NextResponse.json({ error: `${bad.join(", ")} 값을 다시 적어 주세요` }, { status: 400 });
  const sb = createServiceRoleClient() as Sb;
  const by = admin.email || admin.id;
  try {
    if (Object.keys(fix).length) {
      const { data: cur, error } = await sb.from("products").select("id, serving_size_g, nutrient_base_g, calories, protein_g, carbs_g, sugar_g, fat_g, sodium_mg").eq("id", productId).maybeSingle();
      if (error) throw new Error(error.message);
      if (!cur) return NextResponse.json({ error: "제품을 찾지 못했어요" }, { status: 404 });
      const next = { ...cur, ...fix };
      const why = fixPlausible(next);
      if (why) return NextResponse.json({ error: why }, { status: 400 });
      const changed = Object.keys(fix).filter((k) => Number(cur[k]) !== fix[k]);
      if (changed.length) {
        // 읽은 값이 그대로일 때만 고친다 — 그 사이 다른 관리자가 고쳤으면 덮지 않는다
        let q = sb.from("products").update(Object.fromEntries(changed.map((k) => [k, fix[k]]))).eq("id", productId);
        for (const k of changed) q = cur[k] == null ? q.is(k, null) : q.eq(k, cur[k]);
        const { data: up, error: uErr } = await q.select("id");
        if (uErr) throw new Error(uErr.message);
        if (!up?.length) return NextResponse.json({ error: "그 사이 다른 값으로 바뀌었어요. 새로고침해 주세요" }, { status: 409 });
        const { error: fErr } = await sb.from("product_fixes").insert(changed.map((k) => ({
          product_id: productId, field: k, old_value: cur[k] == null ? null : String(cur[k]), new_value: String(fix[k]), report_kind: kind, fixed_by: by,
        })));
        if (fErr) throw new Error(fErr.message);
      }
    }
    if (body?.hide_links === true) {
      const { error } = await sb.from("product_prices").update({ is_available: false }).eq("product_id", productId);
      if (error) throw new Error(error.message);
      const { error: fErr } = await sb.from("product_fixes").insert({ product_id: productId, field: "product_prices.is_available", old_value: null, new_value: "false", report_kind: kind, fixed_by: by });
      if (fErr) throw new Error(fErr.message);
    }
    const patch = status === "checking" ? { status } : { status, resolved_at: new Date().toISOString(), resolved_by: by };
    const { data: done, error } = await sb.from("product_reports").update(patch)
      .eq("product_id", productId).eq("kind", kind).in("status", ["new", "checking"]).select("id");
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, reports: done?.length ?? 0 });
  } catch (e) {
    console.error("정보 신고 처리:", (e as Error).message);
    return NextResponse.json({ error: "처리하지 못했어요. 다시 시도해 주세요" }, { status: 500 });
  }
}
