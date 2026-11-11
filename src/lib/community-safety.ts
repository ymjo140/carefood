/**
 * 커뮤니티 안전 — 서버에서만 쓴다.
 * - 보는 사람이 차단한 사람의 글·답글, 숨긴 글은 그 사람에게 보이지 않는다
 * - 로그인한 사람의 신고가 REPORT_HIDE_AT 건 모이면 관리자가 볼 때까지 모두에게서 가린다 (글쓴이 본인에겐 보임)
 */
export const REPORT_HIDE_AT = 3;

export const REPORT_REASONS = {
  spam: "스팸·도배",
  ad: "광고·홍보",
  abuse: "욕설·비방",
  medical: "근거 없는 의료·효능 주장",
  privacy: "개인정보 노출",
  other: "기타",
} as const;
export type ReportReason = keyof typeof REPORT_REASONS;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function viewerFilters(sb: any, viewer: string | null) {
  if (!viewer) return { blocked: new Set<string>(), hidden: new Set<string>() };
  const [b, h] = await Promise.all([
    sb.from("community_blocks").select("blocked_id").eq("blocker_id", viewer),
    sb.from("community_hidden_posts").select("post_id").eq("user_id", viewer),
  ]);
  if (b.error) throw new Error(b.error.message);
  if (h.error) throw new Error(h.error.message);
  return {
    blocked: new Set<string>((b.data || []).map((r: { blocked_id: string }) => r.blocked_id)),
    hidden: new Set<string>((h.data || []).map((r: { post_id: string }) => r.post_id)),
  };
}
