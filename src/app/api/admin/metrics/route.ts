import { NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { adminOnly } from "@/lib/actor-server";

/**
 * GET /api/admin/metrics — 주간 지표 (최근 8주, 주는 월요일 시작 KST)
 *
 * 북극성: 그 주에 식단을 저장(또는 고침)하고, 구매 링크를 한 번 이상 누른 사람 수
 * 보조: 활동한 사람 · 식단 저장한 사람 · 구매 링크 누른 사람 · 기록한 사람과 1인당 기록 일수 · 다음 주에도 온 비율
 *       온보딩을 마친 사람(누적) · 구매 링크를 누른 자리(최근 4주)
 * 사람 = 기록 주인 id(서명 쿠키). 기기를 바꾸고 로그인하지 않으면 다른 사람으로 센다.
 */
const DAY = 864e5;
const KST = 9 * 3600e3;

function weekStart(ts: number) {
  const k = new Date(ts + KST);
  const dow = (k.getUTCDay() + 6) % 7; // 월=0
  return Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()) - dow * DAY - KST;
}

export async function GET() {
  await connection();
  const denied = await adminOnly();
  if (denied) return denied;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  const first = weekStart(Date.now()) - 7 * 7 * DAY;
  const since = new Date(first).toISOString();

  const page = async (table: string, cols: string, timeCol: string) => {
    const out: Record<string, string>[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from(table).select(cols).gte(timeCol, since).order(timeCol).range(from, from + 999);
      if (error) throw new Error(`${table}: ${error.message}`);
      out.push(...(data || []));
      if (!data || data.length < 1000 || out.length > 50000) break;
    }
    return out;
  };

  try {
    const [plans, clicks, diary, inter, profiles] = await Promise.all([
      page("saved_meal_plans", "user_id, updated_at", "updated_at"),
      page("product_clicks", "user_id, created_at, placement, platform", "created_at"),
      page("meal_diary", "user_id, date, created_at", "created_at"),
      page("user_interactions", "user_id, created_at", "created_at"),
      sb.from("user_profiles").select("user_id", { count: "exact", head: true }),
    ]);

    const weeks = Array.from({ length: 8 }, (_, i) => first + i * 7 * DAY);
    const idx = (iso: string) => { const w = weekStart(Date.parse(iso)); const i = weeks.indexOf(w); return i; };
    const sets = () => weeks.map(() => new Set<string>());
    const savers = sets(), clickers = sets(), active = sets(), diarists = sets();
    const diaryDays = weeks.map(() => new Map<string, Set<string>>());

    for (const r of plans) { const i = idx(r.updated_at); if (i >= 0 && r.user_id) { savers[i].add(r.user_id); active[i].add(r.user_id); } }
    for (const r of clicks) { const i = idx(r.created_at); if (i >= 0 && r.user_id) { clickers[i].add(r.user_id); active[i].add(r.user_id); } }
    for (const r of inter) { const i = idx(r.created_at); if (i >= 0 && r.user_id) active[i].add(r.user_id); }
    for (const r of diary) {
      const i = idx(r.created_at); if (i < 0 || !r.user_id) continue;
      diarists[i].add(r.user_id); active[i].add(r.user_id);
      const m = diaryDays[i]; if (!m.has(r.user_id)) m.set(r.user_id, new Set()); m.get(r.user_id)!.add(r.date);
    }

    const rows = weeks.map((w, i) => {
      const north = [...savers[i]].filter((u) => clickers[i].has(u)).length;
      const days = [...diaryDays[i].values()].map((s) => s.size);
      const next = active[i + 1];
      const kept = next ? [...active[i]].filter((u) => next.has(u)).length : null;
      return {
        week: new Date(w + KST).toISOString().slice(0, 10),
        north_star: north,
        active: active[i].size,
        plan_savers: savers[i].size,
        clickers: clickers[i].size,
        diarists: diarists[i].size,
        avg_diary_days: days.length ? Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10 : 0,
        retained_next_week: kept == null || active[i].size === 0 ? null : Math.round((kept / active[i].size) * 100),
      };
    });

    const recentFrom = Date.now() - 28 * DAY;
    const placements: Record<string, number> = {};
    for (const r of clicks) if (Date.parse(r.created_at) >= recentFrom) {
      const k = r.placement || "(기록 전)"; placements[k] = (placements[k] || 0) + 1;
    }

    return NextResponse.json({
      weeks: rows,
      onboarded_total: profiles.count ?? 0,
      placements: Object.entries(placements).sort((a, b) => b[1] - a[1]).map(([placement, clicks]) => ({ placement, clicks })),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
