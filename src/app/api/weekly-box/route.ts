import { NextRequest, NextResponse } from "next/server";
import { getActorId } from "@/lib/actor-server";
import { buildWeeklyBox, type WeeklyBoxRequest } from "@/lib/weekly-box-server";

/**
 * POST /api/weekly-box — 주간 식단 추천 (영양사 방식, lib/weekly-box-server.ts)
 * 끼니별 역할 · 카테고리 분산 · 같은 제품 반복 금지 · 일별 영양 균형 · 관심사·질환·맛 개인화
 */
export async function POST(request: NextRequest) {
  try {
    const body: WeeklyBoxRequest = await request.json();
    return NextResponse.json(await buildWeeklyBox(body, await getActorId()));
  } catch (err) {
    console.error("Weekly box API error:", err);
    return NextResponse.json({ error: "주간 박스 생성 중 오류가 발생했습니다." }, { status: 500 });
  }
}
