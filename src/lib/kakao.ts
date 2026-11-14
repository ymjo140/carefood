/**
 * 카카오 로그인 — 서버에서만 쓴다. (랑데부와 같은 방식: 인가 코드 → 토큰 → 카카오 회원번호)
 * 동의항목은 받지 않는다. 회원번호만으로 계정을 잇고, 화면에 보일 이름은 앱이 만든 닉네임을 쓴다.
 * 계정 이메일은 kakao_<회원번호>@KAKAO_EMAIL_DOMAIN — 실제로 메일을 받지 않는 식별용 주소다.
 * 이 주소로 이메일 가입을 막고(auth/actions), 로그인 때 app_metadata.provider 가 kakao 인지 확인한다(미리 가입해 가로채기 방지).
 */
export const KAKAO_EMAIL_DOMAIN = "kakao.dailykkirok.com";
export const KAKAO_STATE_COOKIE = "kk_state";
export const kakaoEmail = (id: string) => `kakao_${id}@${KAKAO_EMAIL_DOMAIN}`;
export const isKakaoEmail = (email: string) => email.trim().toLowerCase().endsWith(`@${KAKAO_EMAIL_DOMAIN}`);

export function kakaoKey() {
  return process.env.KAKAO_REST_API_KEY || "";
}

/** 로그인 뒤 돌아갈 곳 — 이 사이트 안의 경로만 */
export function safeNext(p: string | null | undefined) {
  if (!p || !p.startsWith("/") || p.startsWith("//") || /[\\\u0000-\u001f]|%5c|%2f%2f/i.test(p)) return "/";
  try {
    const u = new URL(p, "https://local.invalid");
    return u.origin === "https://local.invalid" ? u.pathname + u.search + u.hash : "/";
  } catch { return "/"; }
}

export function authorizeUrl(redirectUri: string, state: string) {
  const q = new URLSearchParams({ client_id: kakaoKey(), redirect_uri: redirectUri, response_type: "code", state });
  return `https://kauth.kakao.com/oauth/authorize?${q}`;
}

/** 인가 코드 → 카카오 회원번호. 실패하면 카카오가 준 이유를 담아 던진다 */
export async function kakaoUserId(code: string, redirectUri: string): Promise<string> {
  const body = new URLSearchParams({ grant_type: "authorization_code", client_id: kakaoKey(), redirect_uri: redirectUri, code });
  if (process.env.KAKAO_CLIENT_SECRET) body.set("client_secret", process.env.KAKAO_CLIENT_SECRET);
  const t = await fetch("https://kauth.kakao.com/oauth/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" }, body, cache: "no-store",
  });
  const tok = await t.json().catch(() => ({}));
  if (!t.ok || !tok.access_token) throw new Error(`token ${t.status} ${tok.error_code || tok.error || ""} ${tok.error_description || ""}`.trim());
  const u = await fetch("https://kapi.kakao.com/v2/user/me", { headers: { Authorization: `Bearer ${tok.access_token}` }, cache: "no-store" });
  const me = await u.json().catch(() => ({}));
  if (!u.ok || !me.id) throw new Error(`me ${u.status} ${me.code || ""} ${me.msg || ""}`.trim());
  return String(me.id);
}
