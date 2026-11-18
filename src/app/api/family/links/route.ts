import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { INVITE_DAYS, LABEL_MAX, LINK_COLS, accountActor, cleanScopes, inviteCode, kindOf, limitScopes, logLink, scopesOf, type LinkRow } from "@/lib/family";
import { nicknames } from "@/lib/challenge-groups";

/**
 * 가족·친구 연결 (로그인한 계정만) — 같은 표, kind 로 나눈다. 친구는 서로 보는 두 줄(받을 때 DB 함수가 만든다)
 * GET    — { watching: 내가 보는 사람(연결됨), invites: 보낸 초대(기다리는 중), watchers: 나를 보는 사람 } — 줄마다 kind
 *          friends: 친구 한 명당 한 줄 { id: 내가 보는 줄, back: 그 친구가 나를 보는 줄(내가 보여 줄 것을 정함), label, scopes, mine, allow_nudge }
 * POST   { label, kind?: "friend", agree? } — 초대 링크 만들기 (7일, 하루 5개까지). 친구 초대는 '받으면 내 끼니 기록 여부도 보여 줘요'에 동의(agree)해야
 *        응답 { id, code, url }
 * PATCH  { id, scopes } — 확인받는 사람만: 보여 줄 것 바꾸기 (기록을 남김)
 *        { id, alert_evening } — 보는 사람만: 저녁 8시까지 기록이 없으면 나에게 알림
 *        { id, alert_meds } — 보는 사람만: 가족 약 체크가 정한 시각에서 1시간 넘게 없으면 나에게 알림
 *        { id, allow_nudge } — 확인받는 사람만: 콕 찌르기 받기
 * DELETE { id } — 어느 쪽이든 그만두기 (기다리는 초대는 보낸 사람이 지우기). 친구는 두 줄을 함께 끝낸다
 */
type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const site = () => process.env.NEXT_PUBLIC_SITE_URL || "https://carefood-iota.vercel.app";

