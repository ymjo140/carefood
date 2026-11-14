/**
 * 업체 설정 — 업체 정보·세금계산서 메일·정산 계좌, 담당자 목록, 내 새 주문 알림. 서버 전용 (11/14 구조 진단 3b).
 *  · 업체 정보·계좌는 대표(owner)만 고친다. 담당자(editor)는 보기만, 관리자 보기는 읽기 전용.
 *  · 계좌 번호는 업체 화면에 끝 4자리만 보인다(고칠 때는 처음부터 다시 적는다). 케어푸드 지급 대기열(관리자)에서만 전체가 보인다.
 *  · 이름·업체 유형·수수료율은 케어푸드가 정한다 — 여기서 고치지 않는다.
 *  · 새 주문 알림은 담당자마다 켜고 끈다(내 것만).
 */
type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export type PartnerSettings = {
  name: string; slug: string; kind: string;
  business_number: string | null; contact_email: string | null; contact_phone: string | null; website_url: string | null; tax_email: string | null;
  bank: { name: string | null; holder: string | null; account_last4: string | null };
  updated_at: string | null;
  members: { email: string | null; role: "owner" | "editor"; me: boolean; notify_orders: boolean }[];
  me: { notify_orders: boolean } | null;
};

const COLS = "name, slug, kind, business_number, contact_email, contact_phone, website_url, tax_email, bank_name, bank_holder, bank_account, settings_updated_at";
const last4 = (acc: string | null) => (acc ? acc.replace(/\D/g, "").slice(-4) || null : null);

export async function loadSettings(sb: Sb, partnerId: string, userId: string | null): Promise<PartnerSettings> {
  const [p, m] = await Promise.all([
    sb.from("partners").select(COLS).eq("id", partnerId).single(),
    sb.from("partner_members").select("email, role, auth_user_id, notify_orders, created_at").eq("partner_id", partnerId).order("created_at"),
  ]);
  if (p.error) throw new Error(p.error.message);
  if (m.error) throw new Error(m.error.message);
  const d = p.data;
  const members = ((m.data || []) as { email: string | null; role: "owner" | "editor"; auth_user_id: string; notify_orders: boolean }[])
    .map((x) => ({ email: x.email, role: x.role, me: !!userId && x.auth_user_id === userId, notify_orders: x.notify_orders }));
  const mine = members.find((x) => x.me);
  return {
    name: d.name, slug: d.slug, kind: d.kind, business_number: d.business_number, contact_email: d.contact_email, contact_phone: d.contact_phone,
    website_url: d.website_url, tax_email: d.tax_email, bank: { name: d.bank_name, holder: d.bank_holder, account_last4: last4(d.bank_account) },
    updated_at: d.settings_updated_at, members, me: mine ? { notify_orders: mine.notify_orders } : null,
  };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** 고칠 값 검사 → 저장할 칸. 빈 글자는 지우기(null). bank_account 를 보내지 않으면 계좌는 그대로 */
export function parseSettings(b: Record<string, unknown>): { patch: Record<string, string | null> } | { error: string } {
  const t = (k: string, max: number) => (b[k] === undefined ? undefined : String(b[k] ?? "").trim().slice(0, max));
  const patch: Record<string, string | null> = {};
  const bn = t("business_number", 20);
  if (bn !== undefined) {
    const digits = bn.replace(/\D/g, "");
    if (bn && digits.length !== 10) return { error: "사업자 등록 번호는 숫자 10자리예요" };
    patch.business_number = bn ? `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}` : null;
  }
  for (const k of ["contact_email", "tax_email"]) {
    const v = t(k, 120);
    if (v === undefined) continue;
    if (v && !EMAIL.test(v)) return { error: k === "tax_email" ? "세금계산서 받을 메일을 다시 확인해 주세요" : "담당 메일을 다시 확인해 주세요" };
    patch[k] = v ? v.toLowerCase() : null;
  }
  const phone = t("contact_phone", 20);
  if (phone !== undefined) {
    const digits = phone.replace(/\D/g, "");
    if (phone && !/^0\d{8,10}$/.test(digits)) return { error: "연락처를 다시 확인해 주세요" };
    patch.contact_phone = phone ? digits : null;
  }
  const url = t("website_url", 300);
  if (url !== undefined) {
    if (url && !/^https:\/\/[^\s]+\.[^\s]+$/i.test(url)) return { error: "누리집 주소는 https:// 로 시작해 주세요" };
    patch.website_url = url || null;
  }
  const bankName = t("bank_name", 30), holder = t("bank_holder", 40), acc = t("bank_account", 30);
  if (bankName !== undefined) patch.bank_name = bankName || null;
  if (holder !== undefined) patch.bank_holder = holder || null;
  if (acc !== undefined) {
    const digits = acc.replace(/[\s-]/g, "");
    if (acc && !/^\d{8,20}$/.test(digits)) return { error: "계좌 번호는 숫자 8~20자리로 적어 주세요" };
    patch.bank_account = acc ? digits : null;
  }
  return { patch };
}

export async function saveSettings(sb: Sb, partnerId: string, userId: string, patch: Record<string, string | null>): Promise<void> {
  if (Object.keys(patch).length === 0) return;
  const { error } = await sb.from("partners").update({ ...patch, settings_updated_at: new Date().toISOString(), settings_updated_by: userId, updated_at: new Date().toISOString() }).eq("id", partnerId);
  if (error) throw new Error(error.message);
}

/** 내 새 주문 알림 켜기·끄기 */
export async function setNotify(sb: Sb, partnerId: string, userId: string, on: boolean): Promise<void> {
  const { data, error } = await sb.from("partner_members").update({ notify_orders: on }).eq("partner_id", partnerId).eq("auth_user_id", userId).select("partner_id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("이 업체의 담당자가 아니에요");
}
