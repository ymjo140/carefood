import type { Metadata } from "next";
import { Suspense } from "react";
import { PageLoading } from "@/components/ui";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { CODE_RE } from "@/lib/challenge-groups";
import InviteView from "./InviteView";

// 동적 라우트 — 초대마다 다름
export const instant = false;

/** 링크 미리보기(카톡·DM) — 챌린지 이름과 연 사람의 인증 카드 그림 */
export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  if (!CODE_RE.test(code)) return { title: "초대 링크" };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  const { data: g } = await sb.from("challenge_groups").select("id, host_id, community_challenges(title)").eq("code", code).maybeSingle();
  if (!g) return { title: "초대 링크" };
  const [{ data: p }, { data: card }] = await Promise.all([
    sb.from("community_profiles").select("nickname").eq("actor_id", g.host_id).maybeSingle(),
    sb.from("share_links").select("card_url").eq("group_id", g.id).eq("owner", g.host_id).is("revoked_at", null).not("card_url", "is", null).order("created_at", { ascending: false }).limit(1),
  ]);
  const title = `${p?.nickname ? `${p.nickname}님과 ` : ""}${g.community_challenges?.title || "챌린지"} 같이 하기`;
  const image = card?.[0]?.card_url as string | undefined;
  return {
    title,
    description: "오늘끼록에서 식단을 기록하면 하루씩 채워져요. 가입 없이 바로 시작할 수 있어요",
    openGraph: { title: `${title} | 오늘끼록`, description: "식단을 기록하면 하루씩 채워져요", images: image ? [{ url: image, width: 1080, height: 1920 }] : undefined },
  };
}

export default async function InvitePage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <InviteView />
    </Suspense>
  );
}
