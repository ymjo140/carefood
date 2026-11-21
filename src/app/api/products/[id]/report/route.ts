import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId, noActor } from "@/lib/actor-server";
import { rateLimit } from "@/lib/rate-limit";
import { cleanClaim, REPORT_KINDS, type ReportKind } from "@/lib/product-reports";

/**
 * POST /api/products/[id]/report — 정보 오류 신고 (multipart: kind · claimed(JSON) · note · file?)
 *   kind: nutrition · serving · wrong_page · price · other. 맞는 값·메모·라벨 사진은 선택.
 *   사진: jpeg·png·webp·heic 10MB 이하 → 서버가 방향을 맞추고 긴 변 1600px webp 로 다시 만든다(위치 같은 메타데이터가 지워진다).
 *         비공개 버킷 product-reports 의 <신고한 사람>/<무작위>.webp — 관리자 화면에서만 서명 주소로 본다.
 *   같은 사람·같은 제품·같은 종류가 처리 중이면 새 줄을 만들지 않고 그 줄을 고쳐 쓴다(again: true).
 *   횟수 제한: report (하루 10번 · 같은 연결 30번 — 커뮤니티 신고와 같이 센다).
 */
type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const BUCKET = "product-reports";
const MAX_IN = 10 * 1024 * 1024;

function looksLikeImage(b: Uint8Array) {
  const jpg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const png = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  const webp = b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
  const heic = b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70;
  return jpg || png || webp || heic;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActorId();
  if (!actor) return noActor();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "제품을 찾지 못했어요" }, { status: 404 });

  let kind: ReportKind, claimedRaw: unknown = null, note = "", file: File | null = null;
  try {
    const form = await request.formData();
    kind = String(form.get("kind") || "") as ReportKind;
    const c = form.get("claimed");
    if (typeof c === "string" && c) claimedRaw = JSON.parse(c);
    note = String(form.get("note") || "").trim().slice(0, 500);
    const f = form.get("file");
    file = f instanceof File && f.size > 0 ? f : null;
  } catch {
    return NextResponse.json({ error: "신고 내용을 읽지 못했어요" }, { status: 400 });
  }
  if (!REPORT_KINDS.includes(kind)) return NextResponse.json({ error: "무엇이 다른지 골라 주세요" }, { status: 400 });
  const claimed = cleanClaim(kind, claimedRaw);
  if (kind === "other" && !note && !file) return NextResponse.json({ error: "무엇이 다른지 적어 주세요" }, { status: 400 });

  const sb = createServiceRoleClient() as Sb;
  const limited = await rateLimit(sb, request, actor, "report");
  if (limited) return limited;

  const { data: product, error: pErr } = await sb.from("products").select("id").eq("id", id).maybeSingle();
  if (pErr) { console.error("신고 제품 읽기:", pErr.message); return NextResponse.json({ error: "신고를 보내지 못했어요. 다시 시도해 주세요" }, { status: 500 }); }
  if (!product) return NextResponse.json({ error: "제품을 찾지 못했어요" }, { status: 404 });

  let photo_path: string | null = null;
  if (file) {
    if (file.size > MAX_IN) return NextResponse.json({ error: "사진은 10MB까지 올릴 수 있어요" }, { status: 413 });
    const input = new Uint8Array(await file.arrayBuffer());
    if (!looksLikeImage(input)) return NextResponse.json({ error: "사진 파일만 올릴 수 있어요" }, { status: 415 });
    let out: Buffer;
    try {
      out = await sharp(input, { limitInputPixels: 40_000_000 }).rotate()
        .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    } catch {
      return NextResponse.json({ error: "사진을 읽지 못했어요. 다른 사진을 골라 주세요" }, { status: 415 });
    }
    photo_path = `${actor}/${crypto.randomUUID()}.webp`;
    const { error: upErr } = await sb.storage.from(BUCKET).upload(photo_path, out, { contentType: "image/webp", upsert: false });
    if (upErr) { console.error("신고 사진 올리기:", upErr.message); return NextResponse.json({ error: "사진을 올리지 못했어요. 다시 시도해 주세요" }, { status: 500 }); }
  }

  // 처리 중인 같은 신고가 있으면 그 줄을 고쳐 쓴다 (사진은 새로 올렸을 때만 바꾼다)
  const { data: open, error: oErr } = await sb.from("product_reports").select("id, photo_path")
    .eq("product_id", id).eq("reporter_id", actor).eq("kind", kind).in("status", ["new", "checking"]).maybeSingle();
  if (oErr) { console.error("신고 읽기:", oErr.message); return NextResponse.json({ error: "신고를 보내지 못했어요. 다시 시도해 주세요" }, { status: 500 }); }
  if (open) {
    const patch: Record<string, unknown> = { claimed: claimed ?? null, note: note || null, created_at: new Date().toISOString() };
    if (photo_path) patch.photo_path = photo_path;
    const { error } = await sb.from("product_reports").update(patch).eq("id", open.id);
    if (error) { console.error("신고 고쳐 쓰기:", error.message); return NextResponse.json({ error: "신고를 보내지 못했어요. 다시 시도해 주세요" }, { status: 500 }); }
    if (photo_path && open.photo_path) {
      const { error: rmErr } = await sb.storage.from(BUCKET).remove([open.photo_path]);
      if (rmErr) console.error("예전 신고 사진 지우기:", rmErr.message); // ds-allow: 덤 정리 — 신고는 이미 고쳐 썼다
    }
    return NextResponse.json({ ok: true, again: true });
  }
  const { error } = await sb.from("product_reports").insert({ product_id: id, reporter_id: actor, kind, claimed, note: note || null, photo_path });
  if (error) {
    // 동시에 두 번 눌러 고유 키에 걸린 경우 — 이미 받은 신고다
    if (error.code === "23505") return NextResponse.json({ ok: true, again: true });
    console.error("신고 넣기:", error.message);
    return NextResponse.json({ error: "신고를 보내지 못했어요. 다시 시도해 주세요" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
