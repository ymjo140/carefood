/**
 * 입점 업체 데이터 받기 · 반영 — 서버 전용 (서비스 키).
 * 받은 줄: 검사(schema.parseRow) → 바뀐 게 없으면 건너뜀 → 가격·재고·링크만 바뀌면 바로 반영 → 새 제품·내용 변경은 검수 대기.
 * 반영(approve): partner_items → products(100g 기준 값·건강 점수·끼니 역할) + partner_offers(가격 뷰로 들어감).
 */
import { anyChanged, CATEGORIES, contentChanged, parseRow, type PartnerItem } from "./schema";
import { healthScore } from "./health-score";
import { selectAll } from "@/lib/supabase/all";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
export type Partner = { id: string; slug: string; name: string; kind: "meal_service" | "brand" | "mall"; status: string; is_demo?: boolean };
export type RowError = { row: number; sku?: string; field?: string; message: string };
export type IngestResult = {
  batch_id: string; rows: number; ok: number; review: number; error: number; unchanged: number; errors: RowError[];
};

const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

/** 지금 살 수 있는지 — 판매 중이고 판매 기간 안 */
function onSale(item: PartnerItem) {
  if (item.status !== "on_sale") return false;
  const d = today();
  if (item.available_from && d < item.available_from) return false;
  if (item.available_to && d > item.available_to) return false;
  return true;
}

/** 가격·링크 반영 — 제품에 연결된(검수를 한 번 통과한) 것만 */
export async function applyOffers(sb: Sb, partnerId: string, itemId: string, productId: string | null, item: PartnerItem) {
  if (!productId) return;
  const now = new Date().toISOString();
  const rows = item.offers.map((o) => ({
    item_id: itemId, partner_id: partnerId, product_id: productId, channel: o.channel, price: o.price,
    pack_count: Math.min(100, Math.max(1, item.pack_count || 1)), url: o.url, image_url: item.images[0] || null,
    is_available: onSale(item), updated_at: now,
  }));
  const { error } = await sb.from("partner_offers").upsert(rows, { onConflict: "item_id,channel" });
  if (error) throw new Error(`가격을 반영하지 못했어요: ${error.message}`);
  const keep = item.offers.map((o) => o.channel);
  const { error: dErr } = await sb.from("partner_offers").delete().eq("item_id", itemId).not("channel", "in", `(${keep.join(",")})`);
  if (dErr) throw new Error(`없어진 판매처를 지우지 못했어요: ${dErr.message}`);
  // 살 수 있는지는 제품에도 (추천·식단 채우기가 is_purchasable 로 거른다) — 운영 중인 업체만
  const { data: pa } = await sb.from("partners").select("status, is_demo").eq("id", partnerId).single();
  const { error: pErr } = await sb.from("products").update({ is_purchasable: onSale(item) && pa?.status === "active" && !pa?.is_demo, updated_at: now }).eq("id", productId);
  if (pErr) throw new Error(`판매 상태를 반영하지 못했어요: ${pErr.message}`);
  // 재고가 0 인 제품은 판매 중이어도 살 수 없다 — 판매 기간·재고를 함께 보는 DB 함수로 한 번 더 맞춘다 (lib/partner/stock.ts)
  const { error: rErr } = await sb.rpc("partner_refresh_availability", { p_item: itemId });
  if (rErr) throw new Error(`재고를 반영하지 못했어요: ${rErr.message}`);
}

