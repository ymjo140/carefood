import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getAdminUser } from "@/lib/actor-server";
import { decideDeploy, mainHead } from "@/lib/deploy-batch";

/**
 * 몰아서 배포 (lib/deploy-batch.ts)
 *  POST /api/deploy/run — 예약 작업(x-cron-secret, 2시간마다) 또는 관리자. 운영 커밋과 main 끝이 다르면 배포 훅을 부른다.
 *       ?now=1 (관리자만) 같아도 바로 배포 · ?dry=1 부르지 않고 판단만
 *  GET  /api/deploy/run — 관리자: 지금 운영 커밋·main 끝·배포할지
 */
async function cronOk(req: NextRequest) {
  const cron = req.headers.get("x-cron-secret") || "";
  if (!/^[0-9a-f]{64}$/.test(cron)) return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (createServiceRoleClient() as any).rpc("cron_secret_ok", { p: cron });
  if (error) console.error("예약 작업 비밀값을 확인하지 못했어요:", error.message);
  return data === true;
}

async function status(force: boolean) {
  const running = process.env.VERCEL_GIT_COMMIT_SHA || null;
  const main = await mainHead();
  return { running, main, ...decideDeploy(running, main, force), hook: !!process.env.VERCEL_DEPLOY_HOOK_URL };
}

export async function GET() {
  await connection();
  if (!(await getAdminUser())) return NextResponse.json({ error: "관리자만 볼 수 있어요" }, { status: 403 });
  return NextResponse.json(await status(false));
}

export async function POST(req: NextRequest) {
  await connection();
  const viaCron = await cronOk(req);
  const admin = viaCron ? null : await getAdminUser();
  if (!viaCron && !admin) return NextResponse.json({ error: "관리자만 할 수 있어요" }, { status: 403 });
  const force = !!admin && req.nextUrl.searchParams.get("now") === "1";
  const s = await status(force);
  if (!s.deploy || req.nextUrl.searchParams.get("dry") === "1") return NextResponse.json({ ...s, triggered: false });
  const hook = process.env.VERCEL_DEPLOY_HOOK_URL;
  if (!hook) {
    console.error("배포 훅(VERCEL_DEPLOY_HOOK_URL)이 없어 배포하지 못했어요");
    return NextResponse.json({ ...s, triggered: false, error: "배포 훅이 없어요" }, { status: 503 });
  }
  try {
    const r = await fetch(hook, { method: "POST", cache: "no-store" });
    if (!r.ok) throw new Error(`배포 훅 ${r.status}`);
    return NextResponse.json({ ...s, triggered: true });
  } catch (e) {
    console.error("배포 훅을 부르지 못했어요:", (e as Error).message);
    return NextResponse.json({ ...s, triggered: false, error: "배포를 시작하지 못했어요" }, { status: 502 });
  }
}
