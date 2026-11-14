/**
 * 커뮤니티 투표 — 글에 선택지 2~4개, 한 사람 한 표(마감 전에는 바꿀 수 있음).
 * 글(community_feed.poll)에는 선택지와 마감 시각만, 표는 community_poll_votes 에.
 */
import { selectAllIn } from "@/lib/supabase/all";
export const POLL_DAYS = [1, 3, 7] as const;
export const POLL_MAX_OPTIONS = 4;
export const POLL_OPTION_MAX = 40;

export type PollView = {
  options: string[];
  counts: number[];
  total: number;
  my_choice: number | null;
  closes_at: string | null;
  closed: boolean;
};

type StoredPoll = { options: string[]; closes_at: string | null };

/** 글쓰기에서 받은 투표 — 선택지 2~4개(같은 말 하나로), 기간 1·3·7일. 맞지 않으면 null */
export function cleanPoll(raw: unknown, now = Date.now()): StoredPoll | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.options)) return null;
  const seen = new Set<string>();
  const options: string[] = [];
  for (const v of o.options) {
    if (typeof v !== "string") continue;
    const t = v.replace(/\s+/g, " ").trim().slice(0, POLL_OPTION_MAX);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    options.push(t);
  }
  if (options.length < 2 || options.length > POLL_MAX_OPTIONS) return null;
  const days = (POLL_DAYS as readonly number[]).includes(Number(o.days)) ? Number(o.days) : 3;
  return { options, closes_at: new Date(now + days * 86400e3).toISOString() };
}

function isStored(p: unknown): p is StoredPoll {
  return !!p && typeof p === "object" && Array.isArray((p as StoredPoll).options) && (p as StoredPoll).options.length >= 2;
}

/** 글 목록에 투표 결과를 붙인다 — poll 칸을 결과 모양(PollView)으로 바꿔 돌려준다 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function withPolls<T extends { id: string; poll?: unknown }>(sb: any, posts: T[], viewer: string | null): Promise<(Omit<T, "poll"> & { poll: PollView | null })[]> {
  const ids = posts.filter((p) => isStored(p.poll)).map((p) => p.id);
  const votes = new Map<string, { choice: number; user_id: string }[]>();
  if (ids.length) {
    const data = await selectAllIn(ids, 100, (p) => sb.from("community_poll_votes").select("post_id, user_id, choice").in("post_id", p), ["post_id", "user_id"], 1_000_000);
    for (const v of data as { post_id: string; user_id: string; choice: number }[]) {
      votes.set(v.post_id, [...(votes.get(v.post_id) || []), v]);
    }
  }
  const now = Date.now();
  return posts.map((p) => {
    if (!isStored(p.poll)) return { ...p, poll: null };
    const list = votes.get(p.id) || [];
    const counts = p.poll.options.map((_, i) => list.filter((v) => v.choice === i).length);
    const mine = viewer ? list.find((v) => v.user_id === viewer) : undefined;
    const closes = p.poll.closes_at;
    return {
      ...p,
      poll: {
        options: p.poll.options, counts, total: list.length, my_choice: mine ? mine.choice : null,
        closes_at: closes, closed: !!closes && Date.parse(closes) <= now,
      },
    };
  });
}

/** 마감까지 남은 시간 한 줄 — "2일 남았어요" / "5시간 남았어요" / "마감했어요" */
export function pollRemaining(closesAt: string | null, closed: boolean, now = Date.now()): string {
  if (closed) return "마감했어요";
  if (!closesAt) return "마감 없음";
  const h = Math.max(0, (Date.parse(closesAt) - now) / 3600e3);
  if (h >= 24) return `${Math.floor(h / 24)}일 남았어요`;
  if (h >= 1) return `${Math.floor(h)}시간 남았어요`;
  return "곧 마감해요";
}
