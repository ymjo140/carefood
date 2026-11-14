import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId } from "@/lib/actor-server";
import { CODE_RE } from "@/lib/challenge-groups";
import { REF_COOKIE, REF_MAX_AGE, isBot, shareEvent } from "@/lib/share-links";

/**
 * GET /s/<code> — 인증 카드 공유 링크. 사람은 열람을 적고 대상(글·초대·공구)으로 보낸다.
 * 링크 미리보기 로봇에게는 카드 그림을 og:image 로 담은 작은 페이지를 준다(카톡·DM 미리보기).
 * 들어온 길은 7일간 쿠키에 남겨 같이 하기·첫 기록을 그 링크에 달아 준다.
 */
const KIND_TITLE: Record<string, string> = { meal: "식단 인증", day: "하루 식단 인증", streak: "기록 인증", challenge: "챌린지 같이 하기", group_buy: "공구 같이 모아요", month: "한 달 기록" };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const home = new URL("/community", request.url);
  if (!CODE_RE.test(code)) return NextResponse.redirect(home);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  const { data: link, error } = await sb.from("share_links").select("owner, kind, target_url, card_url, revoked_at").eq("code", code).maybeSingle();
  if (error) console.error("공유 링크를 읽지 못했어요:", error.message);
  if (!link || link.revoked_at || !/^\/[A-Za-z0-9/_?=&.-]*$/.test(link.target_url)) return NextResponse.redirect(home);
  const target = new URL(link.target_url, request.url);

  if (isBot(request.headers.get("user-agent"))) {
    const { data: p } = await sb.from("community_profiles").select("nickname").eq("actor_id", link.owner).maybeSingle();
    const title = `${p?.nickname ? `${p.nickname}님의 ` : ""}${KIND_TITLE[link.kind] || "케어푸드"} · 케어푸드`;
    const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(title)}</title>
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="케어푸드에서 식단을 기록하고 같이 챌린지를 해요">
<meta property="og:url" content="${esc(target.toString())}"><meta property="og:type" content="website">
${link.card_url ? `<meta property="og:image" content="${esc(link.card_url)}"><meta property="og:image:width" content="1080"><meta property="og:image:height" content="1920"><meta name="twitter:card" content="summary_large_image">` : ""}
<meta http-equiv="refresh" content="0;url=${esc(target.toString())}"></head><body><a href="${esc(target.toString())}">${esc(title)}</a></body></html>`;
    return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" } });
  }

  const actor = await getActorId();
  if (actor) {
    try { await shareEvent(sb, code, actor, "visit"); }
    catch (e) { console.error("공유 링크 열람을 적지 못했어요:", (e as Error).message); } // ds-allow: 세기는 보조 — 사람은 그대로 보낸다
  }
  const res = NextResponse.redirect(target);
  res.cookies.set(REF_COOKIE, code, { maxAge: REF_MAX_AGE, httpOnly: true, sameSite: "lax", secure: true, path: "/" });
  return res;
}
