import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { LINK_COLS, accountActor, grantOf, logLink, nicknameOf, scopesOf, type LinkRow } from "@/lib/family";
import { userPusher } from "@/lib/push";
import { josa } from "@/lib/buddy";

/**
 * 가족이 보낸 '이것도 보여 줄래요?' — 확인받는 사람(연결의 owner)만 본다.
 * GET  → { id, who, asks, status, scopes(지금 보여 주는 것) }
 * POST { grant: ["foods" | "proxy"], agree: true } — 켤 항목만 골라 답한다. 하나라도 켜면 따로 동의(agree)가 있어야 한다.
 *      grant 가 비면 '지금은 안 할게요'(declined). 기다리는 요청만 한 번 답한다(조건부 update). 켠 항목은 동의 기록(scopes)을 남긴다.
 *      보는 사람에게 알림함 + 푸시 — 거절하면 '지금은 어려워요'로만 (이유는 알리지 않는다).
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Req = { id: string; link_id: string; asks: string[]; status: "pending" | "accepted" | "declined"; granted: string[]; created_at: string };
const LABEL = { foods: "먹은 음식", proxy: "대신 기록하기" } as const;
const shown = (g: (keyof typeof LABEL)[]) => { const t = g.map((k) => LABEL[k]).join(" · "); return t + josa(t, "을", "를"); };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function load(sb: any, id: string, owner: string): Promise<{ r: Req; l: LinkRow } | null> {
  const { data: r, error } = await sb.from("family_requests").select("id, link_id, asks, status, granted, created_at").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!r) return null;
  const { data: l, error: lErr } = await sb.from("family_links").select(LINK_COLS).eq("id", r.link_id).eq("owner_id", owner).eq("status", "active").maybeSingle();
  if (lErr) throw new Error(lErr.message);
  return l ? { r: r as Req, l: l as LinkRow } : null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "요청을 찾지 못했어요" }, { status: 404 });
  const who = await accountActor();
  if ("res" in who) return who.res;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  try {
    const x = await load(sb, id, who.actor);
    if (!x) return NextResponse.json({ error: "요청을 찾지 못했어요" }, { status: 404 });
    return NextResponse.json({ id: x.r.id, who: await nicknameOf(sb, x.l.viewer_id), asks: x.r.asks, status: x.r.status, granted: x.r.granted, scopes: scopesOf(x.l), created_at: x.r.created_at });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "요청을 찾지 못했어요" }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  const who = await accountActor();
  if ("res" in who) return who.res;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServiceRoleClient() as any;
  try {
    const x = await load(sb, id, who.actor);
    if (!x) return NextResponse.json({ error: "요청을 찾지 못했어요" }, { status: 404 });
    const grant = grantOf(body.grant, x.r.asks);
    if (grant.length && body.agree !== true) return NextResponse.json({ error: "켠 항목을 보여 주는 데 동의해 주세요" }, { status: 400 });

    // 기다리는 요청만 한 번 — 두 기기에서 동시에 눌러도 한 번
    const status = grant.length ? "accepted" : "declined";
    const { data: up, error: uErr } = await sb.from("family_requests").update({ status, granted: grant, answered_at: new Date().toISOString() })
      .eq("id", x.r.id).eq("status", "pending").select("id");
    if (uErr) throw new Error(uErr.message);
    if (!up?.length) return NextResponse.json({ error: "이미 답한 요청이에요" }, { status: 409 });

    let scopes = scopesOf(x.l);
    if (grant.length) {
      const patch: Record<string, boolean> = {};
      if (grant.includes("foods")) patch.share_foods = true;
      if (grant.includes("proxy")) patch.share_proxy = true;
      const { data: lu, error: lErr } = await sb.from("family_links").update(patch).eq("id", x.l.id).eq("status", "active").select(LINK_COLS);
      if (lErr) throw new Error(lErr.message);
      if (!lu?.length) return NextResponse.json({ error: "연결이 끝났어요" }, { status: 409 });
      scopes = scopesOf(lu[0] as LinkRow);
      await logLink(sb, x.l.id, who.actor, "scopes", scopes);
    }
    try { await logLink(sb, x.l.id, who.actor, "answer"); }
    catch (e) { console.error("가족 요청 답 기록을 남기지 못했어요:", (e as Error).message); } // ds-allow: 답은 반영됐다 — 기록만 빠짐

    const push = userPusher(sb);
    if (push) {
      try {
        await push(x.l.viewer_id, grant.length
          ? { title: "가족 요청", body: `${x.l.label} · ${shown(grant)} 보여 주기로 했어요`, url: `/diary?who=${x.l.id}`, tag: `famans-${x.l.id}` }
          : { title: "가족 요청", body: `${x.l.label} · 지금은 어려워요`, url: "/family", tag: `famans-${x.l.id}` });
      } catch (e) { console.error("가족 요청 답 푸시를 보내지 못했어요:", (e as Error).message); } // ds-allow: 알림함에는 들어갔다 — 푸시만 빠짐
    }
    return NextResponse.json({ ok: true, status, granted: grant, scopes });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
