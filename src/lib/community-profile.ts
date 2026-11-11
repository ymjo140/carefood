/**
 * 커뮤니티 이름 — 서버에서만 쓴다. 사람(기록 주인 id)마다 이름 하나를 community_profiles 에 둔다.
 * 전에는 글·답글마다 브라우저가 보낸 이름을 그대로 저장해, '케어푸드'·남의 이름으로도 쓸 수 있었고
 * 이름을 바꾸면 예전 글은 옛 이름으로 남았다.
 *   - 글·답글에는 여기 이름을 붙인다 (보낸 이름은 처음 한 번, 규칙에 맞고 비어 있을 때만 받는다)
 *   - 이름은 겹치지 않는다 (대소문자 무시)
 *   - 바꾸면 그 사람의 예전 글·답글 이름도 바꾼다
 */
import { makeNickname, nicknameProblem } from "./nickname-rules";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const keyOf = (n: string) => n.trim().toLowerCase();

export async function getNickname(sb: Sb, actor: string): Promise<string | null> {
  const { data, error } = await sb.from("community_profiles").select("nickname").eq("actor_id", actor).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.nickname ?? null;
}

/** 이 사람의 이름 — 없으면 만든다 (wanted 가 규칙에 맞고 비어 있으면 그 이름, 아니면 지어 준다) */
export async function ensureNickname(sb: Sb, actor: string, wanted?: unknown): Promise<string> {
  const cur = await getNickname(sb, actor);
  if (cur) return cur;
  const first = typeof wanted === "string" && !nicknameProblem(wanted) ? wanted.trim() : makeNickname();
  for (let i = 0; i < 6; i++) {
    const nick = i === 0 ? first : `${first.slice(0, 9)}${Math.floor(Math.random() * 1000)}`;
    const { error } = await sb.from("community_profiles").insert({ actor_id: actor, nickname: nick, nickname_key: keyOf(nick) });
    if (!error) return nick;
    if (error.code !== "23505") throw new Error(error.message);
    const again = await getNickname(sb, actor); // 같은 사람이 동시에 먼저 만들었으면 그 이름
    if (again) return again;
  }
  throw new Error("이름을 정하지 못했어요");
}

/** 이름 바꾸기 — { nickname } 또는 { problem } (사용자에게 보일 이유) */
export async function changeNickname(sb: Sb, actor: string, wanted: string): Promise<{ nickname?: string; problem?: string }> {
  const problem = nicknameProblem(wanted);
  if (problem) return { problem };
  const nick = wanted.trim();
  const { error } = await sb.from("community_profiles")
    .upsert({ actor_id: actor, nickname: nick, nickname_key: keyOf(nick), updated_at: new Date().toISOString() }, { onConflict: "actor_id" });
  if (error) {
    if (error.code === "23505") return { problem: "이미 다른 사람이 쓰는 이름이에요" };
    throw new Error(error.message);
  }
  const [a, b] = await Promise.all([
    sb.from("community_feed").update({ author_nickname: nick }).eq("user_id", actor),
    sb.from("community_feed_comments").update({ author_nickname: nick }).eq("user_id", actor),
  ]);
  if (a.error) throw new Error(a.error.message);
  if (b.error) throw new Error(b.error.message);
  return { nickname: nick };
}
