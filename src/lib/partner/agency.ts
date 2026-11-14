/**
 * 대행 연동 — 오늘끼록이 업체 대신 올린 엑셀 (v3 10.6). 서버 전용.
 * 올린 줄은 partner_agency_uploads 에 기다리고, 업체가 '반영하기'를 누르면 ingestRows("agency") 로 들어간다.
 * 반영은 waiting → confirmed 를 조건부로 바꾼 쪽만 한다 (두 번 눌러도 한 번만 들어간다).
 * 요금: 옮겨 적은 상품(미리보기의 바로 반영 + 검수 줄, 오류 줄 뺌) × AGENCY_PRICE_PER_ITEM 원 — 반영을 차지한 쪽이 충전금에서 한 번에 뺀다.
 *   충전금이 모자라면 하나도 빼지 않고 기다림으로 돌린다. 반영하다 멈추면 돌려주고 기다림으로 돌린다. 예시 파일·예시 업체는 0원.
 */
import { ingestRows, type IngestResult, type Partner } from "./ingest";
import { creditBalance } from "./crm";
import { AGENCY_PRICE_PER_ITEM } from "./rates";

/** 예시로 채워 보기가 만드는 대행 파일 이름 (lib/partner/demo.ts) — 요금을 받지 않는다 */
export const AGENCY_EXAMPLE_FILE = "예시_대행_목록.xlsx";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export type AgencyUpload = {
  id: string; file_name: string | null; row_count: number; note: string | null; status: "waiting" | "confirmed" | "returned" | "canceled";
  preview: { ok: number; review: number; error: number; errors: { row: number; sku?: string; field?: string; message: string }[] };
  created_at: string; decided_at: string | null; decided_note: string | null; batch_id: string | null;
  /** 반영할 때 낸 금액 (반영 전 0) */
  fee: number;
};
export const AGENCY_COLS = "id, file_name, row_count, note, status, preview, created_at, decided_at, decided_note, batch_id, fee";

/** 반영하면 낼 상품 수·금액 — 미리보기의 바로 반영 + 검수 줄 */
export function agencyFee(u: { file_name: string | null; preview: Partial<AgencyUpload["preview"]> | null }, partner: { is_demo?: boolean | null }) {
  const items = Math.max(0, (Number(u.preview?.ok) || 0) + (Number(u.preview?.review) || 0));
  const unit = partner.is_demo || u.file_name === AGENCY_EXAMPLE_FILE ? 0 : AGENCY_PRICE_PER_ITEM;
  return { items, unit, amount: items * unit };
}

export async function listAgency(sb: Sb, partnerId: string): Promise<AgencyUpload[]> {
  const { data, error } = await sb.from("partner_agency_uploads").select(AGENCY_COLS).eq("partner_id", partnerId)
    .order("created_at", { ascending: false }).limit(20);
  if (error) throw new Error(error.message);
  return data || [];
}

type Decide = { ok: true; result?: IngestResult; fee?: number } | { ok: false; status: number; message: string };
const won = (v: number) => `${v.toLocaleString("ko-KR")}원`;

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
    .eq("id", id).eq("partner_id", partner.id).eq("status", "waiting").select("id, rows, file_name, preview");
  if (error) throw new Error(error.message);
  const up = data?.[0];
  if (!up) return { ok: false, status: 409, message: "이미 처리한 파일이에요. 새로 불러와 주세요" };
  // 반영하다 멈추거나 요금을 내지 못하면 다시 누를 수 있게 기다림으로 돌린다
  const reopen = async () => {
    const { error: rErr } = await sb.from("partner_agency_uploads").update({ status: "waiting", decided_by: null, decided_at: null }).eq("id", id).eq("status", "confirmed").is("batch_id", null);
    if (rErr) console.error("대행 파일을 기다림으로 돌리지 못했어요:", id, rErr.message);
  };
  const fee = agencyFee(up, partner);
  if (fee.amount > 0) {
    let paid = 0;
    try {
      const { data: n, error: tErr } = await sb.rpc("partner_credit_take", {
        p_partner: partner.id, p_unit: fee.unit, p_want: fee.items, p_all: true, p_note: `대행 연동 {n}개 × ${fee.unit}원 · ${up.file_name || "대신 올린 파일"}`,
      });
      if (tErr) throw new Error(tErr.message);
      paid = Number(n) || 0;
    } catch (e) { await reopen(); throw e; }
    if (paid < fee.items) {
      await reopen();
      const { balance } = await creditBalance(sb, partner.id);
      return { ok: false, status: 402, message: `충전금이 모자라요. ${won(fee.amount)}이 필요한데 잔액은 ${won(balance)}이에요. 마케팅 > 광고에서 충전한 뒤 반영해 주세요` };
    }
  }
  try {
    const result = await ingestRows(sb, partner, up.rows, "agency", up.file_name, userId);
    const { error: bErr } = await sb.from("partner_agency_uploads").update({ batch_id: result.batch_id, fee: fee.amount }).eq("id", id);
    if (bErr) console.error("대행 기록에 올린 기록을 잇지 못했어요:", id, bErr.message);
    return { ok: true, result, fee: fee.amount };
  } catch (e) {
    if (fee.amount > 0) {
      const { error: gErr } = await sb.from("partner_credit_ledger").insert({ partner_id: partner.id, kind: "release", amount: fee.amount, status: "confirmed", note: `반영하지 못한 대행 연동 돌려놓음 · ${up.file_name || "대신 올린 파일"}` });
      if (gErr) console.error("대행 연동 요금을 돌려놓지 못했어요:", id, fee.amount, gErr.message);
    }
    await reopen();
    throw e;
  }
}
