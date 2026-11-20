/**
 * 추천 반응 기록 (rec_events) — 무엇을 권했고(shown), 다른 추천으로 넘겼고(skipped), 기록했는지(recorded).
 *   서버 전용(서비스 키). 사람 단위 값은 본인 추천 점수에만 쓰고 다른 사람·업체에 보이지 않는다.
 *   같은 날 같은 것은 한 번만 센다(고유 키: 사람·화면·음식·날짜·행동).
 * 점수에 쓰는 것 (signalTerm): 최근 30일 본인 반응 + 찜
 *   넘김 −1 씩(최대 −2.5) · 기록 +0.5 씩(최대 +1) · 찜 +0.5 — 추천 순서만 바꾼다(빼지는 않는다).
 * 음식 열쇠(item key): 제품은 product id, 대표 메뉴는 'menu:이름' (lib/ai-fill skipKey 와 같다).
 * 시험: tests/rec-events.test.ts
 */
type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export type RecSurface = "ai_fill" | "next" | "chat";
export type RecAction = "shown" | "skipped" | "recorded";
export type RecEvent = { user_id: string; surface: RecSurface; item_key: string; meal: string | null; day: string; action: RecAction };

const missing = (e: { code?: string; message?: string } | null | undefined) =>
  e?.code === "42P01" || e?.code === "PGRST205" || /rec_events/.test(String(e?.message || ""));

/** 남기기 — 실패해도 추천·기록은 그대로 간다(덤 기록). 실패는 서버 기록에 남긴다 */
export async function logRec(sb: Sb, rows: RecEvent[]) {
  const list = rows.filter((r) => r.user_id && r.item_key).map((r) => ({ ...r, item_key: r.item_key.slice(0, 120) }));
  if (!list.length) return;
  const { error } = await sb.from("rec_events").upsert(list, { onConflict: "user_id,surface,item_key,day,action", ignoreDuplicates: true });
  if (error && !missing(error)) console.error("추천 반응을 남기지 못했어요:", error.message);
}

export type Signals = Map<string, number>;

/** 반응 → 음식 열쇠별 점수 더하기 (계산만) */
export function buildSignals(events: { item_key: string; action: string }[], favorites: string[]): Signals {
  const skip = new Map<string, number>(), rec = new Map<string, number>();
  for (const e of events) {
    if (e.action === "skipped") skip.set(e.item_key, (skip.get(e.item_key) || 0) + 1);
    if (e.action === "recorded") rec.set(e.item_key, (rec.get(e.item_key) || 0) + 1);
  }
  const out: Signals = new Map();
  const add = (k: string, v: number) => out.set(k, (out.get(k) || 0) + v);
  for (const [k, n] of skip) add(k, -Math.min(2.5, n));
  for (const [k, n] of rec) add(k, Math.min(1, n * 0.5));
  for (const k of favorites) add(k, 0.5);
  return out;
}

export const signalTerm = (s: Signals | undefined, key: string) => (s ? s.get(key) || 0 : 0);

/** 그 사람(들)의 최근 30일 반응 + 찜 읽기. 표가 아직 없으면 빈 값 */
export async function loadSignals(sb: Sb, person: string | string[], since: string): Promise<Signals> {
  const ids = Array.isArray(person) ? person : [person];
  const [ev, fav] = await Promise.all([
    sb.from("rec_events").select("item_key, action").in("user_id", ids).in("action", ["skipped", "recorded"]).gte("day", since).limit(1000),
    sb.from("user_favorites").select("product_id").in("user_id", ids).limit(500),
  ]);
  if (ev.error && !missing(ev.error)) throw new Error(ev.error.message);
  if (fav.error) throw new Error(fav.error.message);
  return buildSignals((ev.error ? [] : ev.data || []) as { item_key: string; action: string }[],
    ((fav.data || []) as { product_id: string | null }[]).map((f) => f.product_id).filter((x): x is string => !!x));
}

/** 기록했을 때 — 최근 3일 안에 권했던 음식이면 'recorded' 로 이어 붙인다 (어느 화면에서 권했는지) */
export async function markRecorded(sb: Sb, userId: string, keys: string[], day: string, since: string) {
  const list = keys.filter(Boolean);
  if (!userId || !list.length) return;
  const { data, error } = await sb.from("rec_events").select("surface, item_key, meal").eq("user_id", userId).eq("action", "shown")
    .in("item_key", list).gte("day", since).order("created_at", { ascending: false }).limit(5);
  if (error) { if (!missing(error)) console.error("추천 반응을 읽지 못했어요:", error.message); return; }
  const hit = (data || [])[0] as { surface: RecSurface; item_key: string; meal: string | null } | undefined;
  if (hit) await logRec(sb, [{ user_id: userId, surface: hit.surface, item_key: hit.item_key, meal: hit.meal, day, action: "recorded" }]);
}
