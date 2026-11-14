/**
 * 대행 연동 — 오늘끼록이 업체 대신 올린 엑셀 (v3 10.6). 서버 전용.
 * 올린 줄은 partner_agency_uploads 에 기다리고, 업체가 '반영하기'를 누르면 ingestRows("agency") 로 들어간다.
 * 반영은 waiting → confirmed 를 조건부로 바꾼 쪽만 한다 (두 번 눌러도 한 번만 들어간다).
 */
import { ingestRows, type IngestResult, type Partner } from "./ingest";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export type AgencyUpload = {
  id: string; file_name: string | null; row_count: number; note: string | null; status: "waiting" | "confirmed" | "returned" | "canceled";
  preview: { ok: number; review: number; error: number; errors: { row: number; sku?: string; field?: string; message: string }[] };
  created_at: string; decided_at: string | null; decided_note: string | null; batch_id: string | null;
};
export const AGENCY_COLS = "id, file_name, row_count, note, status, preview, created_at, decided_at, decided_note, batch_id";

export async function listAgency(sb: Sb, partnerId: string): Promise<AgencyUpload[]> {
  const { data, error } = await sb.from("partner_agency_uploads").select(AGENCY_COLS).eq("partner_id", partnerId)
    .order("created_at", { ascending: false }).limit(20);
  if (error) throw new Error(error.message);
  return data || [];
}

type Decide = { ok: true; result?: IngestResult } | { ok: false; status: number; message: string };

/** 업체가 반영하거나 돌려보낸다 */
export async function decideAgency(sb: Sb, partner: Partner, id: string, action: "confirm" | "return", note: string, userId: string): Promise<Decide> {
  const now = new Date().toISOString();
  if (action === "return") {
    if (note.length < 2) return { ok: false, status: 400, message: "돌려보내는 이유를 적어 주세요" };
    const { data, error } = await sb.from("partner_agency_uploads").update({ status: "returned", decided_by: userId, decided_at: now, decided_note: note.slice(0, 500) })
      .eq("id", id).eq("partner_id", partner.id).eq("status", "waiting").select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) return { ok: false, status: 409, message: "이미 처리한 파일이에요. 새로 불러와 주세요" };
    return { ok: true };
  }
  const { data, error } = await sb.from("partner_agency_uploads").update({ status: "confirmed", decided_by: userId, decided_at: now })
    .eq("id", id).eq("partner_id", partner.id).eq("status", "waiting").select("id, rows, file_name");
  if (error) throw new Error(error.message);
  const up = data?.[0];
  if (!up) return { ok: false, status: 409, message: "이미 처리한 파일이에요. 새로 불러와 주세요" };
  try {
    const result = await ingestRows(sb, partner, up.rows, "agency", up.file_name, userId);
    const { error: bErr } = await sb.from("partner_agency_uploads").update({ batch_id: result.batch_id }).eq("id", id);
    if (bErr) console.error("대행 기록에 올린 기록을 잇지 못했어요:", id, bErr.message);
    return { ok: true, result };
  } catch (e) {
    // 반영하다 멈추면 다시 누를 수 있게 기다림으로 돌린다
    const { error: rErr } = await sb.from("partner_agency_uploads").update({ status: "waiting", decided_by: null, decided_at: null }).eq("id", id).eq("status", "confirmed").is("batch_id", null);
    if (rErr) console.error("대행 파일을 기다림으로 돌리지 못했어요:", id, rErr.message);
    throw e;
  }
}
