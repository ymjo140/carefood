/**
 * 입점 신청 (vendor_applications) — 신청 화면·신청 API·관리자 화면이 같이 쓴다(서버 전용 import 없음).
 *  · 업종은 업체 유형과 같은 세 가지 — 신청을 그대로 업체로 만들 수 있게.
 *  · 상태: pending(새 신청) → contacted(연락함) → approved(업체로 만듦) | rejected(입점하지 않음, 이유를 남김)
 */
export const APPLY_KINDS = [
  { key: "meal_service", label: "식단 서비스", desc: "정기배송 도시락·밀프렙" },
  { key: "brand", label: "식품 브랜드", desc: "직접 만드는 가공식품·간식·음료" },
  { key: "mall", label: "유통·몰", desc: "여러 브랜드 제품을 파는 몰" },
] as const;
export type ApplyKind = (typeof APPLY_KINDS)[number]["key"];
export const APPLY_KIND_LABEL: Record<string, string> = {
  ...Object.fromEntries(APPLY_KINDS.map((k) => [k.key, k.label])),
  // 예전 신청 화면의 업종 (11/14 전)
  supplement: "건강기능식품(예전 업종)", grocery: "식재료·가공식품(예전 업종)", bakery: "베이커리·간식(예전 업종)",
};

export const APPLICATION_STATUS = ["pending", "contacted", "approved", "rejected"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUS)[number];
export const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = { pending: "새 신청", contacted: "연락함", approved: "업체로 만듦", rejected: "입점하지 않음" };
/** 바꿀 수 있는 다음 상태 — 끝난 신청(approved·rejected)은 다시 열지 않는다 */
export const NEXT_STATUS: Record<ApplicationStatus, ApplicationStatus[]> = {
  pending: ["contacted", "approved", "rejected"], contacted: ["approved", "rejected"], approved: [], rejected: [],
};

export type Application = {
  company_name: string; representative: string; email: string; phone: string | null; website: string | null;
  business_number: string | null; business_type: ApplyKind; product_count: number | null; message: string | null;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const text = (v: unknown, max: number) => { const s = String(v ?? "").trim(); return s ? s.slice(0, max) : null; };

/** 신청 값 읽기 — 고칠 칸이 있으면 { error, field } */
export function parseApplication(b: Record<string, unknown> | null | undefined): { ok: true; value: Application } | { ok: false; field: string; error: string } {
  const company = text(b?.company_name, 60), rep = text(b?.representative, 40), email = text(b?.email, 120);
  if (!company) return { ok: false, field: "company_name", error: "업체명을 적어 주세요" };
  if (!rep) return { ok: false, field: "representative", error: "담당자명을 적어 주세요" };
  if (!email || !EMAIL.test(email)) return { ok: false, field: "email", error: "답을 받을 이메일을 적어 주세요" };
  const kind = APPLY_KINDS.find((k) => k.key === b?.business_type)?.key;
  if (!kind) return { ok: false, field: "business_type", error: "업종을 골라 주세요" };
  const website = text(b?.website, 200);
  if (website && !/^https?:\/\/[^\s.]+\.[^\s]+$/i.test(website)) return { ok: false, field: "website", error: "웹사이트는 https:// 로 시작하는 주소로 적어 주세요" };
  const biz = text(b?.business_number, 20);
  if (biz && biz.replace(/\D/g, "").length !== 10) return { ok: false, field: "business_number", error: "사업자등록번호 10자리를 적어 주세요" };
  const rawCount = b?.product_count;
  const count = rawCount === null || rawCount === undefined || rawCount === "" ? null : Math.floor(Number(rawCount));
  if (count !== null && (!Number.isFinite(count) || count < 1 || count > 100000)) return { ok: false, field: "product_count", error: "제품 수는 1 이상의 숫자로 적어 주세요" };
  const phone = text(b?.phone, 20);
  if (phone && phone.replace(/\D/g, "").length < 9) return { ok: false, field: "phone", error: "연락처를 숫자로 적어 주세요" };
  return {
    ok: true,
    value: {
      company_name: company, representative: rep, email: email.toLowerCase(), phone, website, business_type: kind,
      business_number: biz ? biz.replace(/\D/g, "").replace(/^(\d{3})(\d{2})(\d{5})$/, "$1-$2-$3") : null,
      product_count: count, message: text(b?.message, 2000),
    },
  };
}

/** 신청 업체명 → 업체 영문 이름 후보 (관리자가 고친다) */
export function slugHint(website: string | null): string {
  const host = /^https?:\/\/(?:www\.)?([^/.:?#]+)/i.exec(website || "")?.[1]?.toLowerCase() || "";
  return /^[a-z0-9][a-z0-9-]{1,39}$/.test(host) ? host : "";
}
