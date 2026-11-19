/**
 * 챌린지 사진 인증 — 서버에서만 쓴다.
 *
 * 하루 인증 = 그날 글에 붙인 사진 한 장 (challenge_proofs). 판정 규칙:
 *  1. 참여 중이고, 그 날이 내 도전 기간 안이다.
 *  2. 늦은 인증은 없다 — 사진이 그날(한국 날짜) 안에 올라왔어야 한다.
 *     밤 12시 직전에 올린 사진은 12시 지나 10분 안에 글을 올려도 그날 것으로 친다(PROOF_GRACE_MS).
 *  3. 찍은 시각(EXIF)이 있으면 같은 날이어야 한다. 없으면 받되 '앨범에서 고름'으로 표시한다.
 *  4. 다른 날 인증한 사진과 같은 사진(dHash 거리 SAME_PHOTO 이하)은 안 된다.
 * 식단 기준(judgeDay)은 따로 본다 — 둘 다 채워야 해낸 날 (lib/challenges runProgress).
 * 사람끼리 비교하지 않는다: 남의 인증은 사진만 보이고 숫자·순위는 없다.
 */
import { addDays, kstDay } from "@/lib/day";
import { hamming, SAME_PHOTO } from "@/lib/photo-meta";
import { selectAllIn } from "@/lib/supabase/all";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export const PROOF_GRACE_MS = 10 * 60 * 1000;

export type UploadRow = { id: string; url: string; created_at: string; taken_at: string | null; phash: string | null };

export const PROOF_REASONS = {
  not_member: "참여 중인 챌린지가 아니에요",
  out_of_run: "도전 기간이 아닌 날이에요",
  late: "인증은 그날 밤 12시까지 올린 사진만 돼요",
  other_day: "다른 날 찍은 사진이에요",
  same_photo: "전에 인증한 사진과 같은 사진이에요",
  no_photo: "사진이 있어야 인증돼요",
  no_proof: "사진 인증이 없는 챌린지예요",
} as const;
export type ProofReason = keyof typeof PROOF_REASONS;

/** 한국 날짜 day 가 끝나는 순간(다음 날 0시, UTC ms) */
export function dayEndMs(day: string) {
  return Date.parse(`${addDays(day, 1)}T00:00:00+09:00`);
}

/** 이 사진이 day 의 인증이 될 수 있는지 (시각만 — 같은 사진 여부는 따로) */
export function photoFitsDay(u: Pick<UploadRow, "created_at" | "taken_at">, day: string, now: number): ProofReason | null {
  if (kstDay(u.created_at) !== day) return "late";
  const end = dayEndMs(day);
  if (now >= end + PROOF_GRACE_MS) return "late";
  if (u.taken_at && kstDay(u.taken_at) !== day) return "other_day";
  return null;
}

/** 글 올리는 지금, 인증 날짜로 받을 수 있는 날 — 오늘, 또는 0시 지나 10분 안이면 어제 */
export function proofDayNow(now: number): string[] {
  const today = kstDay(now);
  const yesterday = addDays(today, -1);
  return now < dayEndMs(yesterday) + PROOF_GRACE_MS ? [today, yesterday] : [today];
}

type Member = { challenge_id: string; started_on: string; group_id: string | null; challenge_groups?: { start_on: string } | null };
type Challenge = { id: string; title: string; days: number; is_active: boolean; proof: string | null };

/**
 * 글에 인증을 붙인다. 고른 챌린지마다 사진 하나(조건에 맞는 첫 장)를 쓴다.
 * 이미 그날 인증이 있어도 사진을 더 붙일 수 있다(같은 사진은 unique 로 한 번만).
 */
export async function attachProofs(sb: Sb, actor: string, post: { id: string; day: string; meal_type: string | null }, uploads: UploadRow[],
  challengeIds: string[], now = Date.now()) {
  const added: { challenge_id: string; title: string; album: boolean }[] = [];
  const skipped: { challenge_id: string; title: string; reason: string }[] = [];
  const ids = [...new Set(challengeIds)].slice(0, 5);
  if (!ids.length) return { added, skipped };

  const [cRes, mRes, pRes] = await Promise.all([
    sb.from("community_challenges").select("id, title, days, is_active, proof").in("id", ids),
    sb.from("community_challenge_members").select("challenge_id, started_on, group_id, challenge_groups(start_on)").eq("user_id", actor).in("challenge_id", ids),
    sb.from("challenge_proofs").select("day, phash").eq("user_id", actor).neq("day", post.day).order("created_at", { ascending: false }).limit(300),
  ]);
  for (const r of [cRes, mRes, pRes]) if (r.error) throw new Error(r.error.message);
  const challenges = new Map<string, Challenge>(((cRes.data || []) as Challenge[]).map((c) => [c.id, c]));
  const members = new Map<string, Member>(((mRes.data || []) as Member[]).map((m) => [m.challenge_id, m]));
  const usedHashes = ((pRes.data || []) as { phash: string | null }[]).map((r) => r.phash).filter((h): h is string => !!h);

  const dayOk = proofDayNow(now).includes(post.day);
  for (const cid of ids) {
    const c = challenges.get(cid);
    const title = c?.title || "챌린지";
    const skip = (reason: ProofReason) => skipped.push({ challenge_id: cid, title, reason: PROOF_REASONS[reason] });
    const m = members.get(cid);
    if (!c || !c.is_active || !m) { skip("not_member"); continue; }
    if (c.proof === "none") { skip("no_proof"); continue; }
    const from = m.challenge_groups?.start_on && m.challenge_groups.start_on < m.started_on ? m.challenge_groups.start_on : m.started_on;
    const ends = addDays(from, c.days - 1);
    if (post.day < m.started_on || post.day > ends) { skip("out_of_run"); continue; }
    if (!uploads.length) { skip("no_photo"); continue; }
    if (!dayOk) { skip("late"); continue; }
    let pick: UploadRow | null = null;
    let why: ProofReason = "late";
    for (const u of uploads) {
      const r = photoFitsDay(u, post.day, now);
      if (r) { why = r; continue; }
      if (u.phash && usedHashes.some((h) => hamming(h, u.phash!) <= SAME_PHOTO)) { why = "same_photo"; continue; }
      pick = u; break;
    }
    if (!pick) { skip(why); continue; }
    const { error } = await sb.from("challenge_proofs").insert({
      challenge_id: cid, user_id: actor, day: post.day, meal_type: post.meal_type, post_id: post.id, upload_id: pick.id, phash: pick.phash,
    });
    if (error && !/duplicate key|unique/i.test(error.message)) throw new Error(error.message);
    added.push({ challenge_id: cid, title, album: !pick.taken_at });
  }
  return { added, skipped };
}

/** 사람·챌린지별 인증한 날 — key `${challenge_id}:${user_id}` */
export async function proofDays(sb: Sb, challengeIds: string[], users: string[], from: string, to: string) {
  const out = new Map<string, Set<string>>();
  if (!challengeIds.length || !users.length) return out;
  const rows = await selectAllIn(users, 200, (p) => sb.from("challenge_proofs").select("challenge_id, user_id, day")
    .in("challenge_id", challengeIds).in("user_id", p).eq("status", "ok").gte("day", from).lte("day", to), "id", 100_000);
  for (const r of rows as { challenge_id: string; user_id: string; day: string }[]) {
    const k = `${r.challenge_id}:${r.user_id}`;
    if (!out.has(k)) out.set(k, new Set());
    out.get(k)!.add(r.day);
  }
  return out;
}

export const proofKey = (challengeId: string, user: string) => `${challengeId}:${user}`;
