import { NextRequest, NextResponse } from "next/server";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAdminUser } from "@/lib/actor-server";
import { pushReady, sendToUser, type PushPayload, type PushSub } from "@/lib/push";
import { addDays, daysBetween, kstHour, mondayOf, todayKst, weekday } from "@/lib/day";
import { buildNotifications } from "@/lib/notifications";

/**
 * POST /api/push/run — 보낼 때가 된 알림을 보낸다. Supabase 예약 작업(pg_cron + pg_net, 30분마다)이 부른다.
 *   GitHub Actions 예약은 실제로 4~6시간 간격으로만 돌아 끼니 알림에 쓸 수 없었다 (2026-11-11 확인) — 수동 실행용으로만 남긴다.
 * 누가 부를 수 있나: x-cron-secret 헤더가 Supabase Vault 의 push_cron_secret 과 같을 때(예약 작업 — 비밀값은 DB 밖으로 나오지 않고
 *   cron_secret_ok() 로 맞는지만 묻는다) ·
 *   GitHub OIDC 토큰(이 저장소 main 의 push-reminders.yml) · 관리자(?dry=1 은 보내지 않고 세기만).
 *
 * 언제 무엇을 (한국 시간, 밤 10시~아침 8시는 보내지 않음 · 같은 알림은 push_log 로 한 번만)
 *   - 점심 13~15시: 오늘 점심 기록이 없으면 · 저녁 20~22시: 오늘 저녁 기록이 없으면
 *     최근 14일 기록이 없는 사람은 저녁 알림만, 일주일에 한 번
 *   - 챌린지 20~22시: 하고 있는 챌린지가 있는데 오늘 기록이 하나도 없으면 (그날 저녁 알림 대신)
 *   - 주간 요약 월요일 9~12시: 지난주(월~일)에 하루라도 기록했으면 기록한 날 수 · 하루 평균
 *   - 커뮤니티 8~22시: 내 글 답글 · 내 답글의 답글 · 새 팔로워 (좋아요는 보내지 않음), 여러 개면 묶어서
 */
const JWKS = createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));
const REPO = "ymjo140/carefood";

async function authorized(req: NextRequest): Promise<boolean> {
  const cron = req.headers.get("x-cron-secret") || "";
  if (/^[0-9a-f]{64}$/.test(cron)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (createServiceRoleClient() as any).rpc("cron_secret_ok", { p: cron });
    if (error) console.error("예약 작업 비밀값을 확인하지 못했어요:", error.message);
    return data === true;
  }
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (token) {
    try {
      const { payload } = await jwtVerify(token, JWKS, { issuer: "https://token.actions.githubusercontent.com", audience: "carefood-push" });
      return payload.repository === REPO && payload.ref === "refs/heads/main" && String(payload.workflow_ref || "").startsWith(`${REPO}/.github/workflows/push-reminders.yml@`);
    } catch { return false; } // ds-allow: 토큰이 맞지 않으면 거절만 한다
  }
  return !!(await getAdminUser());
}

type Prefs = { user_id: string; meals: boolean; weekly: boolean; community: boolean; challenge: boolean; community_pushed_at: string | null };
type Diary = { user_id: string; date: string; meal_type: string | null; calories: number | null; protein_g: number | null; sodium_mg: number | null };

