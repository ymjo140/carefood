import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId } from "@/lib/actor-server";

/**
 * GET /c/{발송 id} — 업체 광고(고객층 발송)를 누르면 거치는 길. 받은 사람이면 연 시각을 적고 제품으로 보낸다.
 * 받은 사람이 아니거나 제품이 없어도 오류 화면 대신 제품 목록으로 보낸다.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  const fallback = new URL("/products", req.url);
  if (!UUID.test(id)) return NextResponse.redirect(fallback);
  const sb = createServiceRoleClient() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data: c } = await sb.from("partner_campaigns").select("product_id").eq("id", id).maybeSingle();
  const actor = await getActorId();
  if (actor) {
    const { error } = await sb.from("campaign_recipients").update({ opened_at: new Date().toISOString() })
      .eq("campaign_id", id).eq("user_id", actor).eq("holdout", false).is("opened_at", null);
    if (error) console.error("광고 연 시각을 적지 못했어요:", error.message);
  }
  return NextResponse.redirect(c?.product_id ? new URL(`/products/${c.product_id}`, req.url) : fallback);
}