/** 엑셀·피드·API 에서 읽은 줄을 받는다 */
export async function ingestRows(sb: Sb, partner: Partner, rows: { row: number; values: Record<string, unknown> }[],
  channel: "excel" | "feed" | "api" | "agency", fileName: string | null, userId: string | null): Promise<IngestResult> {
  const { data: batch, error: bErr } = await sb.from("ingest_batches")
    .insert({ partner_id: partner.id, channel, file_name: fileName, row_count: rows.length, status: "processing", created_by: userId })
    .select("id").single();
  if (bErr) throw new Error(`올린 기록을 만들지 못했어요: ${bErr.message}`);

  const errors: RowError[] = [];
  let ok = 0, review = 0, unchanged = 0, failed = 0;
  try {

  // 이미 받은 제품
  const skus = [...new Set(rows.map((r) => String(r.values.partner_sku ?? "").trim()).filter(Boolean))];
  const existing = new Map<string, { id: string; data: PartnerItem; approved_data: PartnerItem | null; product_id: string | null; status: string }>();
  for (let i = 0; i < skus.length; i += 200) {
    const { data, error } = await sb.from("partner_items").select("id, partner_sku, data, approved_data, product_id, status")
      .eq("partner_id", partner.id).in("partner_sku", skus.slice(i, i + 200));
    if (error) throw new Error(error.message);
    for (const it of data || []) existing.set(it.partner_sku, it);
  }

  // 같은 바코드·품목보고번호가 이 업체의 다른 제품 코드에 있으면 검수로 (같은 제품을 두 번 올린 것일 수 있다)
  const codeOwner = new Map<string, string>();
  {
    const data = await selectAll<{ partner_sku: string; barcode: string | null; report_no: string | null }>(() => sb.from("partner_items").select("partner_sku, data->>barcode, data->>report_no").eq("partner_id", partner.id), "id");
    for (const it of data) for (const c of [it.barcode, it.report_no]) if (c) codeOwner.set(c, it.partner_sku);
  }

  const seen = new Set<string>();
  for (const r of rows) {
    const sku = String(r.values.partner_sku ?? "").trim();
    if (sku && seen.has(sku)) { failed++; errors.push({ row: r.row, sku, field: "partner_sku", message: "같은 제품 코드가 이 파일에 두 번 있어요" }); continue; }
    if (sku) seen.add(sku);
    const parsed = parseRow(r.values, partner.kind);
    if (!parsed.item) {
      failed++;
      for (const e of parsed.errors) errors.push({ row: r.row, sku: sku || undefined, field: e.field, message: e.message });
      continue;
    }
    const item = parsed.item;
    const cur = existing.get(sku);
    const changed = anyChanged(cur?.data, item);
    if (cur && changed.length === 0) { unchanged++; continue; }

    const contentDiff = contentChanged(cur?.approved_data, item);
    const reasons = [
      ...(!cur?.approved_data ? ["new"] : contentDiff.length ? ["content_changed"] : []),
      ...parsed.review.map((x) => x.code),
      ...([item.barcode, item.report_no].some((c) => c && codeOwner.has(c) && codeOwner.get(c) !== sku) ? ["duplicate_code"] : []),
    ];
    for (const c of [item.barcode, item.report_no]) if (c && !codeOwner.has(c)) codeOwner.set(c, sku);
    const now = new Date().toISOString();
    const warnings = parsed.warnings.map((w) => w.message);
    let itemId = cur?.id;
    if (reasons.length === 0 && cur) {
      // 가격·재고·링크·배송만 바뀜 → 바로
      const { error } = await sb.from("partner_items").update({
        data: item, approved_data: item, status: item.status === "discontinued" ? "discontinued" : "approved", review_reasons: [], warnings, reject_note: null, last_batch_id: batch.id, updated_at: now,
      }).eq("id", cur.id);
      if (error) throw new Error(error.message);
      await applyOffers(sb, partner.id, cur.id, cur.product_id, item);
      ok++;
    } else {
      const values = {
        partner_id: partner.id, partner_sku: sku, data: item, status: "pending", review_reasons: [...new Set(reasons)], warnings,
        reject_note: null, last_batch_id: batch.id, updated_at: now,
      };
      if (cur) {
        const { error } = await sb.from("partner_items").update(values).eq("id", cur.id);
        if (error) throw new Error(error.message);
        // 이미 팔고 있는 제품이면 가격·재고는 검수를 기다리지 않는다 (내용은 반영된 값 그대로)
        if (cur.approved_data) await applyOffers(sb, partner.id, cur.id, cur.product_id, { ...cur.approved_data, offers: item.offers, status: item.status, pack_count: cur.approved_data.pack_count, available_from: item.available_from, available_to: item.available_to });
      } else {
        const { data: ins, error } = await sb.from("partner_items").insert(values).select("id").single();
        if (error) throw new Error(error.message);
        itemId = ins.id;
      }
      review++;
    }
    const { error: vErr } = await sb.from("partner_item_versions").insert({ item_id: itemId, batch_id: batch.id, data: item, changed });
    if (vErr) console.error("변경 이력을 남기지 못했어요:", vErr.message);
  }

  } catch (e) {
    // 중간에 멈추면 '처리 중'으로 남지 않게
    await sb.from("ingest_batches").update({ ok_count: ok, review_count: review, error_count: failed, unchanged_count: unchanged, errors: errors.slice(0, 500), status: "failed" }).eq("id", batch.id);
    throw e;
  }

  const { error: uErr } = await sb.from("ingest_batches").update({
    ok_count: ok, review_count: review, error_count: failed, unchanged_count: unchanged, errors: errors.slice(0, 500), status: "done",
  }).eq("id", batch.id);
  if (uErr) console.error("올린 기록을 마무리하지 못했어요:", uErr.message);
  return { batch_id: batch.id, rows: rows.length, ok, review, error: failed, unchanged, errors };
}

