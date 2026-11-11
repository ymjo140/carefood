import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getActorId } from "@/lib/actor-server";
import { loadFeedback } from "@/lib/recommend";
import { cleanTastes } from "@/lib/recommend/taste";

/**
 * POST /api/recommend/taste { tastes } — 고른 입맛(1~10)을 내 맛 평가로 맞춘 값
 *   제품 상세의 적합도가 홈·탐색 목록과 같게 나오도록 (feedback.ts 와 같은 계산)
 * 응답: { tastes, samples } — samples 는 보정에 쓴 평가 수
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const t = cleanTastes(body?.tastes);
  const base = { salty: t.salty ?? 0, sweet: t.sweet ?? 0, spicy: t.spicy ?? 0, fatty: t.fatty ?? 0 };
  const actor = await getActorId();
  if (!actor) return NextResponse.json({ tastes: base, samples: 0 });
  try {
    const fb = await loadFeedback(createServiceRoleClient(), actor, base);
    return NextResponse.json({ tastes: { ...base, ...fb.learned }, samples: fb.samples });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
