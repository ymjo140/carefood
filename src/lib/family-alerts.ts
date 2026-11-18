/**
 * 가족 알림 — /api/push/run 이 30분마다 부른다 (서버 전용).
 *  - 약 먹을 시간: 내가 정한 시각부터 1시간 안에, 오늘 아직 체크하지 않았으면 나에게 한 번 ("아침 약 먹을 시간이에요"). 복용 안내는 하지 않는다.
 *  - 가족 저녁 확인: 보는 사람이 켰고(alert_evening) 끼니 기록 여부를 보여 주기로 했으면, 저녁 8시대에 확인받는 사람의 오늘 기록이 없을 때
 *    보는 사람에게만 한 번. 확인받는 사람에게 재촉 알림은 보내지 않는다(재촉은 보는 사람이 직접 누르는 '콕 찌르기'뿐).
 *  - 가족 약 체크(보는 사람에게): 가족이 정한 약 시각에서 1시간이 지나도 체크가 없으면 한 번 (alert_meds · share_meds).
 */
import type { PushPayload } from "@/lib/push";
import { selectAllIn } from "@/lib/supabase/all";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
export type FamilyAlert = { user: string; key: string; payload: PushPayload };
export const FAMILY_EVENING_HOUR = 20;

/** 지금 한국 시각(분) */
export const kstMinutes = (now = Date.now()) => { const d = new Date(now + 9 * 3600e3); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export function planMedAlerts(items: { id: string; user_id: string; label: string; remind_at: string | null }[], checked: Set<string>, today: string, nowMin: number): FamilyAlert[] {
  return items.filter((i) => i.remind_at && !checked.has(i.id) && nowMin >= toMin(i.remind_at) && nowMin < toMin(i.remind_at) + 60)
    .map((i) => ({ user: i.user_id, key: `med:${i.id}:${today}`, payload: { title: `${i.label} 먹을 시간이에요`, body: "먹었으면 가족 화면에서 체크해 주세요", url: "/family", tag: "med" } }));
}

/** 보는 사람에게: 가족이 정한 약 시각에서 1시간이 지나도 체크가 없으면 한 번 (1~2시간 사이, 30분마다 도는 예약 작업이 한 번은 걸린다)
 *  약 체크를 보여 주기로 했고(share_meds) 보는 사람이 켠(alert_meds) 연결만. 이름·시각만 — 복용 안내는 하지 않는다 */
export function planViewerMedAlerts(
  links: { id: string; viewer_id: string; owner_id: string; label: string }[],
  items: { id: string; user_id: string; label: string; remind_at: string | null }[],
  checked: Set<string>, today: string, nowMin: number,
): FamilyAlert[] {
  const late = items.filter((i) => i.remind_at && !checked.has(i.id) && nowMin >= toMin(i.remind_at) + 60 && nowMin < toMin(i.remind_at) + 120);
  const out: FamilyAlert[] = [];
  for (const l of links) for (const i of late.filter((x) => x.user_id === l.owner_id)) {
    out.push({ user: l.viewer_id, key: `fammed:${l.id}:${i.id}:${today}`, payload: { title: "가족 약 체크", body: `${l.label} · ${i.label} 체크가 아직이에요`, url: `/diary?who=${l.id}`, tag: "family" } });
  }
  return out;
}

export async function loadFamilyAlerts(sb: Sb, today: string, hour: number, nowMin = kstMinutes()): Promise<FamilyAlert[]> {
  const out: FamilyAlert[] = [];
  const { data: items, error } = await sb.from("med_checks").select("id, user_id, label, remind_at").eq("is_active", true).not("remind_at", "is", null).limit(10000);
  if (error) throw new Error(error.message);
  const due = ((items || []) as { id: string; user_id: string; label: string; remind_at: string }[])
    .filter((i) => nowMin >= toMin(i.remind_at) && nowMin < toMin(i.remind_at) + 60);
  if (due.length) {
    const logs = await selectAllIn<{ item_id: string }>(due.map((i) => i.id), 200, (p) => sb.from("med_check_log").select("item_id").in("item_id", p).eq("day", today), "item_id");
    out.push(...planMedAlerts(due, new Set(logs.map((l) => l.item_id)), today, nowMin));
  }
  // 보는 사람에게도 — 약 시각에서 1~2시간 사이, 아직 체크 전
  const lateItems = ((items || []) as { id: string; user_id: string; label: string; remind_at: string }[])
    .filter((i) => nowMin >= toMin(i.remind_at) + 60 && nowMin < toMin(i.remind_at) + 120);
  if (lateItems.length) {
    const owners = [...new Set(lateItems.map((i) => i.user_id))];
    const ls = await selectAllIn<{ id: string; viewer_id: string; owner_id: string; label: string }>(owners, 200,
      (p) => sb.from("family_links").select("id, viewer_id, owner_id, label").in("owner_id", p).eq("status", "active").eq("share_meds", true).eq("alert_meds", true), "id");
    if (ls.length) {
      const logs = await selectAllIn<{ item_id: string }>(lateItems.map((i) => i.id), 200, (p) => sb.from("med_check_log").select("item_id").in("item_id", p).eq("day", today), "item_id");
      out.push(...planViewerMedAlerts(ls, lateItems, new Set(logs.map((l) => l.item_id)), today, nowMin));
    }
  }
  if (hour === FAMILY_EVENING_HOUR) {
    const { data: links, error: lErr } = await sb.from("family_links").select("id, viewer_id, owner_id, label").eq("status", "active")
      .eq("alert_evening", true).eq("share_meals", true).limit(10000);
    if (lErr) throw new Error(lErr.message);
    const ls = (links || []) as { id: string; viewer_id: string; owner_id: string; label: string }[];
    if (ls.length) {
      const owners = [...new Set(ls.map((l) => l.owner_id))];
      const rows = await selectAllIn<{ user_id: string }>(owners, 200, (p) => sb.from("meal_diary").select("user_id").in("user_id", p).eq("date", today), "id", 1_000_000);
      const recorded = new Set(rows.map((r) => r.user_id));
      for (const l of ls) {
        if (recorded.has(l.owner_id)) continue;
        out.push({ user: l.viewer_id, key: `fam:${l.id}:${today}`, payload: { title: "가족 기록", body: `${l.label} · 오늘 아직 기록이 없어요. 안부를 남겨 볼까요?`, url: `/diary?who=${l.id}`, tag: "family" } });
      }
    }
  }
  return out;
}
