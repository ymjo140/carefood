/**
 * 광고 수신 동의 2년 확인 안내 — 정보통신망법 제50조⑧, 시행령 제62조의3.
 * 동의한 날(또는 지난 안내)부터 2년이 되기 7일 전에, 보낸 곳 · 동의한 날 · 계속 받기/그만 받기 방법을 알린다.
 * 알림함에 30일 동안 보이고, 이 기기 알림이 켜져 있으면 푸시도 보낸다. 보낸 시각은 marketing_consents.confirmed_at 에 적는다.
 * 그대로 두면 계속 받고, 끄면 바로 대상에서 빠진다 (동의를 다시 받는 절차가 아니라 알리는 절차).
 */
type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const DAY = 86400e3;
const CYCLE_DAYS = 2 * 365 - 7;
const SHOW_DAYS = 30;

const kstDate = (iso: string) => new Date(Date.parse(iso) + 9 * 3600e3).toISOString().slice(0, 10).replace(/^(\d{4})-(\d{2})-(\d{2})$/, (_, y, m, d) => `${y}년 ${Number(m)}월 ${Number(d)}일`);
export const consentNoticeText = (adsAt: string) =>
  `${kstDate(adsAt)}에 케어푸드 앱에서 업체 소식(광고) 받기에 동의하셨어요. 계속 받으려면 그대로 두시면 되고, 그만 받으려면 마이 > 알림 설정에서 끌 수 있어요`;

/** 보낼 때가 된 사람에게 알리고 confirmed_at 을 적는다. 표가 없으면 0 */
export async function runConsentNotices(sb: Sb, push?: (userId: string, payload: { title: string; body: string; url: string; tag: string }) => Promise<boolean>) {
  const cut = new Date(Date.now() - CYCLE_DAYS * DAY).toISOString();
  const { data, error } = await sb.from("marketing_consents").select("user_id, ads_at")
    .eq("ads", true).lte("ads_at", cut).or(`confirmed_at.is.null,confirmed_at.lte.${cut}`).limit(500);
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return { sent: 0 };
    throw new Error(error.message);
  }
  let sent = 0;
  for (const r of (data || []) as { user_id: string; ads_at: string }[]) {
    // 먼저 적는다 — 푸시가 실패해도 알림함에는 들어가고, 같은 사람에게 거듭 보내지 않게
    const { error: uErr } = await sb.from("marketing_consents").update({ confirmed_at: new Date().toISOString() }).eq("user_id", r.user_id).eq("ads", true);
    if (uErr) throw new Error(uErr.message);
    sent++;
    if (push) {
      // ds-allow: 푸시는 덤 — 알림함에는 이미 들어갔다
      try { await push(r.user_id, { title: "업체 소식 받기 동의 확인", body: consentNoticeText(r.ads_at), url: "/me/notifications", tag: "consent-2y" }); } catch { /* 알림함으로 충분 */ }
    }
  }
  return { sent };
}

export type ConsentNotification = { id: string; type: "consent"; at: string; who: string; text: string; url: string };

/** 알림함 — 지난 30일 안에 보낸 2년 확인 안내 */
export async function consentNotifications(sb: Sb, actor: string): Promise<ConsentNotification[]> {
  const { data, error } = await sb.from("marketing_consents").select("ads, ads_at, confirmed_at").eq("user_id", actor).maybeSingle();
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return [];
    throw new Error(error.message);
  }
  if (!data?.ads || !data.confirmed_at || !data.ads_at) return [];
  if (Date.parse(data.confirmed_at) < Date.now() - SHOW_DAYS * DAY || Date.parse(data.confirmed_at) < Date.parse(data.ads_at)) return [];
  return [{ id: `consent-${data.confirmed_at}`, type: "consent", at: data.confirmed_at, who: "케어푸드", text: consentNoticeText(data.ads_at), url: "/me/notifications" }];
}
