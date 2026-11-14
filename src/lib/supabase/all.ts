/**
 * 많은 줄 받기 (서버 전용) — Supabase(PostgREST)는 한 요청에 1,000줄(max-rows)까지만 돌려준다.
 * `.limit(50000)` 을 붙여도 1,000줄에서 오류 없이 잘린다 → 합계·건수·동의자 목록이 조용히 틀린다.
 * 여기서는 1,000줄씩 나눠 끝까지 받는다.
 *
 *  · make: 매번 새 쿼리를 만든다(.range 를 붙여 부른다). `.limit()` 은 붙이지 않는다.
 *  · order: 겹치거나 빠지는 줄이 없게 고유한 칸(들)로 정렬한다 — 대개 "id". 앞에 "-" 를 붙이면 내림차순("-created_at").
 *  · max: 이보다 많으면 멈추고 오류를 낸다. 숫자를 틀리게 보여 주느니 실패를 알린다.
 */
type Q = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export const PAGE = 1000;

export async function selectAll<T>(make: () => Q, order: string | string[], max = 200_000): Promise<T[]> {
  const cols = Array.isArray(order) ? order : [order];
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = make();
    for (const c of cols) q = q.order(c.replace(/^-/, ""), { ascending: !c.startsWith("-") });
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data || []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
    if (out.length >= max) throw new Error(`한 번에 셀 수 있는 줄(${max.toLocaleString("ko-KR")})을 넘었어요`);
  }
}

/** id 목록을 size 개씩 나눠 묻고(주소 길이 한도), 묶음마다 끝까지 받는다 */
export async function selectAllIn<T>(ids: string[], size: number, make: (part: string[]) => Q, order: string | string[], max = 200_000): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += size) {
    const part = ids.slice(i, i + size);
    out.push(...(await selectAll<T>(() => make(part), order, max - out.length)));
  }
  return out;
}

/** 앞에서부터 n 줄까지만 (표본) — 넘어도 오류를 내지 않는다. 표본이라는 것을 화면·설명에 밝힌다 */
export async function selectUpTo<T>(make: () => Q, order: string | string[], n: number): Promise<T[]> {
  const cols = Array.isArray(order) ? order : [order];
  const out: T[] = [];
  for (let from = 0; from < n; from += PAGE) {
    let q = make();
    for (const c of cols) q = q.order(c.replace(/^-/, ""), { ascending: !c.startsWith("-") });
    const { data, error } = await q.range(from, Math.min(from + PAGE, n) - 1);
    if (error) throw new Error(error.message);
    const rows = (data || []) as T[];
    out.push(...rows);
    if (rows.length < Math.min(PAGE, n - from)) break;
  }
  return out;
}

/** selectAll 결과를 { data, error } 모양으로 — Promise.all 로 다른 쿼리와 같이 받던 자리를 그대로 두려고 */
export async function asResult<T>(p: Promise<T[]>): Promise<{ data: T[]; error: { message: string } | null }> {
  return { data: await p, error: null };
}
