import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { LINK_COLS, accountActor, askableOf, kindOf, logLink, nicknameOf, scopesOf, type LinkRow } from "@/lib/family";
import { userPusher } from "@/lib/push";

/**
 * POST /api/family/links/[id]/request { asks: ["foods" | "proxy"] } — 보는 사람이 '이것도 보여 줄래요?'를 보낸다.
 *   확인받는 사람에게 푸시(켜 둔 기기가 있으면) + 알림함 → /family/request/[요청] 동의 화면에서 직접 켠다. 정하기 전에는 아무것도 바뀌지 않는다.
 *   이미 켜진 항목은 묻지 않는다 · 연결마다 기다리는 요청은 하나(부분 unique) · 연결마다 하루 한 번.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ASK_LABEL = { foods: "먹은 음식", proxy: "대신 기록하기" } as const;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "연결을 찾지 못했어요" }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  const who = await accountActor();
  if ("res" in who) return who.res;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  try {
    const { data, error } = await sb.from("family_links").select(LINK_COLS).eq("id", id).eq("viewer_id", who.actor).eq("status", "active").maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: "연결을 찾지 못했어요" }, { status: 404 });
    const l = data as LinkRow;
    const asks = askableOf(body.asks, scopesOf(l), kindOf(l));
    if (!asks.length) return NextResponse.json({ error: "요청할 항목을 골라 주세요 (이미 보여 주는 항목은 묻지 않아요)" }, { status: 400 });

    const { count, error: cErr } = await sb.from("family_requests").select("id", { count: "exact", head: true })
      .eq("link_id", l.id).gte("created_at", new Date(Date.now() - 86400e3).toISOString());
    if (cErr) {
      if (cErr.code === "42P01" || cErr.code === "PGRST205") return NextResponse.json({ error: "요청 보내기는 아직 준비 중이에요" }, { status: 503 });
      throw new Error(cErr.message);
    }
    if ((count || 0) >= 1) return NextResponse.json({ error: "요청은 하루에 한 번 보낼 수 있어요" }, { status: 429 });

    const { data: req, error: iErr } = await sb.from("family_requests").insert({ link_id: l.id, asks }).select("id").single();
    if (iErr) {
      if (iErr.code === "23505") return NextResponse.json({ error: `이미 요청을 보냈어요. ${l.label} 쪽에서 답하면 알려 드려요` }, { status: 409 });
      throw new Error(iErr.message);
    }
    try { await logLink(sb, l.id, who.actor, "request"); }
    catch (e) { console.error("가족 요청 기록을 남기지 못했어요:", (e as Error).message); } // ds-allow: 요청은 만들어졌다 — 기록만 빠짐

    let pushed = false;
    const push = userPusher(sb);
    if (push) {
      try {
        const name = (await nicknameOf(sb, who.actor)) || "가족";
        pushed = await push(l.owner_id!, {
          title: `${name} 님이 보여 줄 것을 요청했어요`,
          body: `${asks.map((a) => ASK_LABEL[a]).join(" · ")} — 눌러서 보고 정해 주세요. 정하기 전에는 아무것도 바뀌지 않아요`,
          url: `/family/request/${req.id}`, tag: `famreq-${l.id}`,
        });
      } catch (e) { console.error("가족 요청 푸시를 보내지 못했어요:", (e as Error).message); } // ds-allow: 알림함에는 들어갔다 — 푸시만 빠짐
    }
    return NextResponse.json({ ok: true, id: req.id, asks, pushed });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
