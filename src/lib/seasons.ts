/**
 * 큰 시즌 — 운영이 여는 기간 챌린지 묶음. 서버·화면 공통 (DB 쓰기는 ensureSeasons 만).
 *  - 월간: 매달 첫 월요일부터 4주. 새해: 1월 첫 월요일부터 8주 (2월은 새해 시즌이 덮어 월간 시즌이 없다).
 *  - 첫 시즌은 2026년 12월.
 *  - 시즌마다 이달의 주제 챌린지 하나 + 열량 구간(사람마다 내 구간) + 탄단지 균형·고단백 + 세 끼 기록.
 *  - 늦게 들어오기: 남은 날이 7일 이상이면 들어오고, 목표는 남은 날의 70% (DB 함수 challenge_season_open).
 */
import { addDays, weekday } from "@/lib/day";
import { ruleOf, type UserMetric } from "@/lib/challenge-rules";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export type SeasonSpec = { slug: string; title: string; kind: "monthly" | "newyear"; start_on: string; days: 28 | 56; intro: string };
export type SeasonChallenge = { metric: UserMetric; target: number };

const FIRST = "2026-12-01";
const THEMES: Record<number, { title: string; lead: SeasonChallenge; intro: string }> = {
  1: { title: "새해 시즌", lead: { metric: "protein_min", target: 60 }, intro: "8주 동안 하루 단백질과 열량 구간을 같이 챙겨요" },
  3: { title: "봄맞이 아침 챙기기", lead: { metric: "breakfast", target: 1 }, intro: "4주 동안 아침을 기록하고 내 구간을 지켜요" },
  4: { title: "당 줄이기", lead: { metric: "sugar_max", target: 25 }, intro: "4주 동안 하루 당류 25g 이하로" },
  5: { title: "끼니마다 단백질", lead: { metric: "protein_each", target: 20 }, intro: "4주 동안 세 끼 모두 단백질 20g" },
  6: { title: "간식 줄이기", lead: { metric: "snack_max", target: 1 }, intro: "4주 동안 간식은 하루 한 번까지" },
  7: { title: "나트륨 줄이기", lead: { metric: "sodium_max", target: 2000 }, intro: "4주 동안 하루 나트륨 2,000mg 이하로" },
  8: { title: "사진으로 세 끼", lead: { metric: "photo_meals", target: 3 }, intro: "4주 동안 세 끼를 사진으로 기록해요" },
  9: { title: "식이섬유 채우기", lead: { metric: "fiber_min", target: 25 }, intro: "4주 동안 하루 식이섬유 25g" },
  10: { title: "매일 기록하기", lead: { metric: "record_any", target: 1 }, intro: "4주 동안 하루도 빠짐없이" },
  11: { title: "세 끼 기록하기", lead: { metric: "meals_min", target: 3 }, intro: "4주 동안 아침·점심·저녁을 기록해요" },
  12: { title: "연말에도 세 끼", lead: { metric: "meals_min", target: 3 }, intro: "약속이 많은 연말, 4주 동안 세 끼 기록과 내 열량 구간을 지켜요" },
};

/** 그달 첫 월요일 (YYYY-MM-DD) */
export function firstMonday(year: number, month: number) {
  const d1 = `${year}-${String(month).padStart(2, "0")}-01`;
  const w = weekday(d1); // 0=일 … 6=토
  return addDays(d1, (8 - w) % 7);
}

/** 그달에 시작하는 시즌 (2월이거나 첫 시즌 전이면 null) */
export function seasonOfMonth(year: number, month: number): SeasonSpec | null {
  if (month === 2) return null;
  const start = firstMonday(year, month);
  if (start < FIRST) return null;
  const t = THEMES[month];
  const newyear = month === 1;
  return {
    slug: newyear ? `${year}-newyear` : `${year}-${String(month).padStart(2, "0")}`,
    title: newyear ? `${year} ${t.title}` : `${month}월 시즌 · ${t.title}`,
    kind: newyear ? "newyear" : "monthly", start_on: start, days: newyear ? 56 : 28, intro: t.intro,
  };
}

export const seasonEnd = (s: { start_on: string; days: number }) => addDays(s.start_on, s.days - 1);

/** 오늘 진행 중인 시즌과 다음 시즌 */
export function seasonsAround(today: string): { current: SeasonSpec | null; next: SeasonSpec | null } {
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  const list: SeasonSpec[] = [];
  for (let i = -2; i <= 3; i++) {
    const mm = ((m - 1 + i) % 12 + 12) % 12 + 1;
    const yy = y + Math.floor((m - 1 + i) / 12);
    const s = seasonOfMonth(yy, mm);
    if (s) list.push(s);
  }
  const current = list.find((s) => s.start_on <= today && today <= seasonEnd(s)) ?? null;
  const next = list.find((s) => s.start_on > today) ?? null;
  return { current, next };
}

/** 시즌 안의 챌린지 — 주제 하나 + 열량 구간 + 탄단지 균형·고단백 + 세 끼(주제가 세 끼면 매일 기록) */
export function seasonChallenges(s: SeasonSpec): SeasonChallenge[] {
  const m = Number(s.start_on.slice(5, 7));
  const lead = THEMES[s.kind === "newyear" ? 1 : m].lead;
  const extra: SeasonChallenge = lead.metric === "meals_min" ? { metric: "record_any", target: 1 } : { metric: "meals_min", target: 3 };
  const all: SeasonChallenge[] = [lead, { metric: "kcal_band", target: 1900 }, { metric: "macro_type", target: 1 }, { metric: "macro_type", target: 2 }, extra];
  return all.filter((c, i) => all.findIndex((x) => x.metric === c.metric && x.target === c.target) === i);
}

export function seasonChallengeText(s: SeasonSpec, c: SeasonChallenge) {
  const spec = ruleOf(c.metric)!;
  // 제목에 기간 숫자 대신 시즌 이름 — "연말에도 세 끼 · 열량 구간 지키기"
  const name = spec.title(s.days, c.target).replace(/^\d+일\s*/, "");
  return { title: `${s.title.replace(/^\d+월 시즌 · /, "")} · ${name}`, rule: spec.rule(c.target) };
}

/** 오늘 진행 중·다음 시즌과 그 챌린지가 DB 에 있게 한다 (여러 번 불러도 같다) */
export async function ensureSeasons(sb: Sb, today: string) {
  const { current, next } = seasonsAround(today);
  for (const s of [current, next].filter(Boolean) as SeasonSpec[]) {
    const { error } = await sb.from("challenge_seasons").upsert(s, { onConflict: "slug", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    const { data: row, error: rErr } = await sb.from("challenge_seasons").select("id").eq("slug", s.slug).single();
    if (rErr) throw new Error(rErr.message);
    const rows = seasonChallenges(s).map((c, i) => ({
      slug: `s-${s.slug}-${c.metric}-${c.target}`, ...seasonChallengeText(s, c), metric: c.metric, target: c.target, days: s.days,
      goal_days: Math.ceil(s.days * 0.7), sort: i, is_active: true, kind: "season", visibility: "public", season_id: row.id,
    }));
    const { error: cErr } = await sb.from("community_challenges").upsert(rows, { onConflict: "slug", ignoreDuplicates: true });
    if (cErr) throw new Error(cErr.message);
  }
  return { current, next };
}