/** 제품 표에 들어갈 값 (100g 기준) */
/** demo: 테스트 업체(is_demo) 제품 — 업체 화면에서만 쓰고 앱에는 숨긴다(검색·추천·주문에 안 나옴) */
export function productValues(item: PartnerItem, partnerActive: boolean, demo = false) {
  const p = item.per100;
  const cat = CATEGORIES[item.category];
  const values = {
    name: item.name,
    manufacturer: item.brand,
    report_no: item.report_no || null,
    barcode: item.barcode || null,
    food_type: item.food_type || null,
    category_large: "상용제품",
    category_medium: cat.label,
    dish_category: cat.dish,
    meal_role: item.meal_role,
    is_meal: item.meal_role === "meal",
    serving_size_g: item.serving_size,
    total_weight_g: item.total_weight,
    nutrient_base_g: 100,
    calories: p.calories_kcal, sodium_mg: p.sodium_mg, carbs_g: p.carbs_g, sugar_g: p.sugars_g, fat_g: p.fat_g,
    trans_fat_g: p.trans_fat_g, saturated_fat_g: p.saturated_fat_g, cholesterol_mg: p.cholesterol_mg, protein_g: p.protein_g,
    fiber_g: p.fiber_g, potassium_mg: p.potassium_mg, calcium_mg: p.calcium_mg,
    ingredients_raw: item.ingredients_raw,
    allergens: item.allergens,
    nutrition_source: item.nutrition_source,
    image_url: item.images[0] || null,
    is_active: !demo,
    is_purchasable: onSale(item) && partnerActive && !demo,
    data_source: "partner",
    updated_at: new Date().toISOString(),
  };
  const health_score = healthScore({
    name: item.name, calories: p.calories_kcal, fat_g: p.fat_g, saturated_fat_g: p.saturated_fat_g, sugar_g: p.sugars_g,
    sodium_mg: p.sodium_mg, fiber_g: p.fiber_g, protein_g: p.protein_g,
  }, item.meal_role, item.ingredients_raw);
  return { ...values, health_score };
}

/** 검수 통과 → 제품·가격 반영. link: 붙일 기존 제품 id (없으면 새 제품, 이미 연결돼 있으면 그 제품) */
export async function approveItem(sb: Sb, itemId: string, link: string | null) {
  const { data: it, error } = await sb.from("partner_items").select("id, partner_id, data, product_id, partners(status, is_demo)").eq("id", itemId).single();
  if (error || !it) throw new Error("제품을 찾지 못했어요");
  const item = it.data as PartnerItem;
  const demo = it.partners?.is_demo === true;
  if (demo && link) throw new Error("테스트 업체 제품은 식약처 제품에 붙이지 않아요. 새 제품으로 반영해 주세요");
  const values = productValues(item, it.partners?.status === "active", demo);
  let productId: string | null = it.product_id || link;

  if (productId) {
    if (!it.product_id) {
      // 식약처 제품에 처음 붙일 때 — 바꾸기 전 값을 이력에 남긴다 (되돌릴 수 있게)
      const { data: prev } = await sb.from("products").select("*").eq("id", productId).single();
      if (prev) await sb.from("partner_item_versions").insert({ item_id: it.id, data: prev, changed: ["linked_product_before"] });
    }
    const { error: uErr } = await sb.from("products").update(values).eq("id", productId);
    if (uErr) throw new Error(`제품을 고치지 못했어요: ${uErr.message}`);
  } else {
    const { data: ins, error: iErr } = await sb.from("products").insert(values).select("id").single();
    if (iErr) throw new Error(`제품을 만들지 못했어요: ${iErr.message}`);
    productId = ins.id;
  }
  const { error: aErr } = await sb.from("partner_items").update({
    product_id: productId, status: "approved", approved_data: item, approved_at: new Date().toISOString(),
    review_reasons: [], reject_note: null, updated_at: new Date().toISOString(),
  }).eq("id", it.id);
  if (aErr) throw new Error(aErr.message);
  await applyOffers(sb, it.partner_id, it.id, productId, item);
  return productId;
}

/** 반려 — 이미 팔던 제품이면 반영된 값 그대로 두고 이번 변경만 돌려보낸다 */
export async function rejectItem(sb: Sb, itemId: string, note: string) {
  const { data: it, error } = await sb.from("partner_items").select("id, approved_data").eq("id", itemId).single();
  if (error || !it) throw new Error("제품을 찾지 못했어요");
  const values = it.approved_data
    ? { status: "approved", data: it.approved_data, review_reasons: [], reject_note: note }
    : { status: "rejected", review_reasons: [], reject_note: note };
  const { error: uErr } = await sb.from("partner_items").update({ ...values, updated_at: new Date().toISOString() }).eq("id", it.id);
  if (uErr) throw new Error(uErr.message);
}

