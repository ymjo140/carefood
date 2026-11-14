/**
 * 공유 링크 — 서버에서만 쓴다. 인증 카드를 공유할 때마다 짧은 링크(/s/<code>)를 하나 만들고,
 * 누가 열었는지(익명 아이디 기준, 하루 한 번)와 그 뒤 같이 하기를 했는지를 센다. 사람 수만 보여 준다.
 * 링크로 들어온 길은 7일간 쿠키(cf_ref)에 남겨 두고, 같이 하기를 누르면 그 링크에 달아 준다.
 */
import { cookies } from "next/headers";
import { addDays, todayKst } from "@/lib/day";
import { CODE_RE } from "@/lib/challenge-groups";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export const REF_COOKIE = "cf_ref";
export const REF_MAX_AGE = 7 * 86400;
export const SHARE_BUCKET = "share-cards";

/** 링크 미리보기 로봇(카톡·인스타·페이스북 등)은 열람으로 세지 않는다 */
export function isBot(ua: string | null) {
  return !ua || /bot|crawler|spider|preview|facebookexternalhit|kakaotalk-scrap|slack|discord|whatsapp|telegram|headless/i.test(ua);
}

/** 쿠키에 남은 공유 링크 코드 (형식이 맞을 때만) */
export async function refCode() {
  const v = (await cookies()).get(REF_COOKIE)?.value || "";
  return CODE_RE.test(v) ? v : null;
}

/** 공유 링크 사건 적기 — 같은 사람·같은 날·같은 종류는 한 번만. 링크 주인 자신은 세지 않는다 */
export async function shareEvent(sb: Sb, code: string, visitor: string, type: "visit" | "join" | "first_record" | "gb_mark") {
  const { data: link, error } = await sb.from("share_links").select("owner, revoked_at").eq("code", code).maybeSingle();
  if (error) throw new Error(error.message);
  if (!link || link.revoked_at || link.owner === visitor) return false;
  const { error: e2 } = await sb.from("share_events").upsert({ code, visitor, type, day: todayKst() }, { onConflict: "code,visitor,type,day", ignoreDuplicates: true });
  if (e2) throw new Error(e2.message);
  return true;
}

/**
 * 하루 기록 카드의 링크 — 지금 하고 있는 챌린지가 있으면 그 묶음 초대(가장 최근), 없으면 첫 화면.
 * 하루 기록 자체는 공개 화면이 없다(내 식단은 나만 본다).
 */
export async function dayTarget(sb: Sb, actor: string): Promise<{ target_url: string; group_id: string | null }> {
  const today = todayKst();
  const { data, error } = await sb.from("community_challenge_members").select("group_id, joined_at, challenge_groups(code, start_on), community_challenges(days)")
    .eq("user_id", actor).not("group_id", "is", null).order("joined_at", { ascending: false }).limit(10);
  if (error) throw new Error(error.message);
  for (const m of (data || []) as { group_id: string; challenge_groups: { code: string; start_on: string } | null; community_challenges: { days: number } | null }[]) {
    const g = m.challenge_groups;
    if (g && addDays(g.start_on, (m.community_challenges?.days || 7) - 1) >= today) return { target_url: `/j/${g.code}`, group_id: m.group_id };
  }
  return { target_url: "/", group_id: null };
}