export async function GET() {
  await connection();
  const who = await accountActor();
  if ("res" in who) return who.res;
  const sb = createServiceRoleClient() as Sb;
  const [mine, theirs] = await Promise.all([
    sb.from("family_links").select(LINK_COLS).eq("viewer_id", who.actor).in("status", ["pending", "active"]).order("created_at"),
    sb.from("family_links").select(LINK_COLS).eq("owner_id", who.actor).eq("status", "active").order("created_at"),
  ]);
  if (mine.error || theirs.error) return NextResponse.json({ error: (mine.error || theirs.error).message }, { status: 500 });
  const now = Date.now();
  const out = (mine.data || []) as LinkRow[];
  const watchers = (theirs.data || []) as LinkRow[];
  let names: Map<string, string>;
  try { names = await nicknames(sb, watchers.map((l) => l.viewer_id)); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
  const active = out.filter((l) => l.status === "active");
  // 친구: 내가 보는 줄(owner = 친구)과 친구가 나를 보는 줄(viewer = 친구)을 한 사람으로 묶는다
  const backOf = new Map(watchers.filter((w) => kindOf(w) === "friend").map((w) => [w.viewer_id, w]));
  return NextResponse.json({
    watching: active.map((l) => ({ id: l.id, kind: kindOf(l), label: l.label, scopes: scopesOf(l), alert_evening: l.alert_evening, alert_meds: l.alert_meds, since: l.consented_at })),
    invites: out.filter((l) => l.status === "pending" && Date.parse(l.expires_at) > now).map((l) => ({ id: l.id, kind: kindOf(l), label: l.label, url: `${site()}/f/${l.code}`, expires_at: l.expires_at })),
    watchers: watchers.map((l) => ({ id: l.id, kind: kindOf(l), who: names.get(l.viewer_id) || null, scopes: scopesOf(l), allow_nudge: l.allow_nudge, since: l.consented_at })),
    friends: active.filter((l) => kindOf(l) === "friend").map((l) => {
      const back = l.owner_id ? backOf.get(l.owner_id) : undefined;
      return { id: l.id, back: back?.id ?? null, label: l.label, scopes: scopesOf(l), mine: back ? scopesOf(back) : null, allow_nudge: back ? back.allow_nudge : null, since: l.consented_at };
    }),
  });
}

export async function POST(request: NextRequest) {
  const who = await accountActor();
  if ("res" in who) return who.res;
  const { label, kind: rawKind, agree } = await request.json().catch(() => ({}));
  const kind = rawKind === "friend" ? "friend" : "family";
  const name = typeof label === "string" ? label.trim().replace(/\s+/g, " ") : "";
  if (!name || name.length > LABEL_MAX) return NextResponse.json({ error: `부르는 이름을 ${LABEL_MAX}자 안으로 적어 주세요 (예: ${kind === "friend" ? "민지" : "엄마"})` }, { status: 400 });
  // 친구는 서로 보는 사이 — 친구가 받으면 내 끼니 기록 여부도 친구에게 보인다
  if (kind === "friend" && agree !== true) return NextResponse.json({ error: "친구에게 내 끼니 기록 여부를 보여 주는 데 동의해 주세요" }, { status: 400 });
  const sb = createServiceRoleClient() as Sb;
  const limited = await rateLimit(sb, request, who.actor, "challenge");
  if (limited) return limited;
  const { count, error: cErr } = await sb.from("family_links").select("id", { count: "exact", head: true })
    .eq("viewer_id", who.actor).gte("created_at", new Date(Date.now() - 86400e3).toISOString());
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
  if ((count || 0) >= 5) return NextResponse.json({ error: "오늘은 초대를 5개까지 만들 수 있어요. 내일 다시 해 주세요" }, { status: 429 });
  for (let i = 0; i < 3; i++) {
    const code = inviteCode();
    const { data, error } = await sb.from("family_links").insert({
      viewer_id: who.actor, label: name, code, kind, expires_at: new Date(Date.now() + INVITE_DAYS * 86400e3).toISOString(),
    }).select("id, code").single();
    if (error) { if (/duplicate key|unique/i.test(error.message)) continue; return NextResponse.json({ error: error.message }, { status: 500 }); }
    try { await logLink(sb, data.id, who.actor, "invite"); }
    catch (e) { console.error("가족 초대 기록을 남기지 못했어요:", (e as Error).message); } // ds-allow: 초대는 만들어졌다 — 기록만 빠짐
    return NextResponse.json({ id: data.id, code: data.code, url: `${site()}/f/${data.code}` });
  }
  return NextResponse.json({ error: "초대 링크를 만들지 못했어요. 다시 시도해 주세요" }, { status: 500 });
}

export async function PATCH(request: NextRequest) {
  const who = await accountActor();
  if ("res" in who) return who.res;
  const body = await request.json().catch(() => ({}));
  if (typeof body.id !== "string" || !UUID.test(body.id)) return NextResponse.json({ error: "연결을 골라 주세요" }, { status: 400 });
  const sb = createServiceRoleClient() as Sb;
  const { data: l, error } = await sb.from("family_links").select(LINK_COLS).eq("id", body.id).eq("status", "active").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const link = l as LinkRow | null;
  if (!link) return NextResponse.json({ error: "연결을 찾지 못했어요" }, { status: 404 });
  if (body.scopes !== undefined) {
    if (link.owner_id !== who.actor) return NextResponse.json({ error: "보여 줄 것은 본인만 바꿀 수 있어요" }, { status: 403 });
    const s = limitScopes(kindOf(link), cleanScopes(body.scopes, scopesOf(link)));
    // 다른 사람이 같은 순간 그만뒀으면(ended) 바꾸지 않는다
    const { data: up, error: uErr } = await sb.from("family_links").update({ share_meals: s.meals, share_products: s.products, share_meds: s.meds, share_numbers: s.numbers, share_foods: s.foods, share_proxy: s.proxy })
      .eq("id", link.id).eq("status", "active").select("id");
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });
    if (!up?.length) return NextResponse.json({ error: "연결이 끝났어요" }, { status: 409 });
    try { await logLink(sb, link.id, who.actor, "scopes", s); }
    catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
    return NextResponse.json({ ok: true, scopes: s });
  }
  for (const key of ["alert_evening", "alert_meds"] as const) {
    if (typeof body[key] !== "boolean") continue;
    if (link.viewer_id !== who.actor) return NextResponse.json({ error: "알림은 보는 사람만 바꿀 수 있어요" }, { status: 403 });
    if (kindOf(link) === "friend") return NextResponse.json({ error: "친구에게는 자동 알림이 없어요" }, { status: 400 });
    const { data: up, error: uErr } = await sb.from("family_links").update({ [key]: body[key] }).eq("id", link.id).eq("status", "active").select("id");
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });
    if (!up?.length) return NextResponse.json({ error: "연결이 끝났어요" }, { status: 409 });
    return NextResponse.json({ ok: true, [key]: body[key] });
  }
  if (typeof body.allow_nudge === "boolean") {
    if (link.owner_id !== who.actor) return NextResponse.json({ error: "콕 찌르기 받기는 본인만 바꿀 수 있어요" }, { status: 403 });
    const { data: up, error: uErr } = await sb.from("family_links").update({ allow_nudge: body.allow_nudge }).eq("id", link.id).eq("status", "active").select("id");
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });
    if (!up?.length) return NextResponse.json({ error: "연결이 끝났어요" }, { status: 409 });
    return NextResponse.json({ ok: true, allow_nudge: body.allow_nudge });
  }
  return NextResponse.json({ error: "바꿀 것을 골라 주세요" }, { status: 400 });
}

export async function DELETE(request: NextRequest) {
  const who = await accountActor();
  if ("res" in who) return who.res;
  const { id } = await request.json().catch(() => ({}));
  if (typeof id !== "string" || !UUID.test(id)) return NextResponse.json({ error: "연결을 골라 주세요" }, { status: 400 });
  const sb = createServiceRoleClient() as Sb;
  const ended = new Date().toISOString();
  const { data, error } = await sb.from("family_links").update({ status: "ended", ended_at: ended })
    .eq("id", id).in("status", ["pending", "active"]).or(`viewer_id.eq.${who.actor},owner_id.eq.${who.actor}`).select("id, kind, viewer_id, owner_id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "연결을 찾지 못했어요" }, { status: 404 });
  const row = data[0] as { id: string; kind: string; viewer_id: string; owner_id: string | null };
  const ids = [row.id];
  // 친구는 서로 보는 두 줄 — 한쪽을 끊으면 반대쪽도 함께 (어느 쪽이 눌러도 서로 더는 보이지 않는다)
  if (row.kind === "friend" && row.owner_id) {
    const { data: back, error: bErr } = await sb.from("family_links").update({ status: "ended", ended_at: ended })
      .eq("kind", "friend").eq("status", "active").eq("viewer_id", row.owner_id).eq("owner_id", row.viewer_id).select("id");
    if (bErr) return NextResponse.json({ error: `친구 쪽 연결을 끊지 못했어요. 다시 시도해 주세요 (${bErr.message})` }, { status: 500 });
    for (const b of (back || []) as { id: string }[]) ids.push(b.id);
  }
  for (const linkId of ids) {
    try { await logLink(sb, linkId, who.actor, "end"); }
    catch (e) { console.error("연결 끝 기록을 남기지 못했어요:", (e as Error).message); } // ds-allow: 그만두기는 이미 됐다 — 기록만 빠짐
  }
  return NextResponse.json({ ok: true });
}
