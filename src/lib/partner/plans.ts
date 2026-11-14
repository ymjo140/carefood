/**
 * 기획 — 수요 빈틈(조건)을 보고 업체가 정한 "만들 제품" (v3 10.5 고도화). 서버 전용.
 * 기획 중 → 만드는 중 → 출시, 또는 접음. 협업 제안은 기획에 묶여(partner_collabs.plan_id) 협업 관리에서 기획별로 본다.
 * 이름·메모는 효능 표현 점검(claims)을 거친다 — 성분 조건만.
 */
import { checkClaimsWith } from "./claims";
import { loadClaimTerms } from "./claims-server";
import { SEGMENTS } from "./demand";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
export const PLAN_STATUS = ["planning", "making", "launched", "dropped"] as const;
export type PlanStatus = (typeof PLAN_STATUS)[number];
const MAX_OPEN = 30;

export type Plan = {
  id: string; segment: string; segment_label: string; rule: string; name: string; note: string | null; target_price: number | null;
  status: PlanStatus; created_at: string; updated_at: string;
};

const segOf = (key: string) => SEGMENTS.find((s) => s.key === key);

export async function listPlans(sb: Sb, partnerId: string): Promise<Plan[]> {
  const { data, error } = await sb.from("partner_plans").select("id, segment, name, note, target_price, status, created_at, updated_at")
    .eq("partner_id", partnerId).order("created_at", { ascending: false }).limit(100);
  if (error) throw new Error(error.message);
  return ((data || []) as Omit<Plan, "segment_label" | "rule">[]).map((p) => ({ ...p, segment_label: segOf(p.segment)?.label || p.segment, rule: segOf(p.segment)?.rule || "" }));
}

type Input = { segment?: string; name?: string; note?: string | null; target_price?: number | null };
type Result = { ok: true; id: string } | { ok: false; status: number; message: string };

async function check(sb: Sb, name: string, note: string | null, price: number | null): Promise<string | null> {
  if (name.length < 2 || name.length > 40) return "기획 이름은 2~40자로 적어 주세요";
  if (note && note.length > 300) return "메모는 300자까지 적을 수 있어요";
  if (price !== null && (!Number.isInteger(price) || price < 0 || price > 10_000_000)) return "목표 가격을 다시 확인해 주세요";
  const hits = checkClaimsWith(await loadClaimTerms(sb), name, note || "");
  if (hits.length) return `쓸 수 없는 표현이 있어요: ${hits.map((h) => h.phrase).join(", ")}`;
  return null;
}

/** 기획 저장 — 같은 조건에 진행 중(기획 중·만드는 중)인 기획이 있어도 여러 개 둘 수 있다. 진행 중은 30개까지 */
export async function createPlan(sb: Sb, partnerId: string, input: Input, userId: string): Promise<Result> {
  const seg = segOf(String(input.segment || ""));
  if (!seg) return { ok: false, status: 400, message: "조건을 다시 골라 주세요" };
  const name = String(input.name || "").trim(), note = String(input.note || "").trim() || null;
  const price = input.target_price === null || input.target_price === undefined || (input.target_price as unknown) === "" ? null : Number(input.target_price);
  const bad = await check(sb, name, note, price);
  if (bad) return { ok: false, status: 400, message: bad };
  const { count, error: cErr } = await sb.from("partner_plans").select("id", { count: "exact", head: true }).eq("partner_id", partnerId).in("status", ["planning", "making"]);
  if (cErr) throw new Error(cErr.message);
  if ((count || 0) >= MAX_OPEN) return { ok: false, status: 429, message: `진행 중인 기획은 ${MAX_OPEN}개까지 둘 수 있어요. 끝난 기획을 출시나 접음으로 바꿔 주세요` };
  const { data, error } = await sb.from("partner_plans").insert({ partner_id: partnerId, segment: seg.key, name, note, target_price: price, created_by: userId }).select("id").single();
  if (error) throw new Error(error.message);
  return { ok: true, id: data.id };
}

/** 기획 고치기 — 상태 바꾸기 또는 이름·메모·목표 가격. 내 업체 것만 */
export async function updatePlan(sb: Sb, partnerId: string, id: string, input: Input & { status?: string }): Promise<Result> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.status !== undefined) {
    if (!(PLAN_STATUS as readonly string[]).includes(input.status)) return { ok: false, status: 400, message: "상태를 다시 골라 주세요" };
    patch.status = input.status;
  }
  if (input.name !== undefined) {
    const name = String(input.name).trim(), note = String(input.note || "").trim() || null;
    const price = input.target_price === null || input.target_price === undefined || (input.target_price as unknown) === "" ? null : Number(input.target_price);
    const bad = await check(sb, name, note, price);
    if (bad) return { ok: false, status: 400, message: bad };
    Object.assign(patch, { name, note, target_price: price });
  }
  const { data, error } = await sb.from("partner_plans").update(patch).eq("id", id).eq("partner_id", partnerId).select("id");
  if (error) throw new Error(error.message);
  return data?.length ? { ok: true, id } : { ok: false, status: 404, message: "기획을 찾지 못했어요" };
}
