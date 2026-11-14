/**
 * 몰아서 배포 (11/14 사용자 결정) — main 에 합쳐도 바로 배포하지 않고 2시간마다 한 번, 바뀐 게 있을 때만 배포한다.
 * Vercel Hobby 는 하루 배포 수에 한도가 있어 여러 대화가 머지할 때마다 배포하면 한도에 걸렸다(11/14 밤).
 *  · vercel.json git.deploymentEnabled.main = false — main 푸시로는 배포하지 않는다(PR 미리보기는 그대로).
 *  · Supabase 예약 작업(pg_cron, 2시간마다)이 /api/deploy/run 을 부르면, 지금 운영 중인 커밋과 GitHub main 끝 커밋을 견줘
 *    다르면 Vercel 배포 훅(VERCEL_DEPLOY_HOOK_URL, 사용자가 Vercel 에 넣음)을 부른다.
 *  · 급하면 관리자가 POST /api/deploy/run?now=1 (같아도 배포).
 */
export const DEPLOY_EVERY_HOURS = 2;
export const REPO = "ymjo140/carefood";

export type DeployDecision = { deploy: boolean; reason: string };

/** running: 지금 운영 중인 커밋(VERCEL_GIT_COMMIT_SHA) · main: GitHub main 끝 커밋(못 읽으면 null) */
export function decideDeploy(running: string | null | undefined, main: string | null, force = false): DeployDecision {
  if (force) return { deploy: true, reason: "관리자가 바로 배포를 눌렀어요" };
  if (!main) return { deploy: true, reason: "main 끝 커밋을 읽지 못해 배포해요" }; // 하루 12번을 넘지 않는다
  if (!running) return { deploy: true, reason: "운영 중인 커밋을 몰라 배포해요" };
  if (running === main) return { deploy: false, reason: "바뀐 게 없어요" };
  return { deploy: true, reason: `${running.slice(0, 7)} → ${main.slice(0, 7)}` };
}

/** GitHub main 끝 커밋 — 공개 저장소라 토큰 없이 읽는다 */
export async function mainHead(fetcher: typeof fetch = fetch): Promise<string | null> {
  try {
    const r = await fetcher(`https://api.github.com/repos/${REPO}/commits/main`, { headers: { Accept: "application/vnd.github.sha", "User-Agent": "carefood-deploy" }, cache: "no-store" });
    if (!r.ok) { console.error("main 끝 커밋을 읽지 못했어요:", r.status); return null; }
    const sha = (await r.text()).trim();
    return /^[0-9a-f]{40}$/.test(sha) ? sha : null;
  } catch (e) {
    console.error("main 끝 커밋을 읽지 못했어요:", (e as Error).message);
    return null;
  }
}
