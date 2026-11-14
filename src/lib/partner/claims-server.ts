/**
 * 금지 표현 사전 불러오기 — DB partner_claim_terms 의 켜진 줄. 서버 전용.
 * 1분 동안 같은 서버 안에서 다시 쓴다. 표가 없거나 비었거나 못 읽으면 기본 사전(claims.ts DEFAULT_TERMS)으로 점검한다
 * — 사전을 못 읽었다고 점검을 건너뛰지 않기 위해서.
 */
import { DEFAULT_TERMS, patternError, type ClaimKind, type ClaimTerm } from "./claims";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
let cache: { at: number; terms: ClaimTerm[] } | null = null;

export async function loadClaimTerms(sb: Sb): Promise<ClaimTerm[]> {
  if (cache && Date.now() - cache.at < 60e3) return cache.terms;
  const { data, error } = await sb.from("partner_claim_terms").select("pattern, kind, suggest").eq("is_active", true).order("sort").limit(500);
  // ds-allow: 사전을 못 읽으면 기본 사전으로 점검을 이어 간다 (점검을 건너뛰지 않는다)
  const rows = error ? [] : ((data || []) as { pattern: string; kind: ClaimKind; suggest: string | null }[]).filter((t) => !patternError(t.pattern));
  const terms = rows.length ? rows : DEFAULT_TERMS;
  cache = { at: Date.now(), terms };
  return terms;
}

/** 관리자가 사전을 바꾼 뒤 바로 반영되게 */
export function clearClaimTerms() { cache = null; }