export async function POST(req: NextRequest) {
  if (!(await authorized(req))) return NextResponse.json({ error: "권한이 없어요" }, { status: 403 });
  if (!pushReady()) return NextResponse.json({ sent: 0, skipped: "VAPID 키가 아직 없어요" });
  const dry = req.nextUrl.searchParams.get("dry") === "1";
  const hourParam = Number(req.nextUrl.searchParams.get("hour"));
  const hour = dry && Number.isInteger(hourParam) && hourParam >= 0 && hourParam < 24 ? hourParam : kstHour(); // 관리자 dry 로 시간대를 바꿔 볼 수 있다
  if (hour < 8 || hour >= 22) return NextResponse.json({ sent: 0, skipped: "밤 시간" });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  const today = todayKst();
  const { data: subRows, error: sErr } = await sb.from("push_subscriptions").select("endpoint, user_id, p256dh, auth").limit(5000);
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });
  const subsBy = new Map<string, PushSub[]>();
  for (const s of (subRows || []) as PushSub[]) subsBy.set(s.user_id, [...(subsBy.get(s.user_id) || []), s]);
  const users = [...subsBy.keys()];
  if (!users.length) return NextResponse.json({ sent: 0, users: 0 });

  const lastMonday = addDays(mondayOf(today), -7);
  const [pRes, dRes, lRes, mRes] = await Promise.all([
    sb.from("notification_prefs").select("user_id, meals, weekly, community, challenge, community_pushed_at").in("user_id", users),
    sb.from("meal_diary").select("user_id, date, meal_type, calories, protein_g, sodium_mg").in("user_id", users).gte("date", addDays(today, -14)).lte("date", today).limit(20000),
    sb.from("push_log").select("user_id, kind, key").in("user_id", users).gte("sent_at", new Date(Date.now() - 8 * 86400e3).toISOString()).limit(20000),
    sb.from("community_challenge_members").select("user_id, started_on, community_challenges(title, days, is_active)").in("user_id", users),
  ]);
  for (const r of [pRes, dRes, lRes, mRes]) if (r.error) return NextResponse.json({ error: r.error.message }, { status: 500 });
  const prefsBy = new Map<string, Prefs>(((pRes.data || []) as Prefs[]).map((p) => [p.user_id, p]));
  const diaryBy = new Map<string, Diary[]>();
  for (const d of (dRes.data || []) as Diary[]) diaryBy.set(d.user_id, [...(diaryBy.get(d.user_id) || []), d]);
  const logged = new Set(((lRes.data || []) as { user_id: string; kind: string; key: string }[]).map((l) => `${l.user_id}|${l.kind}|${l.key}`));
  type Member = { user_id: string; started_on: string; community_challenges: { title: string; days: number; is_active: boolean } | null };
  const runsBy = new Map<string, { title: string; day: number }[]>();
  for (const m of (mRes.data || []) as Member[]) {
    const c = m.community_challenges;
    if (!c?.is_active) continue;
    const ends = addDays(m.started_on, c.days - 1);
    if (m.started_on <= today && today <= ends) {
      const day = daysBetween(m.started_on, today) + 1;
      runsBy.set(m.user_id, [...(runsBy.get(m.user_id) || []), { title: c.title, day }]);
    }
  }

  const counts: Record<string, number> = { meal: 0, challenge: 0, weekly: 0, community: 0 };
  const send = async (user: string, kind: string, key: string, payload: PushPayload) => {
    if (logged.has(`${user}|${kind}|${key}`)) return false;
    if (dry) { counts[kind] += 1; return true; }
    // 먼저 적어서 두 번 실행돼도 한 번만 간다
    const { error } = await sb.from("push_log").insert({ user_id: user, kind, key });
    if (error) return false;
    logged.add(`${user}|${kind}|${key}`);
    const ok = await sendToUser(sb, subsBy.get(user) || [], payload);
    if (ok) counts[kind] += 1;
    return ok;
  };

  const slot = hour >= 13 && hour < 15 ? "lunch" : hour >= 20 && hour < 22 ? "dinner" : null;
  const isWeekly = weekday(today) === 1 && hour >= 9 && hour < 12;

  for (const user of users) {
    const prefs = prefsBy.get(user) || { user_id: user, meals: true, weekly: true, community: true, challenge: true, community_pushed_at: null };
    const rows = diaryBy.get(user) || [];
    const todayRows = rows.filter((r) => r.date === today);

    // ── 챌린지 · 끼니 ──
    if (slot === "dinner" && prefs.challenge && todayRows.length === 0 && runsBy.get(user)?.length) {
      const run = runsBy.get(user)![0];
      if (await send(user, "challenge", today, { title: run.title, body: `${run.day}일째예요. 오늘 기록이 아직 없어요. 한 끼만 적어도 오늘을 채울 수 있어요`, url: "/community/challenges", tag: "challenge" })) {
        logged.add(`${user}|meal|${today}:dinner`); // 같은 저녁에 끼니 알림까지 보내지 않는다
      }
    }
    if (slot && prefs.meals && !todayRows.some((r) => r.meal_type === slot)) {
      const recent = rows.length > 0;
      if (recent) {
        await send(user, "meal", `${today}:${slot}`, slot === "lunch"
          ? { title: "점심 기록", body: "점심 아직 안 적었어요. 먹은 것 하나만 남겨 볼까요?", url: "/diary", tag: "meal" }
          : { title: "저녁 기록", body: "오늘 저녁은 뭐 먹었어요? 적으면 오늘 합계를 바로 볼 수 있어요", url: "/diary", tag: "meal" });
      } else if (slot === "dinner") {
        // 2주 넘게 기록이 없으면 일주일에 한 번만
        await send(user, "meal", `idle:${mondayOf(today)}`, { title: "케어푸드", body: "이번 주는 한 끼부터 다시 적어 볼까요? 기록하면 영양 합계를 바로 보여 드려요", url: "/diary", tag: "meal" });
      }
    }

    // ── 주간 요약 ──
    if (isWeekly && prefs.weekly) {
      const week = rows.filter((r) => r.date >= lastMonday && r.date < mondayOf(today));
      const days = new Set(week.map((r) => r.date)).size;
      if (days > 0) {
        const avg = (f: keyof Diary) => Math.round(week.reduce((s, r) => s + (Number(r[f]) || 0), 0) / days);
        await send(user, "weekly", lastMonday, {
          title: "지난주 식단 요약",
          body: `${days}일 기록 · 하루 평균 ${avg("calories").toLocaleString("ko-KR")}kcal · 나트륨 ${avg("sodium_mg").toLocaleString("ko-KR")}mg · 단백질 ${avg("protein_g")}g`,
          url: "/diary/report", tag: "weekly",
        });
      }
    }

    // ── 커뮤니티 소식 ──
    if (prefs.community) {
      let items;
      try { items = await buildNotifications(sb, user); } catch { continue; } // ds-allow: 한 사람 소식을 못 만들어도 다른 사람은 보낸다
      const since = Math.max(prefs.community_pushed_at ? Date.parse(prefs.community_pushed_at) : 0, Date.now() - 86400e3);
      const fresh = items.filter((i) => i.type !== "like" && Date.parse(i.at) > since);
      if (fresh.length) {
        const top = fresh[0];
        const line = top.type === "comment" ? `${top.who} 님이 내 글에 답글을 남겼어요`
          : top.type === "reply" ? `${top.who} 님이 내 답글에 답글을 남겼어요` : `${top.who} 님이 나를 팔로우했어요`;
        const payload: PushPayload = fresh.length === 1
          ? { title: "새 소식", body: top.text ? `${line}: “${top.text}”` : line, url: top.post_id ? `/community/${top.post_id}` : top.user_id ? `/community/u/${encodeURIComponent(top.user_id)}` : "/notifications", tag: "community" }
          : { title: `새 소식 ${fresh.length}개`, body: `${line} 외 ${fresh.length - 1}개`, url: "/notifications", tag: "community" };
        const ok = await send(user, "community", top.at, payload);
        if (ok && !dry) await sb.from("notification_prefs").upsert({ user_id: user, community_pushed_at: top.at }, { onConflict: "user_id" });
      }
    }
  }

  return NextResponse.json({ dry, hour, users: users.length, sent: counts });
}