/** 업체 상태가 바뀌면 그 업체 제품의 '살 수 있음'도 맞춘다 (운영 중일 때만 추천·식단 채우기에 나온다) */
export async function syncPartnerProducts(sb: Sb, partnerId: string) {
  const { data: pa } = await sb.from("partners").select("status, is_demo").eq("id", partnerId).single();
  const { data: items, error } = await sb.from("partner_items").select("product_id, approved_data, stock").eq("partner_id", partnerId).not("product_id", "is", null);
  if (error) throw new Error(error.message);
  for (const it of items || []) {
    if (!it.approved_data) continue;
    const { error: uErr } = await sb.from("products").update({ is_purchasable: pa?.status === "active" && !pa?.is_demo && onSale(it.approved_data) && (it.stock ?? 1) > 0, updated_at: new Date().toISOString() }).eq("id", it.product_id);
    if (uErr) throw new Error(uErr.message);
  }
}

/**
 * 피드는 '지금 파는 것 전부'다 — 지난번 피드에 있었는데 이번에 없는 제품은 판매 종료로 내린다.
 * 엑셀·API 로 올린 제품은 건드리지 않는다. 피드가 깨져 통째로 비는 일을 막으려고,
 * 팔던 제품이 10개 이상인데 절반 넘게 사라지면 내리지 않고 건수만 알린다(skipped).
 */
export async function retireMissing(sb: Sb, partner: Partner, present: Set<string>): Promise<{ retired: number; skipped: number }> {
  const data = await selectAll(() => sb.from("partner_items")
    .select("id, partner_sku, product_id, data, approved_data, status, ingest_batches(channel)")
    .eq("partner_id", partner.id).in("status", ["approved", "pending"]), "id");
  type Row = { id: string; partner_sku: string; product_id: string | null; data: PartnerItem; approved_data: PartnerItem | null; status: string; ingest_batches: { channel: string } | null };
  const fromFeed = ((data || []) as Row[]).filter((it) => it.ingest_batches?.channel === "feed");
  const missing = fromFeed.filter((it) => !present.has(it.partner_sku));
  if (missing.length === 0) return { retired: 0, skipped: 0 };
  if (fromFeed.length >= 10 && missing.length > fromFeed.length / 2) return { retired: 0, skipped: missing.length };
  const now = new Date().toISOString();
  for (const it of missing) {
    // 상태를 값에도 적어 둔다 — 다음 피드에 다시 나오면 '바뀐 것'으로 읽혀 되살아난다
    const gone = { ...(it.approved_data || it.data), status: "discontinued" as const };
    const { error: uErr } = await sb.from("partner_items").update({
      status: "discontinued", data: gone, approved_data: it.approved_data ? gone : null, review_reasons: [], updated_at: now,
    }).eq("id", it.id);
    if (uErr) throw new Error(uErr.message);
    if (it.approved_data) await applyOffers(sb, partner.id, it.id, it.product_id, gone);
  }
  return { retired: missing.length, skipped: 0 };
}

/**
 * 가격·재고·판매 상태만 고치기 (API PATCH …/offer, DELETE) — 검수 없이 바로.
 * 내용(영양·원재료)은 건드리지 않는다. 검수 중인 변경이 있어도 반영된 값과 대기 중인 값 양쪽에 같이 적는다.
 */
export async function patchOffer(sb: Sb, partner: Partner, sku: string,
  patch: { price?: number; list_price?: number; status?: PartnerItem["status"]; url?: string }): Promise<"applied" | "unchanged" | "not_found"> {
  const { data: it, error } = await sb.from("partner_items").select("id, product_id, data, approved_data, status").eq("partner_id", partner.id).eq("partner_sku", sku).maybeSingle();
  if (error) throw new Error(error.message);
  if (!it) return "not_found";
  const apply = (d: PartnerItem): PartnerItem => ({
    ...d,
    ...(patch.status ? { status: patch.status } : {}),
    ...(patch.list_price !== undefined ? { list_price: patch.list_price } : {}),
    offers: d.offers.map((o, i) => (i === 0 ? { ...o, ...(patch.price !== undefined ? { price: patch.price } : {}), ...(patch.url ? { url: patch.url } : {}) } : o)),
  });
  const data = apply(it.data);
  const approved = it.approved_data ? apply(it.approved_data) : null;
  if (anyChanged(it.data, data).length === 0) return "unchanged";
  const status = it.status === "pending" || it.status === "rejected" ? it.status
    : data.status === "discontinued" ? "discontinued" : approved ? "approved" : it.status;
  const { error: uErr } = await sb.from("partner_items").update({ data, approved_data: approved, status, updated_at: new Date().toISOString() }).eq("id", it.id);
  if (uErr) throw new Error(uErr.message);
  if (approved) await applyOffers(sb, partner.id, it.id, it.product_id, approved);
  return "applied";
}
