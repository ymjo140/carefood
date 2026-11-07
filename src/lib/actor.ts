/**
 * 기록 주인(actor) — 서버가 정한다
 *
 * 브라우저가 보내는 user_id 는 믿지 않는다. proxy 가 서명한 쿠키(cf_uid = "<id>.<서명>")를 발급하고,
 * API 는 그 쿠키에서만 사용자를 꺼낸다. 로그인하면 계정에 묶인 id 로 쿠키를 바꿔 다른 기기에서도 같은 기록을 본다.
 *
 * 쿠키는 httpOnly 가 아니다 — 화면이 "내 글인지" 비교하려고 id 를 읽는다. 서명이 있어 고쳐 쓸 수 없다.
 * 서명 키: SESSION_SECRET (없으면 SUPABASE_SERVICE_ROLE_KEY 에서 파생)
 */
export const ACTOR_COOKIE = "cf_uid";
export const ACTOR_MAX_AGE = 400 * 24 * 3600; // 브라우저가 허용하는 최대

const enc = new TextEncoder();
let keyPromise: Promise<CryptoKey> | null = null;

function secret() {
  const s = process.env.SESSION_SECRET || (process.env.SUPABASE_SERVICE_ROLE_KEY ? `carefood-actor-v1:${process.env.SUPABASE_SERVICE_ROLE_KEY}` : "");
  if (!s) throw new Error("SESSION_SECRET 또는 SUPABASE_SERVICE_ROLE_KEY 가 필요해요");
  return s;
}

function key() {
  keyPromise ||= crypto.subtle.importKey("raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return keyPromise;
}

function b64url(bytes: ArrayBuffer | Uint8Array) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function mac(id: string) {
  return b64url(await crypto.subtle.sign("HMAC", await key(), enc.encode(id))).slice(0, 32);
}

/** 새 기록 주인 id — u_ + 무작위 128비트 */
export function newActorId() {
  return "u_" + b64url(crypto.getRandomValues(new Uint8Array(16)));
}

export async function signActor(id: string) {
  return `${id}.${await mac(id)}`;
}

/** 쿠키 값 → id (서명이 맞을 때만) */
export async function verifyActor(value: string | undefined | null): Promise<string | null> {
  if (!value) return null;
  const i = value.lastIndexOf(".");
  if (i <= 0) return null;
  const id = value.slice(0, i), sig = value.slice(i + 1);
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(id)) return null;
  const want = await mac(id);
  if (want.length !== sig.length) return null;
  let diff = 0;
  for (let k = 0; k < want.length; k++) diff |= want.charCodeAt(k) ^ sig.charCodeAt(k);
  return diff === 0 ? id : null;
}

export const actorCookieOptions = {
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  httpOnly: false,
  maxAge: ACTOR_MAX_AGE,
};
