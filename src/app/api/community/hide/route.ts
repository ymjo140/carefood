import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";

/** POST 숨기기 / DELETE 다시 보기 — /api/community/hide { post_id } (나에게만) */
async function handle(request: NextRequest, hide: boolean) {
  const actor = await getActorId();
  if (!actor) return noActor();
  const { post_id } = await request.json().catch(() => ({}));
  if (typeof post_id !== "string") return NextResponse.json({ error: "post_id 필수" }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  const { error } = hide
    ? await sb.from("community_hidden_posts").upsert({ user_id: actor, post_id }, { onConflict: "user_id,post_id" })
    : await sb.from("community_hidden_posts").delete().eq("user_id", actor).eq("post_id", post_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, hidden: hide });
}

export const POST = (r: NextRequest) => handle(r, true);
export const DELETE = (r: NextRequest) => handle(r, false);
