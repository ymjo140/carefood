import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { changeNickname, getNickname } from "@/lib/community-profile";

/**
 * GET /api/community/me — 내 커뮤니티 이름 { nickname | null } (아직 글을 안 썼으면 null)
 * PUT /api/community/me { nickname } — 이름 바꾸기 → { nickname } · 규칙·중복이면 400 { error }
 *   바꾸면 예전 글·답글의 이름도 바뀐다 (lib/community-profile.ts)
 */
export async function GET() {
  await connection();
  const actor = await getActorId();
  if (!actor) return noActor();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  try {
    return NextResponse.json({ nickname: await getNickname(sb, actor) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const actor = await getActorId();
  if (!actor) return noActor();
  const body = await request.json().catch(() => ({}));
  if (typeof body.nickname !== "string") return NextResponse.json({ error: "이름을 적어 주세요" }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  try {
    const r = await changeNickname(sb, actor, body.nickname);
    if (r.problem) return NextResponse.json({ error: r.problem }, { status: 400 });
    return NextResponse.json({ nickname: r.nickname });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
