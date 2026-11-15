/**
 * 영양제 챙기기 서버 쪽 — 오늘 먹었는지와 같이 불러오기, 먹은 것으로 체크하기. 규칙은 lib/supplements.ts.
 */
import type { Supp, Timing } from "@/lib/supplements";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function loadSupps(sb: Sb, actor: string, today: string): Promise<Supp[]> {
  const [sRes, lRes] = await Promise.all([
    sb.from("supplements").select("id, name, timing, created_at").eq("user_id", actor).order("created_at", { ascending: true }).limit(50),
    sb.from("supplement_logs").select("supplement_id").eq("user_id", actor).eq("date", today).limit(100),
  ]);
  if (sRes.error) throw new Error(sRes.error.message);
  if (lRes.error) throw new Error(lRes.error.message);
  const taken = new Set(((lRes.data || []) as { supplement_id: string }[]).map((l) => l.supplement_id));
  return ((sRes.data || []) as { id: string; name: string; timing: Timing }[]).map((s) => ({ id: s.id, name: s.name, timing: s.timing, taken: taken.has(s.id) }));
}

/** 오늘 먹은 것으로 체크 — 이미 체크했으면 그대로 (unique(user_id, supplement_id, date)) */
export async function markTaken(sb: Sb, actor: string, today: string, ids: string[]) {
  if (!ids.length) return;
  const { error } = await sb.from("supplement_logs").upsert(ids.map((id) => ({ user_id: actor, supplement_id: id, date: today })),
    { onConflict: "user_id,supplement_id,date", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
}
