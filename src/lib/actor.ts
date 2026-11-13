/**
 * 기록 주인(actor) — 서버가 정한다
 *
 * 브라우저가 보내는 user_id 는 믿지 않는다. proxy 가 서명한 쿠키(cf_uid = "<id>.<서명>")를 발급하고,
 * API 는 그 쿠키에서만 사용자를 꺼낸다. 로그인하면 계정에 묶인 id 로 쿠키를 바꿔 다른 기기에서도 같은 기록을 본다.
 *
 * cf_uid 는 httpOnly(스크립트가 못 읽음). 화면이 "내 글인지" 비교할 id 는 따로 cf_me(서명 없는 id)로 내려준다 —
 * 서버는 cf_me 를 믿지 않는다.
 * 서명 키: SESSION_SECRET (없으면 SUPABASE_SERVICE_ROLE_KEY 에서 파생 — 개발용)
 * 서명 키를 바꿀 때: 옛 키를 SESSION_SECRET_PREVIOUS 에 두면 옛 서명 쿠키도 받아들이고, proxy 가 새 키로 다시 서명해 준다.
 *   (쿠키가 무효가 되면 로그인하지 않은 사람은 자기 기록을 잃는다.) 다들 한 번씩 들어온 뒤(두어 달) SESSION_SECRET_PREVIOUS 를 지운다.
 */
export const ACTOR_COOKIE = "cf_uid";
export const ACTOR_ID_COOKIE = "cf_me";
export const ACTOR_MAX_AGE = 400 * 24 * 3600; // 브라우저가 허용하는 최대

const enc = new TextEncoder();
let keyPromise: Promise<CryptoKey> | null = null;
let prevKeysPromise: Promise<CryptoKey[]> | null = null;

export function hasActorSecret() {
  return !!(process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function secret() {
  const s = process.env.SESSION_SECRET || (process.env.SUPABASE_SERVICE_ROLE_KEY ? `carefood-actor-v1:${process.env.SUPABASE_SERVICE_ROLE_KEY}` : "");
  if (!s) throw new Error("SESSION_SECRET 또는 SUPABASE_SERVICE_ROLE_KEY 가 필요해요");
  return s;
}

const hmacKey = (s: string) => crypto.subtle.importKey("raw", enc.encode(s), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);

function key() {
  keyPromise ||= hmacKey(secret());
  return keyPromise;
}

const PREFIX = "carefood-actor-v1:";
/** 손으로 넣은 옛 키 값 다듬기 — 따옴표·띄어쓰기를 걷고, 앞말이 빠졌으면 붙인다 */
function normalizePrevious(v: string | undefined) {
  let s = (v || "").trim().replace(/^["']|["']$/g, "").trim();
  if (!s) return "";
  if (s.startsWith(PREFIX)) s = PREFIX + s.slice(PREFIX.length).trim();
  else if (/^(eyJ|sb_secret_)/.test(s)) s = PREFIX + s;
  return s;
}
/** JWT 의 role 만 (서명은 보지 않는다 — 진단용) */
function jwtRole(t: string) {
  try { return JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role || "?"; } catch { return "?"; } // ds-allow: 진단 문구용
}

/**
 * 바꾸기 전 서명 키들 (옮겨 가는 동안만) — SESSION_SECRET_PREVIOUS, 그리고 SESSION_SECRET 이 없던 때처럼
 * service_role 키에서 파생한 값. (service_role 키를 새 secret 키로 바꾸면 뒤엣것은 저절로 달라지므로 앞엣것이 있어야 한다)
 */
function prevKeys() {
  const derived = process.env.SUPABASE_SERVICE_ROLE_KEY ? `${PREFIX}${process.env.SUPABASE_SERVICE_ROLE_KEY}` : "";
  const previous = normalizePrevious(process.env.SESSION_SECRET_PREVIOUS);
  const list = [...new Set([previous, derived])].filter((s) => s && s !== secret());
  if (!prevKeysPromise && process.env.SESSION_SECRET) {
    // 키를 옮기기 전에 확인할 수 있게 — 값은 남기지 않고 맞는지만 (서버 로그)
    const raw = process.env.SESSION_SECRET_PREVIOUS || "";
    const keyPart = previous.replace(PREFIX, "");
    const hint = [
      `앞말 ${raw.trim().startsWith(PREFIX) ? "있음" : "없음"}`,
      `키 모양 ${keyPart.startsWith("eyJ") ? "legacy(JWT)" : keyPart.startsWith("sb_secret_") ? "새 secret" : keyPart.startsWith("sb_publishable_") ? "publishable" : "알 수 없음"}`,
      `키 역할 ${/^eyJ/.test(keyPart) ? jwtRole(keyPart) : "-"}`,
      `길이 ${keyPart.length === (process.env.SUPABASE_SERVICE_ROLE_KEY || "").length ? "같음" : "다름"}`,
    ].join(" · ");
    console.info(`[actor] SESSION_SECRET_PREVIOUS: ${!previous ? "없음" : previous === derived ? "지금 service_role 키와 맞음" : `지금 service_role 키와 다름 (${hint})`}`);
  }
  prevKeysPromise ||= Promise.all(list.map(hmacKey));
  return prevKeysPromise;
}

function b64url(bytes: ArrayBuffer | Uint8Array) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function mac(id: string, k?: CryptoKey) {
  return b64url(await crypto.subtle.sign("HMAC", k || (await key()), enc.encode(id))).slice(0, 32);
}

function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let k = 0; k < a.length; k++) diff |= a.charCodeAt(k) ^ b.charCodeAt(k);
  return diff === 0;
}

/** 새 기록 주인 id — u_ + 무작위 128비트 */
export function newActorId() {
  return "u_" + b64url(crypto.getRandomValues(new Uint8Array(16)));
}

export async function signActor(id: string) {
  return `${id}.${await mac(id)}`;
}

/** 쿠키 값 → id 와, 옛 서명 키로 서명된 것인지 (다시 서명해야 하는지) */
export async function checkActor(value: string | undefined | null): Promise<{ id: string; stale: boolean } | null> {
  if (!value) return null;
  const i = value.lastIndexOf(".");
  if (i <= 0) return null;
  const id = value.slice(0, i), sig = value.slice(i + 1);
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(id)) return null;
  if (same(await mac(id), sig)) return { id, stale: false };
  for (const prev of await prevKeys()) if (same(await mac(id, prev), sig)) return { id, stale: true };
  return null;
}

/** 쿠키 값 → id (서명이 맞을 때만 — 옮겨 가는 동안은 옛 서명도) */
export async function verifyActor(value: string | undefined | null): Promise<string | null> {
  return (await checkActor(value))?.id ?? null;
}

export const actorCookieOptions = {
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  httpOnly: true,
  maxAge: ACTOR_MAX_AGE,
};

/** 화면용 id 쿠키 (스크립트가 읽음, 서버는 믿지 않음) */
export const actorIdCookieOptions = { ...actorCookieOptions, httpOnly: false };

/** 서명 쿠키 값 → id 부분 (서명 확인 없이 — 화면용 쿠키를 맞출 때만) */
export const idPart = (signed: string) => signed.slice(0, signed.lastIndexOf("."));
