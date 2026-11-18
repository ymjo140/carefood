import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";

/**
 * POST /api/community/tags/[id] { action: "approve" | "remove" } — 나를 태그한 것 하나 (태그된 사람만)
 *   approve: 승인 기다림 → 글에 보임 (pending 일 때만 한 번)
 *   remove : 글에서 내 태그 지우기 (보임·기다림 모두) — 다시 붙지 않는다(같은 글에 한 사람 한 줄)
 *   조건부 update 라 두 번 눌러도 한 번만 바뀐다.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "태그를 찾지 못했어요" }, { status: 404 });
  const me = await getActorId();
  if (!me) return noActor();
  const { action } = await request.json().catch(() => ({}));
  if (action !== "approve" && action !== "remove") return NextResponse.json({ error: "할 일을 골라 주세요" }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  const q = sb.from("community_post_people").update({ status: action === "approve" ? "shown" : "removed", answered_at: new Date().toISOString() })
    .eq("id", id).eq("tagged_id", me);
  const { data, error } = await (action === "approve" ? q.eq("status", "pending") : q.in("status", ["shown", "pending"])).select("id, status");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: action === "approve" ? "이미 처리한 태그예요" : "이미 지운 태그예요" }, { status: 409 });
  return NextResponse.json({ ok: true, status: data[0].status });
}
