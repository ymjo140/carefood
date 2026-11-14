import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getPartnerContext } from "@/lib/partner/auth";
import { checkClaimsWith } from "@/lib/partner/claims";
import { loadClaimTerms } from "@/lib/partner/claims-server";
import { flatten } from "@/lib/partner/feed";
import { ingestRows } from "@/lib/partner/ingest";
import { FIELD_BY_KEY } from "@/lib/partner/schema";
import { limitRequest } from "@/lib/rate-limit";
import { WEB_EDIT } from "@/lib/partner/connect-status";

/**
 * 제품 하나 (업체 화면의 제품 상세 — v3 7.2)
 * GET  /api/partner/items/:id[?as=slug] → {item, values(양식 칸 이름으로 편 값), offers(판매처별 가격·확인일), claims, dropped, read_only}
 * POST /api/partner/items/:id {values} — 화면에서 고친 값을 엑셀·피드와 같은 검사(ingestRows)로 받는다.
 *   가격·재고·링크만 바뀌면 바로 반영, 영양·원재료·알레르기·문구가 바뀌면 다시 검수. 관리자 보기에서는 고칠 수 없다.
 */
type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** 저장된 제품(PartnerItem)을 양식 칸 이름의 값으로 — 고치기 화면이 그대로 쓴다 */
function toValues(data: Record<string, unknown> | null): Record<string, string> {
  if (!data) return {};
  const flat = flatten(data);
  if (data.meal_role !== undefined) flat.meal_role_hint = data.meal_role; // 저장 이름과 양식 이름이 다르다
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(flat)) if (FIELD_BY_KEY[k] && v !== null && v !== undefined) out[k] = String(v);
  return out;
}

async function load(sb: Sb, partnerId: string, id: string) {
  return sb.from("partner_items").select("id, partner_sku, status, review_reasons, warnings, reject_note, product_id, data, approved_data, created_at, updated_at, approved_at")
    .eq("id", id).eq("partner_id", partnerId).maybeSingle();
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!UUID.test(id)) return bad("제품을 찾지 못했어요", 404);
  const ctx = await getPartnerContext(req.nextUrl.searchParams.get("as"));
  if ("error" in ctx) return ctx.error;
  const sb = createServiceRoleClient() as Sb;
  const { data: it, error } = await load(sb, ctx.partner.id, id);
  if (error) return bad(error.message, 500);
  if (!it) return bad("내 제품이 아니거나 없어진 제품이에요", 404);

  const [offers, prod, terms] = await Promise.all([
    sb.from("partner_offers").select("channel, price, url, is_available, updated_at").eq("item_id", id).order("channel"),
    it.product_id ? sb.from("products").select("rec_hold, nutrition_flag, is_purchasable").eq("id", it.product_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    loadClaimTerms(sb),
  ]);
  if (offers.error || prod.error) return bad((offers.error || prod.error).message, 500);
  const f = prod.data as { rec_hold: string | null; nutrition_flag: string | null; is_purchasable: boolean | null } | null;
  const dropped = it.status !== "approved" || !f ? null
    : f.nutrition_flag ? "영양 값 확인 필요" : f.rec_hold ? "판매처 연결 확인 중" : f.is_purchasable === false ? "판매 기간 밖" : null;
  const d = (it.data || {}) as Record<string, string | undefined>;
  const { data: _d, approved_data: _a, ...item } = it; void _d; void _a;
  return NextResponse.json({
    item: { ...item, name: d.name || it.partner_sku },
    values: toValues(it.data),
    // 가격을 확인한 뒤 지난 날 — 60일이 넘으면 앱에서 가격을 감춘다
    offers: ((offers.data || []) as { updated_at: string }[]).map((o) => ({ ...o, age_days: Math.floor((Date.now() - Date.parse(o.updated_at)) / 86400e3) })),
    claims: checkClaimsWith(terms, d.name, d.description, d.claims),
    dropped,
    read_only: ctx.role === "admin",
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await limitRequest(req, "upload");
  if (limited) return limited;
  const { id } = await params;
  if (!UUID.test(id)) return bad("제품을 찾지 못했어요", 404);
  const ctx = await getPartnerContext(req.nextUrl.searchParams.get("as"));
  if ("error" in ctx) return ctx.error;
  if (ctx.role === "admin") return bad("관리자 보기에서는 고칠 수 없어요", 403);
  const b = await req.json().catch(() => null);
  if (!b || typeof b.values !== "object" || Array.isArray(b.values)) return bad("고친 값을 보내 주세요");

  const sb = createServiceRoleClient() as Sb;
  const { data: it, error } = await load(sb, ctx.partner.id, id);
  if (error) return bad(error.message, 500);
  if (!it) return bad("내 제품이 아니거나 없어진 제품이에요", 404);

  // 지금 값 위에 고친 칸만 얹는다. 제품 코드는 바꿀 수 없다 (바꾸면 다른 제품이 된다)
  const changes: Record<string, string> = {};
  for (const [k, v] of Object.entries(b.values as Record<string, unknown>)) {
    if (!FIELD_BY_KEY[k] || k === "partner_sku") continue;
    changes[k] = v === null || v === undefined ? "" : String(v).slice(0, 3000);
  }
  const values = { ...toValues(it.data), ...changes, partner_sku: it.partner_sku };
  try {
    const result = await ingestRows(sb, ctx.partner, [{ row: 1, values }], "api", WEB_EDIT, ctx.userId);
    return NextResponse.json(result);
  } catch (e) {
    return bad((e as Error).message, 500);
  }
}
