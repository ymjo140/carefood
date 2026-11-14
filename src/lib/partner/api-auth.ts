/**
 * 입점 업체 API(v1) 인증 — Authorization: Bearer cf_live_…  서버 전용.
 * 키 원문은 저장하지 않는다(sha256 만). 멈춘 업체·폐기한 키는 401.
 */
import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import type { Partner } from "./ingest";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const PREFIX = "cf_live_";
export const MAX_KEYS = 5;
export const MAX_BODY = 2 * 1024 * 1024;

export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");
export function newKey() {
  const key = PREFIX + randomBytes(32).toString("base64url");
  return { key, key_prefix: key.slice(0, 12), key_hash: hashKey(key) };
}

/** API 오류 응답 — { error: { code, message }, errors? } */
export function apiError(status: number, code: string, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: { code, message }, ...(extra || {}) }, { status });
}

export type ApiContext = { sb: Sb; partner: Partner; keyId: string };

export async function apiAuth(req: NextRequest): Promise<ApiContext | NextResponse> {
  const m = (req.headers.get("authorization") || "").match(/^Bearer\s+(cf_live_[A-Za-z0-9_-]{20,80})$/);
  if (!m) return apiError(401, "unauthorized", "Authorization: Bearer <API 키> 헤더가 필요해요");
  const sb: Sb = createServiceRoleClient();
  const { data, error } = await sb.from("partner_api_keys")
    .select("id, last_used_at, revoked_at, partners(id, slug, name, kind, status)").eq("key_hash", hashKey(m[1])).maybeSingle();
  if (error) return apiError(500, "server_error", "키를 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요");
  if (!data || data.revoked_at || !data.partners) return apiError(401, "unauthorized", "쓸 수 없는 API 키예요");
  if (data.partners.status === "paused") return apiError(403, "partner_paused", "업체 계정이 멈춰 있어요. 오늘끼록에 문의해 주세요");
  try {
    const limited = await rateLimit(sb, req, `key:${data.id}`, "partner_api");
    if (limited) return apiError(429, "rate_limited", "요청이 너무 많아요. 키 하나에 1분 120번까지예요", undefined);
  } catch (e) { console.error("API 횟수 제한을 확인하지 못했어요 — 통과시켜요:", (e as Error).message); }
  // 마지막 사용 시각은 5분에 한 번만 고친다
  if (!data.last_used_at || Date.now() - Date.parse(data.last_used_at) > 300e3) {
    const { error: uErr } = await sb.from("partner_api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
    if (uErr) console.error("키 사용 시각을 남기지 못했어요:", uErr.message);
  }
  return { sb, partner: data.partners, keyId: data.id };
}

/** JSON 본문 읽기 — 2MB 까지 */
export async function readJson(req: NextRequest): Promise<{ body: unknown } | NextResponse> {
  let text: string;
  try { text = await req.text(); } catch { return apiError(400, "bad_request", "본문을 읽지 못했어요"); }
  if (text.length > MAX_BODY) return apiError(413, "too_large", "본문은 2MB 까지예요. 나눠서 보내 주세요");
  try { return { body: JSON.parse(text) }; } catch { return apiError(400, "bad_json", "JSON 형식이 맞지 않아요"); }
}
