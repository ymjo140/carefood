/** 정보 오류 신고 — 알림함 (서버 전용, 서비스 키). 관리자가 '고침'으로 바꾸면 30일 동안 신고한 사람 알림함에 뜬다 */
type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const DAY = 86_400_000;

export type ReportNotification = { id: string; type: "report_fixed"; at: string; who: string; text: string; url: string };

export async function reportNotifications(sb: Sb, actor: string): Promise<ReportNotification[]> {
  const { data, error } = await sb.from("product_reports")
    .select("id, product_id, resolved_at, products(name)")
    .eq("reporter_id", actor).eq("status", "fixed").gte("resolved_at", new Date(Date.now() - 30 * DAY).toISOString())
    .order("resolved_at", { ascending: false }).limit(20);
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return [];
    throw new Error(error.message);
  }
  return ((data || []) as { id: string; product_id: string; resolved_at: string; products: { name: string } | null }[]).map((r) => ({
    id: `report-${r.id}`, type: "report_fixed", at: r.resolved_at, who: "오늘끼록", text: r.products?.name || "제품", url: `/products/${r.product_id}`,
  }));
}
