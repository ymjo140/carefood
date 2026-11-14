/**
 * 재고 — 업체가 제품마다 남은 수량을 적어 두면(선택) 앱 주문 때 줄고 취소되면 돌아온다 (v3 10.3). 서버 전용.
 * 빼기·돌려놓기는 DB 함수 하나에서 줄을 잠그고 한다 (partner_stock_take / put). 0 이 되거나 0 에서 늘면
 * partner_refresh_availability(p_item) 으로 '살 수 있음'을 다시 맞춘다 — 추천·식단 채우기·주문이 같은 값을 본다.
 */
type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export type StockLine = { partner_id: string; sku: string; qty: number; name?: string };
export const LOW_STOCK = 5;

/** 같은 제품 줄을 합친다 */
function merge(lines: StockLine[]) {
  const by = new Map<string, StockLine>();
  for (const l of lines) {
    if (!l.sku || l.qty <= 0) continue;
    const k = `${l.partner_id}:${l.sku}`;
    const m = by.get(k);
    if (m) m.qty += l.qty; else by.set(k, { ...l });
  }
  return [...by.values()];
}

async function refresh(sb: Sb, partnerId: string, sku: string) {
  const { data, error } = await sb.from("partner_items").select("id").eq("partner_id", partnerId).eq("partner_sku", sku).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return;
  const { error: rErr } = await sb.rpc("partner_refresh_availability", { p_item: data.id });
  if (rErr) throw new Error(rErr.message);
}

/** 재고를 뺀다 — 하나라도 모자라면 이미 뺀 것을 돌려놓고 모자란 제품 이름을 돌려준다 */
export async function takeStock(sb: Sb, lines: StockLine[]): Promise<{ ok: true; taken: StockLine[] } | { ok: false; short: string[] }> {
  const taken: StockLine[] = [];
  const short: string[] = [];
  for (const l of merge(lines)) {
    const { data, error } = await sb.rpc("partner_stock_take", { p_partner: l.partner_id, p_sku: l.sku, p_qty: l.qty });
    if (error) { await putStock(sb, taken); throw new Error(error.message); }
    if (data === -1) { short.push(l.name || l.sku); continue; }
    if (data !== null) { taken.push(l); if (data === 0) await refresh(sb, l.partner_id, l.sku); }
  }
  if (short.length) { await putStock(sb, taken); return { ok: false, short }; }
  return { ok: true, taken };
}

/** 재고를 돌려놓는다 (취소 · 주문을 만들지 못했을 때). 세지 않는 제품은 그대로 */
export async function putStock(sb: Sb, lines: StockLine[]) {
  for (const l of merge(lines)) {
    const { data, error } = await sb.rpc("partner_stock_put", { p_partner: l.partner_id, p_sku: l.sku, p_qty: l.qty });
    if (error) throw new Error(error.message);
    if (data !== null && data === l.qty) await refresh(sb, l.partner_id, l.sku); // 0 에서 다시 생겼다
  }
}

/** 방금 취소로 바뀐 주문 줄 → 재고 돌려놓기 */
export async function putBackRows(sb: Sb, rows: { partner_id: string | null; partner_sku: string | null; quantity: number | null }[]) {
  await putStock(sb, rows.filter((r) => r.partner_id && r.partner_sku).map((r) => ({ partner_id: r.partner_id!, sku: r.partner_sku!, qty: r.quantity || 1 })));
}

/** 업체가 재고를 적는다 — null 이면 세지 않음 */
export async function setStock(sb: Sb, partnerId: string, itemId: string, stock: number | null) {
  const { data, error } = await sb.from("partner_items").update({ stock, stock_updated_at: new Date().toISOString() }).eq("id", itemId).eq("partner_id", partnerId).select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) return false;
  const { error: rErr } = await sb.rpc("partner_refresh_availability", { p_item: itemId });
  if (rErr) throw new Error(rErr.message);
  return true;
}
