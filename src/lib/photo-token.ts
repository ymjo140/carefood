import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * 사진으로 찾은 음식을 기록할 때 붙이는 표 — 서버에서만 쓴다.
 * /api/diary/photo 가 사진을 분석하면 이 사람 아이디로 서명한 표를 돌려주고,
 * /api/diary 는 표가 맞을 때만 기록의 source 를 'photo' 로 남긴다 ('사진과 함께 기록' 챌린지가 센다).
 * 사진 파일은 저장하지 않는다. 표는 2시간 동안 쓸 수 있다(한 사진에 음식이 여러 개일 수 있어 여러 번 써도 된다).
 */
const TTL_MS = 2 * 3600e3;

function key() {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!k) throw new Error("서명 키가 없어요");
  return `photo-token:${k}`;
}

const sign = (actor: string, ts: number) => createHmac("sha256", key()).update(`${actor}|${ts}`).digest("base64url");

export function photoToken(actor: string, now = Date.now()) {
  return `${now}.${sign(actor, now)}`;
}

export function photoTokenOk(actor: string, token: unknown, now = Date.now()) {
  if (typeof token !== "string" || token.length > 100) return false;
  const [tsRaw, mac] = token.split(".");
  const ts = Number(tsRaw);
  if (!Number.isSafeInteger(ts) || !mac || ts > now + 60e3 || now - ts > TTL_MS) return false;
  const want = Buffer.from(sign(actor, ts));
  const got = Buffer.from(mac);
  return want.length === got.length && timingSafeEqual(want, got);
}
