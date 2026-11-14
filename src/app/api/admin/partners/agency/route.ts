import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { adminOnly, getAdminUser } from "@/lib/actor-server";
import { readWorkbook } from "@/lib/partner/excel";
import { previewRows } from "@/lib/partner/demo";
import { notReady } from "@/lib/partner/crm";
import { limitRequest } from "@/lib/rate-limit";

/**
 * 관리자 — 대행 연동 (v3 10.6)
 * GET  → {ready, uploads} 최근 40개 (업체 이름과 함께)
 * POST multipart {slug, file(.xlsx), note?} — 업체 대신 올린다. 바로 반영하지 않고 업체가 '반영하기'를 눌러야 들어간다
 */
type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function GET() {
  await connection();
  const denied = await adminOnly(); if (denied) return denied;
  const sb = createServiceRoleClient() as Sb;
  const { data, error } = await sb.from("partner_agency_uploads")
    .select("id, file_name, row_count, note, status, preview, created_at, decided_at, decided_note, partners(name, slug)")
    .order("created_at", { ascending: false }).limit(40);
  if (error) return notReady(error) ? NextResponse.json({ ready: false, uploads: [] }) : bad(error.message, 500);
  return NextResponse.json({ ready: true, uploads: data || [] });
}

export async function POST(req: NextRequest) {
  await connection();
  const limited = await limitRequest(req, "upload");
  if (limited) return limited;
  const admin = await getAdminUser();
  if (!admin) return bad("관리자만 대신 올릴 수 있어요", 403);
  let form: FormData;
  try { form = await req.formData(); } catch { return bad("파일을 받지 못했어요"); }
  const slug = String(form.get("slug") || "").trim();
  const note = String(form.get("note") || "").trim().slice(0, 500) || null;
  const file = form.get("file");
  if (!slug) return bad("업체를 골라 주세요");
  if (!(file instanceof File) || !/\.xlsx$/i.test(file.name)) return bad("오늘끼록 양식(.xlsx)으로 올려 주세요");
  if (file.size > 5 * 1024 * 1024) return bad("5MB 까지 올릴 수 있어요. 나눠서 올려 주세요", 413);
  const sb = createServiceRoleClient() as Sb;
  const { data: partner, error: pErr } = await sb.from("partners").select("id, kind").eq("slug", slug).maybeSingle();
  if (pErr) return bad(pErr.message, 500);
  if (!partner) return bad("업체를 찾지 못했어요", 404);
  let rows;
  try { rows = (await readWorkbook(await file.arrayBuffer())).rows; }
  catch (e) { return bad((e as Error).message || "엑셀을 읽지 못했어요"); }
  if (rows.length === 0) return bad("'제품' 시트 3행부터 제품을 적어 주세요");
  if (rows.length > 2000) return bad("한 번에 2,000줄까지 올릴 수 있어요");
  const preview = previewRows(rows, partner.kind);
  const { data, error } = await sb.from("partner_agency_uploads").insert({
    partner_id: partner.id, file_name: file.name.slice(0, 120), rows, row_count: rows.length, preview, note, created_by: admin.id,
  }).select("id").single();
  if (error) return bad(error.message, 500);
  return NextResponse.json({ id: data.id, rows: rows.length, preview });
}
